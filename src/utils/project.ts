/**
 * Project detection utilities
 * 
 * Detects project identity from git repo or filesystem path.
 * Handles git worktrees by finding the main repository.
 */

import { execSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'

export interface ProjectInfo {
  /** Unique resource ID for this project (used for thread grouping) */
  resourceId: string
  /** Human-readable project name */
  name: string
  /** Absolute path to the project root */
  rootPath: string
  /** Git remote URL if available */
  gitUrl?: string
  /** Current git branch */
  gitBranch?: string
  /** Whether this is a git worktree */
  isWorktree: boolean
  /** Path to main git repo (different from rootPath if worktree) */
  mainRepoPath?: string
}

/**
 * Run a git command and return stdout, or undefined if it fails
 */
function git(args: string, cwd: string): string | undefined {
  try {
    return execSync(`git ${args}`, { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()
  } catch {
    return undefined
  }
}

/**
 * Slugify a string for use in IDs
 */
function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * Create a short hash of a string
 */
function shortHash(str: string): string {
  return createHash('sha256').update(str).digest('hex').slice(0, 12)
}

/**
 * Normalize a git URL to a canonical form for comparison
 * - Removes .git suffix
 * - Converts SSH to HTTPS format for consistency
 * - Lowercases
 */
function normalizeGitUrl(url: string): string {
  return url
    .replace(/\.git$/, '')
    .replace(/^git@([^:]+):/, 'https://$1/')
    .replace(/^ssh:\/\/git@/, 'https://')
    .toLowerCase()
}

/**
 * Detect project info from a directory path
 */
export function detectProject(projectPath: string): ProjectInfo {
  const absolutePath = path.resolve(projectPath)
  
  // Check if this is a git repo
  const gitDir = git('rev-parse --git-dir', absolutePath)
  const isGitRepo = gitDir !== undefined
  
  let rootPath = absolutePath
  let gitUrl: string | undefined
  let gitBranch: string | undefined
  let isWorktree = false
  let mainRepoPath: string | undefined
  
  if (isGitRepo) {
    // Get the repo root (handles being in a subdirectory)
    rootPath = git('rev-parse --show-toplevel', absolutePath) || absolutePath
    
    // Check for worktree - git-common-dir differs from git-dir in worktrees
    const commonDir = git('rev-parse --git-common-dir', absolutePath)
    if (commonDir && commonDir !== '.git' && commonDir !== gitDir) {
      isWorktree = true
      // The common dir is inside the main repo's .git folder
      mainRepoPath = path.dirname(path.resolve(rootPath, commonDir))
    }
    
    // Get remote URL (prefer origin, fall back to first remote)
    gitUrl = git('remote get-url origin', absolutePath)
    if (!gitUrl) {
      const remotes = git('remote', absolutePath)
      if (remotes) {
        const firstRemote = remotes.split('\n')[0]
        if (firstRemote) {
          gitUrl = git(`remote get-url ${firstRemote}`, absolutePath)
        }
      }
    }
    
    // Get current branch
    gitBranch = git('rev-parse --abbrev-ref HEAD', absolutePath)
  }
  
  // Generate resource ID
  // Priority: normalized git URL > main repo path (for worktrees) > absolute path
  let resourceIdSource: string
  if (gitUrl) {
    resourceIdSource = normalizeGitUrl(gitUrl)
  } else if (mainRepoPath) {
    resourceIdSource = mainRepoPath
  } else {
    resourceIdSource = rootPath
  }
  
  // Create a readable but unique resource ID
  // Format: slugified-name-shorthash
  const baseName = gitUrl 
    ? gitUrl.split('/').pop()?.replace(/\.git$/, '') || 'project'
    : path.basename(rootPath)
  
  const resourceId = `${slugify(baseName)}-${shortHash(resourceIdSource)}`
  
  return {
    resourceId,
    name: baseName,
    rootPath,
    gitUrl,
    gitBranch,
    isWorktree,
    mainRepoPath,
  }
}

/**
 * Get the application data directory for mastra-code
 * - macOS: ~/Library/Application Support/mastra-code
 * - Linux: ~/.local/share/mastra-code
 * - Windows: %APPDATA%/mastra-code
 */
export function getAppDataDir(): string {
  const platform = os.platform()
  let baseDir: string
  
  if (platform === 'darwin') {
    baseDir = path.join(os.homedir(), 'Library', 'Application Support')
  } else if (platform === 'win32') {
    baseDir = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
  } else {
    // Linux and others - follow XDG spec
    baseDir = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share')
  }
  
  const appDir = path.join(baseDir, 'mastra-code')
  
  // Ensure directory exists
  if (!fs.existsSync(appDir)) {
    fs.mkdirSync(appDir, { recursive: true })
  }
  
  return appDir
}

/**
 * Get the database path for mastra-code
 * Can be overridden with the MASTRA_DB_PATH environment variable for debugging.
 */
export function getDatabasePath(): string {
  if (process.env.MASTRA_DB_PATH) {
    return process.env.MASTRA_DB_PATH
  }
  return path.join(getAppDataDir(), 'mastra.db')
}

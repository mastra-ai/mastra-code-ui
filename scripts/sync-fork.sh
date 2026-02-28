#!/usr/bin/env bash
set -euo pipefail

# Sync local main with upstream/main and push to origin/main.
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

git fetch upstream
git checkout main
git merge --ff-only upstream/main
git push origin main

echo "Sync complete: origin/main == upstream/main"

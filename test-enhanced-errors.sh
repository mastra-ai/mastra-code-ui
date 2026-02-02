#!/bin/bash

# Quick test script for enhanced error display
# This will generate various errors to test the display

echo "Testing Enhanced Error Display in Mastra Code"
echo "============================================"
echo
echo "This script will generate various errors to test the enhanced error display."
echo "Make sure Mastra Code is running before executing these commands."
echo
echo "Test these commands in Mastra Code:"
echo

# Simple error with stack trace
echo "1. Simple error with stack trace:"
echo "   execute_command node test/test-error-scenarios.js 1"
echo

# TypeError with nested calls
echo "2. TypeError with nested calls:"
echo "   execute_command node test/test-error-scenarios.js 2"
echo

# File not found
echo "3. File not found error:"
echo "   view /nonexistent/file.txt"
echo

# Invalid file edit
echo "4. File edit error (text not found):"
echo "   string_replace_lsp package.json \"this does not exist\" \"replacement\""
echo

# Command not found
echo "5. Command not found:"
echo "   execute_command nonexistentcommand"
echo

# JSON parse error
echo "6. JSON parse error:"
echo "   execute_command node test/test-error-scenarios.js 6"
echo

# TypeScript errors
echo "7. TypeScript file with errors:"
echo "   view test/syntax-error.ts"
echo

echo
echo "After testing, you can clean up with:"
echo "   rm -rf test/ test-enhanced-errors.sh"
echo
echo "Look for:"
echo "- Red error boxes with dark background"
echo "- Collapsible stack traces"
echo "- Syntax highlighting (function names in blue, line numbers in yellow)"
echo "- File paths in gray"
echo "- Error type prominently displayed"
echo "- ✗ indicator for errors"
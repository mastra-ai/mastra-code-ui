# Enhanced Error Display Component

The enhanced error display component provides a more user-friendly way to view errors in the Mastra Code TUI. It includes:

## Features

1. **Structured Error Display**
   - Error type/name displayed prominently
   - Clear error message
   - File location with line and column numbers

2. **Collapsible Stack Traces**
   - Stack traces are collapsible to save screen space
   - Automatically expanded for errors
   - Syntax highlighting for better readability

3. **Code Context** (when available)
   - Shows the code around the error location
   - Highlights the specific line where the error occurred
   - Displays line numbers for easy reference

4. **Smart Error Parsing**
   - Automatically extracts error information from various formats
   - Handles both Error objects and string errors
   - Parses stack traces to find file locations

## Implementation

The component is integrated into the tool execution display:

- **Generic tools**: Errors are displayed with the enhanced component
- **Execute command**: Command errors show with full stack traces
- **File operations**: Edit errors show with enhanced formatting

## Visual Design

- Error box with dark red background for visibility
- Color-coded elements:
  - Red for error messages and indicators
  - Gray for file paths
  - Yellow for line numbers
  - Blue for function names
- Rounded borders for the error box
- Proper spacing and indentation

## Usage

The enhanced error display is automatically used when:

1. A tool execution results in an error
2. Command execution fails
3. File operations encounter errors

The component will:

- Parse the error to extract useful information
- Display it in a structured, readable format
- Allow collapsing/expanding of stack traces
- Show code context when available

## Future Enhancements

- Integration with source maps for TypeScript errors
- Click-to-open file locations
- Error categorization and filtering
- Copy error details to clipboard

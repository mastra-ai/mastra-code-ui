# AST Smart Edit Tool Guide

The AST Smart Edit tool provides intelligent, syntax-aware code transformations using Abstract Syntax Tree (AST) analysis. Unlike simple text replacement, it understands code structure and can perform complex refactoring operations safely.

## Features

### 1. Pattern-Based Replacement
Use metavariables (e.g., `$ARG`, `$FUNC`, `$VAR`) to capture and transform code patterns:

```typescript
// Replace console.log with a custom logger
{
    pattern: 'console.log($ARG)',
    replacement: 'logger.debug($ARG)'
}

// Transform error handling
{
    pattern: 'console.error($MSG, $DATA)',
    replacement: 'logger.error({ message: $MSG, data: $DATA })'
}
```

### 2. Function Renaming
Rename functions and update all references automatically:

```typescript
{
    transform: 'rename-function',
    targetName: 'oldFunctionName',
    newName: 'newFunctionName'
}
```

### 3. Variable Renaming
Rename variables with scope awareness:

```typescript
{
    transform: 'rename-variable',
    targetName: 'oldVarName',
    newName: 'newVarName'
}
```

### 4. Import Management
Add imports intelligently:

```typescript
// Default import
{
    transform: 'add-import',
    importSpec: {
        module: './logger',
        names: ['logger'],
        isDefault: true
    }
}

// Named imports
{
    transform: 'add-import',
    importSpec: {
        module: 'react',
        names: ['useState', 'useEffect'],
        isDefault: false
    }
}
```

### 5. Remove Imports
Remove specific imports:

```typescript
{
    transform: 'remove-import',
    targetName: 'unused-module'
}
```

## Pattern Syntax

### Metavariables
- `$NAME` - Captures any identifier (variable, function name, etc.)
- `$ARG`, `$ARGS` - Captures function arguments
- `$BODY` - Captures block statements
- `$EXPR` - Captures expressions
- `$VALUE` - Captures values
- `$PARAMS` - Captures parameter lists
- Any `$IDENTIFIER` - Creates a named capture group

### Examples

#### Transform async/await to promises:
```typescript
{
    pattern: 'await $PROMISE',
    replacement: '$PROMISE.then(result =>'
}
```

#### Add error handling:
```typescript
{
    pattern: '$FUNC($ARGS)',
    replacement: `try {
    $FUNC($ARGS)
} catch (error) {
    console.error('Error in $FUNC:', error);
}`
}
```

#### Convert CommonJS to ES modules:
```typescript
{
    pattern: 'const $VAR = require($MODULE)',
    replacement: 'import $VAR from $MODULE'
}
```

## Advanced Usage

### Bulk Transformations
Process multiple files with the same transformation:

```typescript
const files = ['src/utils/*.ts', 'src/components/*.tsx'];

for (const file of files) {
    await astSmartEditTool.execute({
        path: file,
        pattern: 'console.log($ARG)',
        replacement: 'logger.info($ARG)'
    });
}
```

### Chained Transformations
Apply multiple transformations in sequence:

```typescript
// Step 1: Add import
await astSmartEditTool.execute({
    path: 'myfile.ts',
    transform: 'add-import',
    importSpec: { module: './logger', names: ['logger'], isDefault: true }
});

// Step 2: Replace console calls
await astSmartEditTool.execute({
    path: 'myfile.ts',
    pattern: 'console.log($ARG)',
    replacement: 'logger.info($ARG)'
});
```

### Conditional Transformations
Use selectors to find specific patterns before transforming:

```typescript
// First, check if pattern exists
const result = await astSmartEditTool.execute({
    path: 'myfile.ts',
    selector: 'console.log'
});

if (result.matches > 0) {
    // Then apply transformation
    await astSmartEditTool.execute({
        path: 'myfile.ts',
        pattern: 'console.log($ARG)',
        replacement: 'logger.debug($ARG)'
    });
}
```

## Best Practices

1. **Test First**: Always test transformations on a single file before bulk operations
2. **Use Version Control**: Commit before major refactoring operations
3. **Be Specific**: Use specific patterns to avoid unintended matches
4. **Verify Results**: Check the transformation results, especially for complex patterns
5. **Incremental Changes**: Apply transformations incrementally rather than all at once

## Limitations

1. **Language Support**: Currently supports TypeScript, JavaScript, HTML, and CSS
2. **Complex Patterns**: Some very complex patterns may require multiple passes
3. **Semantic Analysis**: The tool performs syntactic analysis, not full semantic analysis
4. **Formatting**: May need to run a formatter after transformations

## Error Handling

The tool provides detailed error information:

```typescript
const result = await astSmartEditTool.execute({
    path: 'myfile.ts',
    pattern: 'invalid pattern here'
});

if (result.error) {
    console.error('Transformation failed:', result.error);
    console.error('Stack trace:', result.stack);
}
```

## Integration with Mastra Code

The AST Smart Edit tool is integrated into Mastra Code and can be used alongside other tools for comprehensive code refactoring workflows.
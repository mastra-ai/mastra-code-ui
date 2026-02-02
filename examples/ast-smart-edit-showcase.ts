// Advanced AST Smart Edit Tool Examples
// This file demonstrates various intelligent code transformations

import { astSmartEditTool } from '../src/tools/ast-smart-edit.js';

async function demonstrateAdvancedPatterns() {
    console.log('🚀 Advanced AST Smart Edit Patterns\n');
    
    // Example 1: Transform async/await to .then() chains
    console.log('Example 1: Transform async/await patterns');
    console.log('-----------------------------------------');
    await astSmartEditTool.execute({
        path: 'examples/sample-async.ts',
        pattern: 'await $PROMISE',
        replacement: '$PROMISE.then(result =>'
    });
    
    // Example 2: Add error handling to function calls
    console.log('\nExample 2: Wrap function calls with try-catch');
    console.log('---------------------------------------------');
    await astSmartEditTool.execute({
        path: 'examples/sample-calls.ts',
        pattern: '$FUNC($ARGS)',
        replacement: `try {
    $FUNC($ARGS)
} catch (error) {
    console.error('Error in $FUNC:', error);
}`
    });
    
    // Example 3: Convert require to import
    console.log('\nExample 3: Convert CommonJS to ES modules');
    console.log('-----------------------------------------');
    await astSmartEditTool.execute({
        path: 'examples/sample-commonjs.js',
        pattern: 'const $VAR = require($MODULE)',
        replacement: 'import $VAR from $MODULE'
    });
    
    // Example 4: Add JSDoc comments to functions
    console.log('\nExample 4: Add JSDoc to functions');
    console.log('---------------------------------');
    await astSmartEditTool.execute({
        path: 'examples/sample-functions.ts',
        pattern: 'function $NAME($PARAMS) { $BODY }',
        replacement: `/**
 * TODO: Add description for $NAME
 * @param {any} $PARAMS - TODO: Document parameters
 * @returns {any} TODO: Document return value
 */
function $NAME($PARAMS) { $BODY }`
    });
    
    // Example 5: Transform object property access
    console.log('\nExample 5: Use optional chaining');
    console.log('---------------------------------');
    await astSmartEditTool.execute({
        path: 'examples/sample-objects.ts',
        pattern: '$OBJ.$PROP',
        replacement: '$OBJ?.$PROP'
    });
    
    // Example 6: Extract magic numbers to constants
    console.log('\nExample 6: Extract magic numbers');
    console.log('--------------------------------');
    // This would need a more sophisticated approach, but here's a simple example
    await astSmartEditTool.execute({
        path: 'examples/sample-numbers.ts',
        pattern: 'timeout: 5000',
        replacement: 'timeout: TIMEOUT_MS'
    });
    
    // Example 7: Transform callback patterns to promises
    console.log('\nExample 7: Promisify callbacks');
    console.log('-------------------------------');
    await astSmartEditTool.execute({
        path: 'examples/sample-callbacks.js',
        pattern: '$FUNC($ARGS, function(err, $DATA) { $BODY })',
        replacement: `new Promise((resolve, reject) => {
    $FUNC($ARGS, (err, $DATA) => {
        if (err) reject(err);
        else { $BODY }
    });
})`
    });
}

// Utility functions for complex transformations

async function addTypeAnnotations(filePath: string) {
    // Add type annotations to function parameters
    await astSmartEditTool.execute({
        path: filePath,
        pattern: 'function $NAME($PARAM)',
        replacement: 'function $NAME($PARAM: any)'
    });
}

async function convertToArrowFunctions(filePath: string) {
    // Convert function expressions to arrow functions
    await astSmartEditTool.execute({
        path: filePath,
        pattern: 'function($PARAMS) { return $EXPR; }',
        replacement: '($PARAMS) => $EXPR'
    });
}

async function addLoggingToFunctions(filePath: string, functionName: string) {
    // Add entry/exit logging to specific functions
    await astSmartEditTool.execute({
        path: filePath,
        pattern: `function ${functionName}($PARAMS) { $BODY }`,
        replacement: `function ${functionName}($PARAMS) {
    console.log('Entering ${functionName}', { $PARAMS });
    try {
        $BODY
    } finally {
        console.log('Exiting ${functionName}');
    }
}`
    });
}

async function refactorConditionals(filePath: string) {
    // Convert if-else to ternary for simple cases
    await astSmartEditTool.execute({
        path: filePath,
        pattern: 'if ($COND) { $TRUE } else { $FALSE }',
        replacement: '$COND ? $TRUE : $FALSE'
    });
}

// Example: Bulk transformations across multiple files
async function refactorProject() {
    const files = [
        'src/utils/helpers.ts',
        'src/components/Button.tsx',
        'src/services/api.ts'
    ];
    
    for (const file of files) {
        console.log(`\nRefactoring ${file}...`);
        
        // 1. Replace console.log with logger
        await astSmartEditTool.execute({
            path: file,
            pattern: 'console.log($ARG)',
            replacement: 'logger.info($ARG)'
        });
        
        // 2. Add optional chaining
        await astSmartEditTool.execute({
            path: file,
            pattern: '$OBJ.data.$PROP',
            replacement: '$OBJ?.data?.$PROP'
        });
        
        // 3. Convert var to const/let
        await astSmartEditTool.execute({
            path: file,
            pattern: 'var $NAME = $VALUE',
            replacement: 'const $NAME = $VALUE'
        });
    }
}

// Export for use in other scripts
export {
    demonstrateAdvancedPatterns,
    addTypeAnnotations,
    convertToArrowFunctions,
    addLoggingToFunctions,
    refactorConditionals,
    refactorProject
};
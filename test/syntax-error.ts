// Test file with various syntax errors for testing error display

interface User {
    id: number;
    name: string;
    email: string;
}

// Missing closing brace
function processUser(user: User {
    console.log(user.name);
    return user.id;
}

// Type error
const user: User = {
    id: "123", // Should be number
    name: "John",
    // Missing required property: email
};

// Undefined variable
console.log(undefinedVariable);

// Invalid syntax
const result = 10 +* 5;

export { processUser };
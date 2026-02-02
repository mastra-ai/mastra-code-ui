#!/usr/bin/env node

/**
 * Test scenarios for the enhanced error display
 * Run with: node test/test-error-scenarios.js [scenario]
 */

const scenario = process.argv[2] || '1';

switch (scenario) {
  case '1':
    // Simple error with stack trace
    console.log("Scenario 1: Simple error with stack trace");
    function connectToDatabase() {
      throw new Error("Connection refused: Unable to connect to PostgreSQL at localhost:5432");
    }
    function initializeApp() {
      console.log("Initializing application...");
      connectToDatabase();
    }
    initializeApp();
    break;

  case '2':
    // TypeError with deep stack
    console.log("Scenario 2: TypeError with nested calls");
    function processUser(user) {
      return user.profile.settings.theme; // user is null
    }
    function renderDashboard() {
      const user = null;
      const theme = processUser(user);
      console.log("Theme:", theme);
    }
    function handleRequest() {
      renderDashboard();
    }
    handleRequest();
    break;

  case '3':
    // ReferenceError
    console.log("Scenario 3: ReferenceError");
    function calculateTotal() {
      return price * quantity; // variables not defined
    }
    console.log("Total:", calculateTotal());
    break;

  case '4':
    // Custom error with additional properties
    console.log("Scenario 4: Custom error with code");
    class ValidationError extends Error {
      constructor(message, field, code) {
        super(message);
        this.name = 'ValidationError';
        this.field = field;
        this.code = code;
      }
    }
    throw new ValidationError(
      "Email format is invalid: missing @ symbol",
      "email",
      "INVALID_EMAIL_FORMAT"
    );
    break;

  case '5':
    // Async error
    console.log("Scenario 5: Async operation error");
    async function fetchUserData() {
      await new Promise(resolve => setTimeout(resolve, 100));
      throw new Error("API request failed: 404 Not Found - User with ID 12345 does not exist");
    }
    fetchUserData().catch(err => {
      console.error("Async error caught!");
      throw err;
    });
    break;

  case '6':
    // JSON parse error
    console.log("Scenario 6: JSON parsing error");
    const invalidJson = '{"name": "John", "age": 30, invalid}';
    try {
      JSON.parse(invalidJson);
    } catch (error) {
      console.error("Failed to parse configuration file");
      throw error;
    }
    break;

  case '7':
    // File system error simulation
    console.log("Scenario 7: File system error");
    const fs = require('fs');
    try {
      fs.readFileSync('/path/to/nonexistent/file.txt');
    } catch (error) {
      error.message = `Cannot read file: ${error.message}`;
      throw error;
    }
    break;

  case '8':
    // Command timeout simulation
    console.log("Scenario 8: Command timeout");
    setTimeout(() => {
      throw new Error("Command timed out after 30 seconds: npm install");
    }, 100);
    // Keep process alive
    setTimeout(() => {}, 200);
    break;

  default:
    console.log("Available scenarios:");
    console.log("1 - Simple error with stack trace");
    console.log("2 - TypeError with nested calls");
    console.log("3 - ReferenceError");
    console.log("4 - Custom error with additional properties");
    console.log("5 - Async operation error");
    console.log("6 - JSON parsing error");
    console.log("7 - File system error");
    console.log("8 - Command timeout");
    console.log("\nUsage: node test-error-scenarios.js [scenario-number]");
}
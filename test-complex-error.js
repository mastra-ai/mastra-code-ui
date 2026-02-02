// Complex error test with deep stack trace

class DatabaseError extends Error {
    constructor(message, query) {
        super(message);
        this.name = 'DatabaseError';
        this.query = query;
    }
}

class ServiceError extends Error {
    constructor(message, statusCode) {
        super(message);
        this.name = 'ServiceError';
        this.statusCode = statusCode;
    }
}

async function connectToDB() {
    throw new DatabaseError(
        'Connection timeout: Failed to connect to database server at postgres://localhost:5432/myapp',
        'SELECT * FROM users WHERE id = ?'
    );
}

async function getUserById(userId) {
    try {
        await connectToDB();
    } catch (dbError) {
        throw new ServiceError(
            `Failed to fetch user ${userId}: ${dbError.message}`,
            500
        );
    }
}

async function handleUserRequest(req) {
    const userId = req.params.userId;
    try {
        const user = await getUserById(userId);
        return user;
    } catch (error) {
        console.error('Request failed:', error);
        throw error;
    }
}

async function processAPIRequest() {
    const mockRequest = { params: { userId: 12345 } };
    await handleUserRequest(mockRequest);
}

// Run it
processAPIRequest().catch(err => {
    console.error('\n=== FINAL ERROR ===');
    console.error(err);
    process.exit(1);
});
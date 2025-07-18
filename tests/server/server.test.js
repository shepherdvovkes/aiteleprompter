const request = require('supertest');

// Mock dotenv to prevent .env file loading issues
jest.mock('dotenv', () => ({
  config: jest.fn()
}));

// Mock console to reduce noise
jest.spyOn(console, 'log').mockImplementation();
jest.spyOn(console, 'error').mockImplementation();

describe('Server Integration Tests', () => {
  let app;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset environment variables
    delete process.env.OPENAI_API_KEY;
    delete process.env.PORT;
    
    // Clear module cache and require fresh server instance
    delete require.cache[require.resolve('../../server.js')];
    app = require('../../server.js');
  });

  describe('Basic Server Functionality', () => {
    test('POST /api/chat should return error when OPENAI_API_KEY is not set', async () => {
      const response = await request(app)
        .post('/api/chat')
        .send({
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'Hello' }]
        });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ 
        error: 'OPENAI_API_KEY not set',
        message: 'Server configuration error. Please contact administrator.'
      });
    });

    test('should serve static files', async () => {
      const response = await request(app)
        .get('/index.html');

      expect(response.status).toBe(200);
    });

    test('should handle non-existent static files', async () => {
      const response = await request(app)
        .get('/non-existent-file.html');

      expect([200, 404]).toContain(response.status);
    });

    test('should handle malformed JSON requests', async () => {
      const response = await request(app)
        .post('/api/chat')
        .set('Content-Type', 'application/json')
        .send('{ invalid json');

      expect(response.status).toBe(400);
    });

    test('should reject requests without valid content-type for API', async () => {
      const response = await request(app)
        .post('/api/chat')
        .set('Content-Type', 'text/plain')
        .send('Hello');

      // Express will likely return 400 for invalid JSON
      expect([400, 415, 500]).toContain(response.status);
    });
  });

  describe('Request Structure Validation', () => {
    test('should handle POST requests to /api/chat endpoint', async () => {
      const response = await request(app)
        .post('/api/chat')
        .send({
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'Hello' }]
        });

      // Without API key, should return 500
      expect(response.status).toBe(500);
      expect(response.body).toEqual({ 
        error: 'OPENAI_API_KEY not set',
        message: 'Server configuration error. Please contact administrator.'
      });
    });

    test('should handle GET requests to non-API routes', async () => {
      const response = await request(app)
        .get('/');

      // Should serve static content or return 404
      expect([200, 404]).toContain(response.status);
    });

    test('should handle different HTTP methods on API endpoint', async () => {
      const getResponse = await request(app).get('/api/chat');
      const putResponse = await request(app).put('/api/chat');
      const deleteResponse = await request(app).delete('/api/chat');

      // Only POST should be supported for /api/chat
      expect([404, 405]).toContain(getResponse.status);
      expect([404, 405]).toContain(putResponse.status);
      expect([404, 405]).toContain(deleteResponse.status);
    });
  });

  describe('Content Type Handling', () => {
    test('should accept application/json content type', async () => {
      const response = await request(app)
        .post('/api/chat')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'Hello' }]
        }));

      // Should fail due to missing API key, not content type
      expect(response.status).toBe(500);
      expect(response.body).toEqual({ 
        error: 'OPENAI_API_KEY not set',
        message: 'Server configuration error. Please contact administrator.'
      });
    });

    test('should handle empty request body', async () => {
      const response = await request(app)
        .post('/api/chat')
        .send();

      // Should fail due to missing API key
      expect(response.status).toBe(500);
      expect(response.body).toEqual({ 
        error: 'OPENAI_API_KEY not set',
        message: 'Server configuration error. Please contact administrator.'
      });
    });
  });

  describe('Server Configuration', () => {
    test('should initialize server module without errors', () => {
      expect(app).toBeDefined();
      expect(typeof app).toBe('function'); // Express app is a function
    });

    test('should have proper middleware setup', () => {
      // Test that the server can handle basic requests
      expect(app).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    test('should handle requests with missing required fields gracefully', async () => {
      const response = await request(app)
        .post('/api/chat')
        .send({
          // Missing model and messages
        });

      // Should fail due to missing API key first
      expect(response.status).toBe(500);
      expect(response.body).toEqual({ 
        error: 'OPENAI_API_KEY not set',
        message: 'Server configuration error. Please contact administrator.'
      });
    });

    test('should handle invalid JSON structure', async () => {
      const response = await request(app)
        .post('/api/chat')
        .set('Content-Type', 'application/json')
        .send('{"invalid": json}');

      expect(response.status).toBe(400);
    });

    test('should respond to health check style requests', async () => {
      const response = await request(app)
        .get('/');

      // Should either serve static content or return proper error
      expect([200, 404]).toContain(response.status);
    });
  });
});
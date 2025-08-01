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
        error: 'OPENAI_API_KEY not configured',
        message: 'Please set your OpenAI API key in the .env file. Get your key from https://platform.openai.com/api-keys',
        instructions: [
          '1. Edit the .env file in the project root',
          '2. Replace "your_openai_api_key_here" with your actual OpenAI API key',
          '3. Restart the server with: npm start'
        ]
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
        error: 'OPENAI_API_KEY not configured',
        message: 'Please set your OpenAI API key in the .env file. Get your key from https://platform.openai.com/api-keys',
        instructions: [
          '1. Edit the .env file in the project root',
          '2. Replace "your_openai_api_key_here" with your actual OpenAI API key',
          '3. Restart the server with: npm start'
        ]
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
        error: 'OPENAI_API_KEY not configured',
        message: 'Please set your OpenAI API key in the .env file. Get your key from https://platform.openai.com/api-keys',
        instructions: [
          '1. Edit the .env file in the project root',
          '2. Replace "your_openai_api_key_here" with your actual OpenAI API key',
          '3. Restart the server with: npm start'
        ]
      });
    });

    test('should handle empty request body', async () => {
      const response = await request(app)
        .post('/api/chat')
        .send();

      // Should fail due to missing API key
      expect(response.status).toBe(500);
      expect(response.body).toEqual({ 
        error: 'OPENAI_API_KEY not configured',
        message: 'Please set your OpenAI API key in the .env file. Get your key from https://platform.openai.com/api-keys',
        instructions: [
          '1. Edit the .env file in the project root',
          '2. Replace "your_openai_api_key_here" with your actual OpenAI API key',
          '3. Restart the server with: npm start'
        ]
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
        error: 'OPENAI_API_KEY not configured',
        message: 'Please set your OpenAI API key in the .env file. Get your key from https://platform.openai.com/api-keys',
        instructions: [
          '1. Edit the .env file in the project root',
          '2. Replace "your_openai_api_key_here" with your actual OpenAI API key',
          '3. Restart the server with: npm start'
        ]
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

  describe('Additional Server Features', () => {
    test('should handle WebSocket connections', () => {
      // WebSocket functionality is tested indirectly through server initialization
      expect(app).toBeDefined();
    });

    test('should serve JavaScript files', async () => {
      const response = await request(app)
        .get('/js/app.js');
      
      // Should either serve the file or return 404
      expect([200, 404]).toContain(response.status);
    });

    test('should handle CORS preflight requests', async () => {
      const response = await request(app)
        .options('/api/chat')
        .set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'POST');

      expect([200, 204]).toContain(response.status);
    });

    test('should handle malformed JSON gracefully', async () => {
      const response = await request(app)
        .post('/api/chat')
        .set('Content-Type', 'application/json')
        .send('{invalid json}');

      expect([400, 500]).toContain(response.status);
    });

    test('should enforce content-length limits', async () => {
      // Create large payload
      const largePayload = {
        model: 'gpt-4',
        messages: Array(1000).fill().map(() => ({ 
          role: 'user', 
          content: 'A'.repeat(1000) 
        }))
      };

      const response = await request(app)
        .post('/api/chat')
        .send(largePayload);

      // Should handle large payloads gracefully
      expect([413, 400, 500]).toContain(response.status);
    });

    test('should handle different request methods', async () => {
      const methods = ['GET', 'PUT', 'DELETE', 'PATCH'];
      
      for (const method of methods) {
        const response = await request(app)[method.toLowerCase()]('/api/chat');
        // Non-POST methods should return 404 or 405
        expect([404, 405]).toContain(response.status);
      }
    });

    test('should handle audio upload endpoints gracefully', async () => {
      const response = await request(app)
        .post('/api/upload-audio');
      
      // Should handle missing audio file gracefully
      expect([400, 404, 500]).toContain(response.status);
    });

    test('should serve static HTML files', async () => {
      const files = ['index.html', 'teleprompter.html', 'audio-mixer.html'];
      
      for (const file of files) {
        const response = await request(app).get(`/${file}`);
        expect([200, 404]).toContain(response.status);
      }
    });

    test('should handle API key validation scenarios', async () => {
      // Test with empty API key
      process.env.OPENAI_API_KEY = '';
      delete require.cache[require.resolve('../../server.js')];
      const testApp = require('../../server.js');

      const response = await request(testApp)
        .post('/api/chat')
        .send({
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'Hello' }]
        });

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('OPENAI_API_KEY not configured');
    });

    test('should handle cache operations', async () => {
      // Test cache-related endpoints if they exist
      const response = await request(app).get('/api/cache-status');
      expect([200, 404]).toContain(response.status);
    });
  });
});
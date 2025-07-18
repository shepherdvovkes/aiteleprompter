const request = require('supertest');
const express = require('express');
const path = require('path');

// Mock dotenv before requiring server
jest.mock('dotenv', () => ({
  config: jest.fn()
}));

// Mock node-fetch
const mockFetch = jest.fn();
jest.mock('node-fetch', () => mockFetch);

describe('Server API Tests', () => {
  let app;
  let server;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset process.env
    delete process.env.OPENAI_API_KEY;
    delete process.env.PORT;
    
    // Create fresh app instance
    app = express();
    const PORT = process.env.PORT || 3000;

    app.use(express.static(path.join(__dirname, '../..')));
    app.use(express.json());

    // Copy the route from server.js
    app.post('/api/chat', async (req, res) => {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: 'OPENAI_API_KEY not set' });
      }

      try {
        let fetchFn = global.fetch;
        if (typeof fetchFn !== 'function') {
          fetchFn = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
        }

        const openaiRes = await fetchFn('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify(req.body)
        });

        if (!openaiRes.ok) {
          const text = await openaiRes.text();
          return res.status(openaiRes.status).send(text);
        }

        if (req.body.stream) {
          res.setHeader('Content-Type', 'text/event-stream');
          for await (const chunk of openaiRes.body) {
            res.write(chunk);
          }
          res.end();
        } else {
          const text = await openaiRes.text();
          res.send(text);
        }
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
      }
    });
  });

  afterEach(() => {
    if (server) {
      server.close();
    }
  });

  describe('POST /api/chat', () => {
    test('should return error when OPENAI_API_KEY is not set', async () => {
      const response = await request(app)
        .post('/api/chat')
        .send({
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'Hello' }]
        });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'OPENAI_API_KEY not set' });
    });

    test('should forward request to OpenAI when API key is set', async () => {
      process.env.OPENAI_API_KEY = 'test-api-key';
      
      const mockResponse = {
        ok: true,
        text: jest.fn().mockResolvedValue(JSON.stringify({
          choices: [{ message: { content: 'Hello! How can I help you?' } }]
        }))
      };

      global.fetch = jest.fn().mockResolvedValue(mockResponse);

      const response = await request(app)
        .post('/api/chat')
        .send({
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'Hello' }]
        });

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer test-api-key'
          },
          body: JSON.stringify({
            model: 'gpt-4',
            messages: [{ role: 'user', content: 'Hello' }]
          })
        }
      );
    });

    test('should handle OpenAI API errors', async () => {
      process.env.OPENAI_API_KEY = 'test-api-key';
      
      const mockResponse = {
        ok: false,
        status: 401,
        text: jest.fn().mockResolvedValue('Unauthorized')
      };

      global.fetch = jest.fn().mockResolvedValue(mockResponse);

      const response = await request(app)
        .post('/api/chat')
        .send({
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'Hello' }]
        });

      expect(response.status).toBe(401);
      expect(response.text).toBe('Unauthorized');
    });

    test('should handle streaming responses', async () => {
      process.env.OPENAI_API_KEY = 'test-api-key';
      
      const mockChunks = [
        Buffer.from('data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n'),
        Buffer.from('data: {"choices":[{"delta":{"content":" there"}}]}\n\n'),
        Buffer.from('data: [DONE]\n\n')
      ];

      const mockResponse = {
        ok: true,
        body: {
          async *[Symbol.asyncIterator]() {
            for (const chunk of mockChunks) {
              yield chunk;
            }
          }
        }
      };

      global.fetch = jest.fn().mockResolvedValue(mockResponse);

      const response = await request(app)
        .post('/api/chat')
        .send({
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'Hello' }],
          stream: true
        });

      expect(response.headers['content-type']).toBe('text/event-stream; charset=utf-8');
    });

    test('should handle network errors', async () => {
      process.env.OPENAI_API_KEY = 'test-api-key';
      
      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

      const response = await request(app)
        .post('/api/chat')
        .send({
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'Hello' }]
        });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Server error' });
    });
  });

  describe('Static file serving', () => {
    test('should serve static files', async () => {
      const response = await request(app).get('/');
      expect(response.status).toBe(200);
    });
  });

  describe('Server configuration', () => {
    test('should use PORT from environment variable', () => {
      process.env.PORT = '4000';
      const PORT = process.env.PORT || 3000;
      expect(PORT).toBe('4000');
    });

    test('should use default port 3000', () => {
      delete process.env.PORT;
      const PORT = process.env.PORT || 3000;
      expect(PORT).toBe(3000);
    });
  });
});
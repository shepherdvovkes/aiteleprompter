const express = require('express');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

let fetchFn = global.fetch;
if (typeof fetchFn !== 'function') {
  fetchFn = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
}

const app = express();
const PORT = process.env.PORT || 3000;

// In-memory cache for frequent requests
const cache = new Map();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

// Middleware
app.use(express.static(path.join(__dirname)));
app.use(express.json({ limit: '10mb' }));

// Cache helper functions
function getCacheKey(body) {
  return JSON.stringify(body);
}

function isValidCacheEntry(timestamp) {
  return Date.now() - timestamp < CACHE_TTL;
}

// Enhanced OpenAI API endpoint with caching
app.post('/api/chat', async (req, res) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey === 'your_openai_api_key_here') {
    return res.status(500).json({ 
      error: 'OPENAI_API_KEY not configured',
      message: 'Please set your OpenAI API key in the .env file. Get your key from https://platform.openai.com/api-keys',
      instructions: [
        '1. Edit the .env file in the project root',
        '2. Replace "your_openai_api_key_here" with your actual OpenAI API key',
        '3. Restart the server with: npm start'
      ]
    });
  }

  try {
    // Check cache for non-streaming requests
    if (!req.body.stream) {
      const cacheKey = getCacheKey(req.body);
      const cached = cache.get(cacheKey);
      
      if (cached && isValidCacheEntry(cached.timestamp)) {
        console.log('Cache hit for request');
        return res.json(cached.response);
      }
    }

    const openaiRes = await fetchFn('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'User-Agent': 'AITeleprompter/1.0'
      },
      body: JSON.stringify({
        ...req.body,
        // Add default parameters for better reliability
        temperature: req.body.temperature || 0.7,
        max_tokens: req.body.max_tokens || 2000,
        presence_penalty: req.body.presence_penalty || 0,
        frequency_penalty: req.body.frequency_penalty || 0
      })
    });

    if (!openaiRes.ok) {
      const errorText = await openaiRes.text();
      let errorMessage = 'OpenAI API error';
      
      try {
        const errorData = JSON.parse(errorText);
        errorMessage = errorData.error?.message || errorMessage;
      } catch (e) {
        // Keep default message if JSON parsing fails
      }
      
      console.error(`OpenAI API error ${openaiRes.status}:`, errorMessage);
      return res.status(openaiRes.status).json({
        error: errorMessage,
        status: openaiRes.status
      });
    }

    if (req.body.stream) {
      // Handle streaming responses
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      
      for await (const chunk of openaiRes.body) {
        res.write(chunk);
      }
      res.end();
    } else {
      // Handle non-streaming responses
      const responseData = await openaiRes.json();
      
      // Cache successful responses
      if (responseData.choices && responseData.choices.length > 0) {
        const cacheKey = getCacheKey(req.body);
        cache.set(cacheKey, {
          response: responseData,
          timestamp: Date.now()
        });
        
        // Clean old cache entries periodically
        if (cache.size > 100) {
          for (const [key, value] of cache.entries()) {
            if (!isValidCacheEntry(value.timestamp)) {
              cache.delete(key);
            }
          }
        }
      }
      
      res.json(responseData);
    }
  } catch (err) {
    console.error('Server error:', err);
    res.status(500).json({ 
      error: 'Internal server error',
      message: 'An unexpected error occurred. Please try again.',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    cache_size: cache.size
  });
});

// Cache stats endpoint (for debugging)
app.get('/api/cache-stats', (req, res) => {
  res.json({
    size: cache.size,
    entries: Array.from(cache.keys()).length
  });
});

// Clear cache endpoint
app.post('/api/clear-cache', (req, res) => {
  cache.clear();
  res.json({ message: 'Cache cleared successfully' });
});

// Only start the server if this file is run directly (not required by tests)
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`Cache TTL: ${CACHE_TTL / 1000}s`);
  });
}

// Export the app for testing
module.exports = app;

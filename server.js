const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const multer = require('multer');
const cors = require('cors');
require('dotenv').config({ path: path.join(__dirname, '.env') });

let fetchFn = global.fetch;
if (typeof fetchFn !== 'function') {
  fetchFn = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
}

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const PORT = process.env.PORT || 3000;

// Audio mixer state
const audioMixer = {
  person1Stream: null, // Interviewer (VB Cable)
  person2Stream: null, // Interviewee (Microphone)
  clients: new Set(),
  isRecording: false
};

// In-memory cache for frequent requests
const cache = new Map();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

// Configure multer for audio uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// Middleware
app.use(cors());
app.use(express.static(path.join(__dirname)));
app.use(express.json({ limit: '10mb' }));

// WebSocket connection handling
wss.on('connection', (ws) => {
  console.log('Client connected to audio mixer');
  audioMixer.clients.add(ws);
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      handleAudioMessage(ws, data);
    } catch (err) {
      console.error('Invalid message format:', err);
    }
  });
  
  ws.on('close', () => {
    console.log('Client disconnected from audio mixer');
    audioMixer.clients.delete(ws);
  });
});

// Audio message handler
function handleAudioMessage(ws, data) {
  switch (data.type) {
    case 'audio-chunk':
      processAudioChunk(data);
      break;
    case 'start-recording':
      startAudioRecording();
      break;
    case 'stop-recording':
      stopAudioRecording();
      break;
    case 'set-person':
      setPersonType(ws, data.person);
      break;
  }
}

// Process audio chunks from different sources
function processAudioChunk(data) {
  const { person, audioData, timestamp } = data;
  
  // Broadcast to all connected clients with person identification
  const message = {
    type: 'audio-processed',
    person: person, // 'P1' or 'P2'
    audioData: audioData,
    timestamp: timestamp,
    source: person === 'P1' ? 'VB Cable (Interviewer)' : 'Microphone (Interviewee)'
  };
  
  broadcastToClients(message);
}

// Broadcast message to all connected clients
function broadcastToClients(message) {
  const messageStr = JSON.stringify(message);
  audioMixer.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(messageStr);
    }
  });
}

// Start audio recording
function startAudioRecording() {
  audioMixer.isRecording = true;
  console.log('Audio recording started');
  broadcastToClients({ type: 'recording-started' });
}

// Stop audio recording
function stopAudioRecording() {
  audioMixer.isRecording = false;
  console.log('Audio recording stopped');
  broadcastToClients({ type: 'recording-stopped' });
}

// Set person type for WebSocket connection
function setPersonType(ws, person) {
  ws.personType = person;
  console.log(`Client set as ${person}`);
}

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

// Audio mixer API endpoints

// Get audio mixer status
app.get('/api/audio/status', (req, res) => {
  res.json({
    isRecording: audioMixer.isRecording,
    connectedClients: audioMixer.clients.size,
    person1Active: audioMixer.person1Stream !== null,
    person2Active: audioMixer.person2Stream !== null
  });
});

// Start audio recording
app.post('/api/audio/start', (req, res) => {
  startAudioRecording();
  res.json({ message: 'Audio recording started', isRecording: true });
});

// Stop audio recording
app.post('/api/audio/stop', (req, res) => {
  stopAudioRecording();
  res.json({ message: 'Audio recording stopped', isRecording: false });
});

// Upload audio chunk from VB Cable (Person 1 - Interviewer)
app.post('/api/audio/upload/p1', upload.single('audio'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No audio file provided' });
  }
  
  const audioData = req.file.buffer.toString('base64');
  const timestamp = Date.now();
  
  processAudioChunk({
    person: 'P1',
    audioData: audioData,
    timestamp: timestamp
  });
  
  res.json({ 
    message: 'P1 audio processed', 
    person: 'P1',
    size: req.file.size,
    timestamp: timestamp
  });
});

// Upload audio chunk from Microphone (Person 2 - Interviewee)
app.post('/api/audio/upload/p2', upload.single('audio'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No audio file provided' });
  }
  
  const audioData = req.file.buffer.toString('base64');
  const timestamp = Date.now();
  
  processAudioChunk({
    person: 'P2',
    audioData: audioData,
    timestamp: timestamp
  });
  
  res.json({ 
    message: 'P2 audio processed', 
    person: 'P2',
    size: req.file.size,
    timestamp: timestamp
  });
});

// Get audio mixer configuration
app.get('/api/audio/config', (req, res) => {
  res.json({
    person1: {
      name: 'P1 (Interviewer)',
      source: 'VB Cable',
      description: 'Audio from Zoom/Google Meet via VB Cable',
      badge: 'P1'
    },
    person2: {
      name: 'P2 (Interviewee)', 
      source: 'Microphone',
      description: 'Direct microphone input',
      badge: 'P2'
    }
  });
});

// Only start the server if this file is run directly (not required by tests)
if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`WebSocket server running for audio mixer`);
    console.log(`Cache TTL: ${CACHE_TTL / 1000}s`);
  });
}

// Export the app for testing
module.exports = app;

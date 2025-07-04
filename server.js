const express = require('express');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

let fetchFn = global.fetch;
if (typeof fetchFn !== 'function') {
  fetchFn = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname)));
app.use(express.json());

app.post('/api/chat', async (req, res) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'OPENAI_API_KEY not set' });
  }

  try {
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

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

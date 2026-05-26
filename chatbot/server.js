import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// --- CORS ---
const allowedOrigins = process.env.ALLOWED_ORIGINS?.trim()
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim()).filter(Boolean)
  : '*';
app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

// --- Company config loader ---
function loadCompanies() {
  return JSON.parse(
    readFileSync(path.join(__dirname, 'config/companies.json'), 'utf-8')
  );
}

function getCompany(companyId) {
  const companies = loadCompanies();
  return companies[companyId] ?? null;
}

// --- Serve the embeddable widget ---
app.get('/chatbot.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.sendFile(path.join(__dirname, 'public/chatbot.js'));
});

// --- Public config endpoint (visual settings only — system prompt stays server-side) ---
app.get('/api/config/:companyId', (req, res) => {
  const company = getCompany(req.params.companyId);
  if (!company) return res.status(404).json({ error: 'Unknown company ID' });

  const { systemPrompt: _hidden, model: _model, ...publicConfig } = company;
  res.json(publicConfig);
});

// --- Chat endpoint with streaming ---
app.post('/api/chat', async (req, res) => {
  const { companyId, messages } = req.body;

  if (!companyId || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'companyId and messages are required' });
  }

  const company = getCompany(companyId);
  if (!company) return res.status(404).json({ error: 'Unknown company ID' });

  // Only allow user/assistant roles; strip anything else
  const safeMessages = messages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => ({ role: m.role, content: String(m.content).slice(0, 4000) }));

  if (safeMessages.length === 0 || safeMessages[safeMessages.length - 1].role !== 'user') {
    return res.status(400).json({ error: 'Last message must be from the user' });
  }

  // Limit conversation history to the last 20 messages to control token cost
  const trimmedMessages = safeMessages.slice(-20);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    const stream = anthropic.messages.stream({
      model: company.model ?? 'claude-opus-4-7',
      max_tokens: 1024,
      system: company.systemPrompt,
      messages: trimmedMessages,
    });

    for await (const event of stream) {
      if (
        event.type === 'content_block_delta' &&
        event.delta.type === 'text_delta'
      ) {
        res.write(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`);
      }
    }

    res.write('data: [DONE]\n\n');
  } catch (err) {
    console.error('Claude API error:', err.message);
    res.write(`data: ${JSON.stringify({ error: 'Something went wrong. Please try again.' })}\n\n`);
  } finally {
    res.end();
  }
});

const PORT = process.env.PORT ?? 3000;
app.listen(PORT, () => {
  console.log(`Chatbot server running at http://localhost:${PORT}`);
  console.log(`Embed snippet: <script src="http://localhost:${PORT}/chatbot.js" data-company-id="YOUR_ID"></script>`);
});

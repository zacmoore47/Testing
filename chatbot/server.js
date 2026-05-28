import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import Anthropic from '@anthropic-ai/sdk';
import nodemailer from 'nodemailer';
import { readFileSync, writeFileSync } from 'fs';
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

function saveCompanies(data) {
  writeFileSync(
    path.join(__dirname, 'config/companies.json'),
    JSON.stringify(data, null, 2),
    'utf-8'
  );
}

// --- Admin auth middleware ---
function adminAuth(req, res, next) {
  const key = req.headers['x-admin-key'];
  if (!process.env.ADMIN_KEY || key !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// --- Admin endpoints ---
app.get('/admin/companies', adminAuth, (req, res) => {
  res.json(loadCompanies());
});

app.post('/admin/companies', adminAuth, (req, res) => {
  const { id, botName, primaryColor, welcomeMessage, systemPrompt, supportEmail, model } = req.body;
  if (!id || !botName || !systemPrompt) {
    return res.status(400).json({ error: 'id, botName, and systemPrompt are required' });
  }
  const companies = loadCompanies();
  if (companies[id]) return res.status(409).json({ error: 'Company ID already exists' });
  companies[id] = {
    botName,
    primaryColor: primaryColor || '#6366f1',
    welcomeMessage: welcomeMessage || `Hi! How can I help you today?`,
    systemPrompt,
    supportEmail: supportEmail || '',
    model: model || 'claude-opus-4-7',
  };
  saveCompanies(companies);
  res.status(201).json({ ok: true, id });
});

app.put('/admin/companies/:id', adminAuth, (req, res) => {
  const companies = loadCompanies();
  if (!companies[req.params.id]) return res.status(404).json({ error: 'Company not found' });
  companies[req.params.id] = { ...companies[req.params.id], ...req.body };
  saveCompanies(companies);
  res.json({ ok: true });
});

app.delete('/admin/companies/:id', adminAuth, (req, res) => {
  const companies = loadCompanies();
  if (!companies[req.params.id]) return res.status(404).json({ error: 'Company not found' });
  delete companies[req.params.id];
  saveCompanies(companies);
  res.json({ ok: true });
});

// --- Serve admin dashboard ---
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/admin.html'));
});

// --- Serve the embeddable widget ---
app.get('/chatbot.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.sendFile(path.join(__dirname, 'public/chatbot.js'));
});

// --- Public config endpoint (visual settings only — system prompt stays server-side) ---
app.get('/api/config/:companyId', (req, res) => {
  const company = getCompany(req.params.companyId);
  if (!company) return res.status(404).json({ error: 'Unknown company ID' });

  const { systemPrompt: _sp, model: _m, supportEmail: _se, ...publicConfig } = company;
  res.json(publicConfig);
});

// --- Rate limiting ---
const chatLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 20,                   // 20 messages per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many messages. Please wait a few minutes and try again.' },
});

// --- Chat endpoint with streaming ---
app.post('/api/chat', chatLimiter, async (req, res) => {
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

// --- Handoff endpoint ---
app.post('/api/handoff', async (req, res) => {
  const { companyId, messages } = req.body;
  if (!companyId || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'companyId and messages are required' });
  }

  const company = getCompany(companyId);
  if (!company) return res.status(404).json({ error: 'Unknown company ID' });
  if (!company.supportEmail) return res.status(200).json({ ok: true }); // no email configured, silently ok

  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.warn('Handoff triggered but SMTP_USER/SMTP_PASS not configured');
    return res.status(200).json({ ok: true });
  }

  const transcript = messages
    .map(m => `${m.role === 'user' ? 'Customer' : 'Bot'}: ${m.content}`)
    .join('\n\n');

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });

  try {
    await transporter.sendMail({
      from: `"${company.botName}" <${process.env.SMTP_USER}>`,
      to: company.supportEmail,
      subject: `[${company.botName}] Customer requested human support`,
      text: `A customer has requested to speak with a human agent.\n\n--- Conversation Transcript ---\n\n${transcript}`,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('Handoff email error:', err.message);
    res.status(500).json({ error: 'Failed to send handoff email' });
  }
});

const PORT = process.env.PORT ?? 3000;
app.listen(PORT, () => {
  console.log(`Chatbot server running at http://localhost:${PORT}`);
  console.log(`Embed snippet: <script src="http://localhost:${PORT}/chatbot.js" data-company-id="YOUR_ID"></script>`);
});

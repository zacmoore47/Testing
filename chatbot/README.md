# Embeddable AI Support Chatbot

A white-label customer support chatbot powered by Claude. You run one server, sell access to multiple companies — each gets a branded bot embedded on their site with a single line of HTML.

## How it works

```
Your server (holds API key + company configs)
        ↕  REST + SSE streaming
Embeddable widget (chatbot.js)
        ↕  one <script> tag
Client's website
```

## Quick Start

```bash
cd chatbot
npm install
cp .env.example .env          # add your ANTHROPIC_API_KEY
node server.js
```

Open `demo.html` in a browser (or serve it) to see the widget in action.

## Adding a new company

Edit `config/companies.json`:

```json
{
  "their-company-id": {
    "botName": "HelpBot",
    "primaryColor": "#0ea5e9",
    "welcomeMessage": "Hi! How can I help you?",
    "systemPrompt": "You are a support agent for Their Company. Help customers with...",
    "model": "claude-opus-4-7"
  }
}
```

Give the client this one line of HTML:

```html
<script
  src="https://YOUR-SERVER.com/chatbot.js"
  data-company-id="their-company-id"
></script>
```

That's it. The system prompt, API key, and AI logic all stay on your server.

## Optional data-attribute overrides

Clients can override visual settings without touching your server config:

```html
<script
  src="https://YOUR-SERVER.com/chatbot.js"
  data-company-id="their-company-id"
  data-primary-color="#ff6b35"
  data-bot-name="Aria"
  data-welcome-message="Hey! Need help?"
  data-position="left"
></script>
```

Server config is always fetched first; data attributes win on conflicts.

## What stays on your server (never exposed to clients)

- `ANTHROPIC_API_KEY`
- `systemPrompt` (the company-specific instructions)
- Model choice

## Deployment checklist

- [ ] Set `ALLOWED_ORIGINS` in `.env` to restrict CORS to your clients' domains
- [ ] Add rate limiting (e.g. `express-rate-limit`) per IP / per company
- [ ] Store company configs in a database instead of `companies.json`
- [ ] Add authentication so only paying clients can use a company ID
- [ ] Deploy behind HTTPS (required for the `<script>` tag to work on HTTPS sites)

## Customising per company

| What | Where |
|---|---|
| Bot personality & knowledge | `systemPrompt` in companies.json |
| Brand colour | `primaryColor` |
| Bot name | `botName` |
| Opening message | `welcomeMessage` |
| AI model (cost vs quality) | `model` — use `claude-haiku-4-5-20251001` for cheaper, faster replies |
| Chat widget position | `data-position="left"` on the script tag |

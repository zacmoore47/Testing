# Stock Arena — AI Trading Debate

AI agents independently research a stock, debate from opposing perspectives over multiple rounds, get risk-checked, and produce a calibrated verdict. Forces real bull/bear conflict before any recommendation.

## Setup

```bash
cd stock-arena
npm install
cp .env.example .env.local
```

Edit `.env.local` with your keys:
- `ANTHROPIC_API_KEY` — from console.anthropic.com
- `MARKET_DATA_API_KEY` — from financialmodelingprep.com (free tier works)

## Run

```bash
npm run dev
```

Open http://localhost:3000, type a ticker (try `AAPL`), and hit Go.

## How it works

1. **Researcher** gathers a sourced dossier (market data + web search)
2. **4 Analysts** (Bull, Bear, Technical/Quant, Macro/Contrarian) debate in parallel rounds
3. **Judge** checks for convergence or repetition between rounds
4. **Risk Manager** independently assesses risk (can veto)
5. **Decision Maker** issues a final verdict reflecting the debate's disagreement

## Models

Configure via env vars:
- `FAST_MODEL` — researcher/judge (default: claude-haiku-4-5-20251001)
- `ANALYST_MODEL` — 4 debating analysts (default: claude-sonnet-4-6)
- `HEAVY_MODEL` — risk manager + decision maker (default: claude-opus-4-8)

## Stack

Next.js (App Router) + TypeScript + Tailwind + @anthropic-ai/sdk + better-sqlite3

# Trading Bot — AI Stock Signals

Full-stack AI-powered stock market trading bot with 5 stages: Research → Filter → Predict → Alert → Learn.

## Quick Start

```bash
npm install
cp .env.example .env    # optional — app works without any keys via mock fallbacks
npm run seed            # populate with 20 mock trades
npm run dev             # starts backend (3001) + frontend (5173)
```

Open http://localhost:5173.

## Architecture

- **backend/** — Node + Express + TypeScript + better-sqlite3
  - `agents/` — research, filter, predict, learn agents
  - `services/` — Claude API wrapper, market data, sentiment
  - `routes/` — REST endpoints
  - `db/` — SQLite schema + query helpers
- **frontend/** — React + Vite + TS + Tailwind + Recharts with terminal aesthetic

## Env Vars

All API keys are **optional**. Missing keys trigger realistic mock fallbacks.
Only `ANTHROPIC_API_KEY` unlocks real LLM predictions; otherwise a deterministic mock LLM is used.

## Scripts

- `npm run dev` — concurrently run backend + frontend
- `npm run build` — build both
- `npm run seed` — insert 20 mock trades into SQLite

## Stages

1. **Research** — parallel scrape X, Reddit, RSS → sentiment scoring
2. **Filter** — scan 300+ tickers, apply liquidity/volume/catalyst filters
3. **Predict** — XGBoost-style logistic regression + Claude LLM calibration → edge score
4. **Alert** — structured buy alerts with entry/stop/target
5. **Learn** — trade outcome feedback → re-train weights + AI lesson generation

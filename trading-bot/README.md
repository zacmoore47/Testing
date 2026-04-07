# Trading Bot — AI Stock Signals

Full-stack AI-powered stock signal pipeline. 5 stages: Research → Filter → Predict → Alert → Learn.

## ⚠️ DISCLAIMER

**This is a learning project, NOT financial advice.** Do not trade real money based on these alerts. The model is small, untested, and lacks backtesting, walk-forward validation, slippage modeling, and real risk management. People lose money trading on undertested signals.

## Quick Start

```bash
cd trading-bot
npm install
cp .env.example .env    # optional — works without keys
npm run seed            # populate with 20 mock trades
npm run dev             # backend :3001 + frontend :5173
```

Open http://localhost:5173.

## Real Data Setup

The app uses mock data by default. To get real data, fill in keys in `backend/.env`:

| Source | Key | Cost | Use |
|---|---|---|---|
| **Yahoo Finance** | none | free | Real prices, volume, RSI, EMA, beta — **automatic, no key needed** |
| **Anthropic Claude** | `ANTHROPIC_API_KEY` | pay-per-use (~$0.10/run) | Real LLM predictions and lesson generation |
| **Finnhub** | `FINNHUB_API_KEY` | free tier | Earnings calendar, company metrics |
| **Reddit** | `REDDIT_CLIENT_ID/SECRET/USERNAME/PASSWORD` | free | Real subreddit scraping |
| **X (Twitter)** | `TWITTER_BEARER_TOKEN` | $200+/month | Cashtag streams (optional) |

### Get keys

- **Claude:** https://console.anthropic.com/settings/keys
- **Finnhub:** https://finnhub.io/register
- **Reddit:** https://www.reddit.com/prefs/apps → create "script" app → use the client_id under the app name and the secret
- **X:** https://developer.x.com/ → requires Basic plan or higher

### After adding keys

```bash
# Stop the running server (Ctrl+C), then:
npm run dev
```

The header shows which integrations are live.

## Architecture

```
backend/
  src/
    agents/         # research, filter, predict, learn
    services/       # claude, marketData (Yahoo), finnhub, reddit, twitter, sentiment
    routes/         # REST endpoints
    db/             # SQLite schema + queries
frontend/
  src/
    components/     # one panel per stage + Stat
    api/client.ts   # axios wrapper
scripts/seed.ts     # 20 mock trades for the Learn panel
```

## Stages

1. **Research** — parallel scrape X + Reddit + RSS, score sentiment
2. **Filter** — Yahoo Finance batched quotes for 300+ tickers, apply liquidity/volume/spread/catalyst/research filters
3. **Predict** — enrich top 15 with detailed Yahoo + Finnhub data, build feature vector, run logistic regression, calibrate with Claude, compute edge vs market
4. **Alert** — predictions with edge >8% become structured BUY alerts
5. **Learn** — log trade outcomes, generate lessons via Claude, retrain weights every 5 outcomes

## Scripts

- `npm run dev` — backend + frontend together
- `npm run build` — typecheck + bundle
- `npm run seed` — insert mock trades into SQLite

## Endpoints

- `GET  /api/health`
- `POST /api/research/run` · `GET /api/research/signals`
- `POST /api/filter/run` · `GET /api/filter/results`
- `POST /api/predict/run` · `GET /api/predict/results`
- `GET  /api/alerts/latest` · `GET /api/alerts/history`
- `POST /api/learn/outcome` · `GET /api/learn/stats` · `GET /api/learn/outcomes`

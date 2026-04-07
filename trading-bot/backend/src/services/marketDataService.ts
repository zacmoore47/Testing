// Mock-first market data service. Real Yahoo integration kicks in only when available.
let yahoo: any = null;
try { yahoo = require('yahoo-finance2').default; } catch {}

export interface Quote {
  ticker: string;
  companyName: string;
  price: number;
  volume: number;
  avgVolume20d: number;
  volumeRatio: number;
  bidAskSpreadPct: number;
  rsi14: number;
  ema20: number;
  impliedVolatility: number;
  shortInterestRatio: number;
  earningsDaysAway: number;
}

function seeded(ticker: string, salt = 0) {
  let h = salt;
  for (const c of ticker) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return () => { h = (h * 1664525 + 1013904223) >>> 0; return (h >>> 0) / 4294967296; };
}

export async function getQuote(ticker: string): Promise<Quote> {
  if (yahoo && process.env.ALPHA_VANTAGE_API_KEY) {
    try {
      const q = await yahoo.quote(ticker);
      const price = q.regularMarketPrice ?? 100;
      return {
        ticker,
        companyName: q.longName || q.shortName || ticker,
        price,
        volume: q.regularMarketVolume ?? 0,
        avgVolume20d: q.averageDailyVolume10Day ?? 1,
        volumeRatio: (q.regularMarketVolume ?? 0) / Math.max(q.averageDailyVolume10Day ?? 1, 1),
        bidAskSpreadPct: 0.1,
        rsi14: 50,
        ema20: price * 0.98,
        impliedVolatility: 0.3,
        shortInterestRatio: 0.05,
        earningsDaysAway: 10,
      };
    } catch {}
  }
  const r = seeded(ticker);
  const price = 20 + r() * 480;
  const volRatio = 0.5 + r() * 3;
  return {
    ticker,
    companyName: `${ticker} Inc.`,
    price: +price.toFixed(2),
    volume: Math.floor(1e6 + r() * 5e7),
    avgVolume20d: Math.floor(1e6 + r() * 3e7),
    volumeRatio: +volRatio.toFixed(2),
    bidAskSpreadPct: +(r() * 0.6).toFixed(3),
    rsi14: +(30 + r() * 40).toFixed(1),
    ema20: +(price * (0.94 + r() * 0.12)).toFixed(2),
    impliedVolatility: +(0.2 + r() * 0.8).toFixed(3),
    shortInterestRatio: +(r() * 0.3).toFixed(3),
    earningsDaysAway: Math.floor(r() * 30) - 1,
  };
}

export async function getQuotes(tickers: string[]): Promise<Quote[]> {
  return Promise.all(tickers.map(getQuote));
}

// Market implied probability from IV (rough calibration)
export function impliedProbability(q: Quote): number {
  // center around 0.5, nudge by momentum signals
  const momentum = (q.price - q.ema20) / q.ema20;
  return Math.max(0.05, Math.min(0.95, 0.5 + momentum * 0.4 - q.impliedVolatility * 0.1));
}

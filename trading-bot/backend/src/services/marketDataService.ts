// Real market data via Finnhub (requires free API key from https://finnhub.io/register).
// Falls back to seeded mock data if FINNHUB_API_KEY is not set.
import { getEarningsDaysAway, getFinnhubQuote, getFinnhubProfile, getFinnhubCandles, finnhubEnabled } from './finnhubService';

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
  isReal: boolean;
}

function seeded(ticker: string, salt = 0) {
  let h = salt;
  for (const c of ticker) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return () => { h = (h * 1664525 + 1013904223) >>> 0; return (h >>> 0) / 4294967296; };
}

function mockQuote(ticker: string): Quote {
  const r = seeded(ticker);
  const price = 20 + r() * 480;
  const volRatio = 0.5 + r() * 3;
  return {
    ticker, companyName: `${ticker} Inc.`,
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
    isReal: false,
  };
}

function computeRSI(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff; else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(diff, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-diff, 0)) / period;
  }
  const rs = avgGain / Math.max(avgLoss, 0.0001);
  return +(100 - 100 / (1 + rs)).toFixed(1);
}

function ema(values: number[], period: number): number {
  if (!values.length) return 0;
  const k = 2 / (period + 1);
  let prev = values[0];
  for (let i = 1; i < values.length; i++) prev = values[i] * k + prev * (1 - k);
  return prev;
}

// Throttled fetch — Finnhub free tier is 60 calls/minute. We use ~150ms gaps to stay safely under.
async function throttled<T>(items: string[], worker: (s: string) => Promise<T>, gapMs = 150): Promise<T[]> {
  const results: T[] = [];
  for (const item of items) {
    results.push(await worker(item));
    if (gapMs > 0) await new Promise(r => setTimeout(r, gapMs));
  }
  return results;
}

async function quoteFromFinnhub(ticker: string): Promise<Quote | null> {
  const q = await getFinnhubQuote(ticker);
  if (!q) return null;
  const name = (await getFinnhubProfile(ticker)) || ticker;
  return {
    ticker,
    companyName: name,
    price: +q.c.toFixed(2),
    volume: 0, // Finnhub /quote doesn't return volume; refined in detailed step via /candle if available
    avgVolume20d: 1,
    volumeRatio: 1,
    bidAskSpreadPct: +(((q.h - q.l) / Math.max(q.c, 1)) * 100).toFixed(3),
    rsi14: 50,
    ema20: q.o || q.c,
    impliedVolatility: 0.3,
    shortInterestRatio: 0,
    earningsDaysAway: -1,
    isReal: true,
  };
}

export async function getQuotes(tickers: string[]): Promise<Quote[]> {
  console.log(`[market] getQuotes(${tickers.length} tickers) — finnhub=${finnhubEnabled()}`);
  if (!finnhubEnabled()) {
    console.warn('[market] FINNHUB_API_KEY missing — returning mock data. Get a free key at https://finnhub.io/register');
    return tickers.map(mockQuote);
  }
  const results = await throttled(tickers, async t => {
    const q = await quoteFromFinnhub(t);
    return q || mockQuote(t);
  });
  const real = results.filter(q => q.isReal).length;
  console.log(`[market] result: ${real} real, ${tickers.length - real} mock`);
  return results;
}

export async function getDetailedQuote(ticker: string): Promise<Quote> {
  const base = (await quoteFromFinnhub(ticker)) || mockQuote(ticker);
  // Try to enrich with historical data for real RSI/EMA/volume.
  // Free-tier /candle is sometimes restricted; we silently skip if it fails.
  const [hist, earningsDays] = await Promise.all([
    getFinnhubCandles(ticker),
    getEarningsDaysAway(ticker),
  ]);
  if (hist && hist.closes.length) {
    base.rsi14 = computeRSI(hist.closes);
    base.ema20 = +ema(hist.closes.slice(-20), 20).toFixed(2);
    const vols = hist.volumes.slice(-20);
    if (vols.length) {
      base.avgVolume20d = Math.floor(vols.reduce((a, b) => a + b, 0) / vols.length);
      base.volume = vols[vols.length - 1] || 0;
      base.volumeRatio = +(base.volume / Math.max(base.avgVolume20d, 1)).toFixed(2);
    }
  }
  base.earningsDaysAway = earningsDays;
  return base;
}

export async function getQuote(ticker: string): Promise<Quote> {
  return getDetailedQuote(ticker);
}

export function impliedProbability(q: Quote): number {
  const momentum = (q.price - q.ema20) / Math.max(q.ema20, 1);
  return Math.max(0.05, Math.min(0.95, 0.5 + momentum * 0.4 - q.impliedVolatility * 0.1));
}

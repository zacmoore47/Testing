// Real market data via Stooq (free, no auth, batched). Yahoo fallback.
// Stooq supports comma-separated tickers in one call:
//   https://stooq.com/q/l/?s=msft.us,aapl.us&f=sd2t2ohlcvn&h&e=csv
// And daily history per ticker:
//   https://stooq.com/q/d/l/?s=msft.us&i=d
import { getEarningsDaysAway } from './finnhubService';

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

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  'Accept': 'text/csv,application/json,*/*',
};

// 5-minute in-memory cache so re-runs don't hammer external sources.
const TTL = 5 * 60_000;
const snapshotCache = new Map<string, { ts: number; q: Quote }>();
const historyCache = new Map<string, { ts: number; closes: number[]; volumes: number[] }>();

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

function toStooq(t: string): string {
  return `${t.toLowerCase().replace('.', '-').replace('-', '-')}.us`;
}

// Stooq batched snapshot — one HTTP call returns OHLCV for many symbols.
let stooqErrLogged = 0;
async function fetchStooqSnapshot(tickers: string[]): Promise<Map<string, Quote>> {
  const out = new Map<string, Quote>();
  if (!tickers.length) return out;
  const symbols = tickers.map(toStooq).join(',');
  const url = `https://stooq.com/q/l/?s=${symbols}&f=sd2t2ohlcvn&h&e=csv`;
  try {
    const r = await fetch(url, { headers: HEADERS });
    if (!r.ok) {
      if (stooqErrLogged++ < 3) console.warn(`[stooq] HTTP ${r.status}`);
      return out;
    }
    const csv = await r.text();
    const lines = csv.trim().split('\n');
    if (lines.length < 2) return out;
    for (const line of lines.slice(1)) {
      const cols = line.split(',');
      if (cols.length < 9) continue;
      const symbol = cols[0].replace(/\.us$/i, '').toUpperCase().replace('-', '.');
      const open = parseFloat(cols[3]);
      const high = parseFloat(cols[4]);
      const low = parseFloat(cols[5]);
      const close = parseFloat(cols[6]);
      const volume = parseFloat(cols[7]);
      const name = cols.slice(8).join(',').replace(/^"|"$/g, '');
      if (isNaN(close) || close === 0) continue;
      out.set(symbol, {
        ticker: symbol,
        companyName: name || symbol,
        price: close,
        volume: isNaN(volume) ? 0 : volume,
        avgVolume20d: isNaN(volume) ? 1 : volume, // approximate; refined in detailed step
        volumeRatio: 1,
        bidAskSpreadPct: +(((high - low) / Math.max(close, 1)) * 100).toFixed(3),
        rsi14: 50,
        ema20: open || close,
        impliedVolatility: 0.3,
        shortInterestRatio: 0,
        earningsDaysAway: -1,
        isReal: true,
      });
    }
  } catch (e) {
    if (stooqErrLogged++ < 3) console.warn('[stooq] snapshot threw:', (e as Error).message);
  }
  return out;
}

// Stooq daily history for one ticker. Used in Predict stage to compute real RSI + EMA + 20d avg volume.
let stooqHistErr = 0;
async function fetchStooqHistory(ticker: string): Promise<{ closes: number[]; volumes: number[] } | null> {
  const cached = historyCache.get(ticker);
  if (cached && Date.now() - cached.ts < TTL) return { closes: cached.closes, volumes: cached.volumes };
  try {
    const r = await fetch(`https://stooq.com/q/d/l/?s=${toStooq(ticker)}&i=d`, { headers: HEADERS });
    if (!r.ok) return null;
    const csv = await r.text();
    if (!csv.startsWith('Date,')) return null;
    const lines = csv.trim().split('\n').slice(1);
    const closes: number[] = [];
    const volumes: number[] = [];
    for (const line of lines) {
      const [, , , , close, volume] = line.split(',');
      const c = parseFloat(close);
      const v = parseFloat(volume);
      if (!isNaN(c)) closes.push(c);
      if (!isNaN(v)) volumes.push(v);
    }
    const trimmed = { closes: closes.slice(-60), volumes: volumes.slice(-60) };
    historyCache.set(ticker, { ts: Date.now(), ...trimmed });
    return trimmed;
  } catch (e) {
    if (stooqHistErr++ < 3) console.warn(`[stooq] history ${ticker}:`, (e as Error).message);
    return null;
  }
}

// Public: batched quotes for the Filter stage. Uses cache + chunked Stooq calls.
const CHUNK = 25;
export async function getQuotes(tickers: string[]): Promise<Quote[]> {
  const now = Date.now();
  const need: string[] = [];
  const cached = new Map<string, Quote>();
  for (const t of tickers) {
    const c = snapshotCache.get(t);
    if (c && now - c.ts < TTL) cached.set(t, c.q);
    else need.push(t);
  }
  // Chunked sequential fetch (sequential is fine — one call returns 25 symbols)
  for (let i = 0; i < need.length; i += CHUNK) {
    const chunk = need.slice(i, i + CHUNK);
    const got = await fetchStooqSnapshot(chunk);
    for (const t of chunk) {
      const q = got.get(t) || mockQuote(t);
      snapshotCache.set(t, { ts: now, q });
      cached.set(t, q);
    }
  }
  return tickers.map(t => cached.get(t) || mockQuote(t));
}

// Public: detailed quote with real RSI + EMA + earnings. Used in Predict for top candidates.
export async function getDetailedQuote(ticker: string): Promise<Quote> {
  const [base, hist, earningsDays] = await Promise.all([
    (async () => (await getQuotes([ticker]))[0])(),
    fetchStooqHistory(ticker),
    getEarningsDaysAway(ticker),
  ]);
  if (hist && hist.closes.length) {
    base.rsi14 = computeRSI(hist.closes);
    base.ema20 = +ema(hist.closes.slice(-20), 20).toFixed(2);
    const vols = hist.volumes.slice(-20);
    if (vols.length) {
      base.avgVolume20d = Math.floor(vols.reduce((a, b) => a + b, 0) / vols.length);
      base.volumeRatio = +(base.volume / Math.max(base.avgVolume20d, 1)).toFixed(2);
    }
  }
  base.earningsDaysAway = earningsDays;
  return base;
}

export async function getQuote(ticker: string): Promise<Quote> {
  return getDetailedQuote(ticker);
}

// Market implied probability proxy.
export function impliedProbability(q: Quote): number {
  const momentum = (q.price - q.ema20) / Math.max(q.ema20, 1);
  return Math.max(0.05, Math.min(0.95, 0.5 + momentum * 0.4 - q.impliedVolatility * 0.1));
}

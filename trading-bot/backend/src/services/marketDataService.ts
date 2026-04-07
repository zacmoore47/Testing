// Real Yahoo Finance data via the public v8 chart endpoint. No package, no auth needed.
// Returns OHLCV bars from which we derive price, volume, RSI, EMA.
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

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
  'Accept': 'application/json',
};

// Fetch a single ticker's OHLCV history from Yahoo's free public chart endpoint.
async function fetchChart(ticker: string): Promise<any | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=3mo`;
    const r = await fetch(url, { headers: HEADERS });
    if (!r.ok) return null;
    const data: any = await r.json();
    return data?.chart?.result?.[0] || null;
  } catch { return null; }
}

function chartToQuote(ticker: string, chart: any): Quote {
  const meta = chart.meta || {};
  const ind = chart.indicators?.quote?.[0] || {};
  const closes: number[] = (ind.close || []).filter((v: any) => typeof v === 'number');
  const volumes: number[] = (ind.volume || []).filter((v: any) => typeof v === 'number');
  const last = closes[closes.length - 1] || meta.regularMarketPrice || 0;
  const lastVol = volumes[volumes.length - 1] || meta.regularMarketVolume || 0;
  const recent20vol = volumes.slice(-20);
  const avg20vol = recent20vol.length ? recent20vol.reduce((a, b) => a + b, 0) / recent20vol.length : 1;
  return {
    ticker,
    companyName: meta.longName || meta.shortName || ticker,
    price: +last.toFixed(2),
    volume: lastVol,
    avgVolume20d: Math.floor(avg20vol),
    volumeRatio: +(lastVol / Math.max(avg20vol, 1)).toFixed(2),
    bidAskSpreadPct: 0.05, // chart endpoint doesn't expose bid/ask; assume tight for liquid names
    rsi14: computeRSI(closes),
    ema20: +ema(closes.slice(-20), 20).toFixed(2),
    impliedVolatility: 0.3, // not available without options chain; use a neutral default
    shortInterestRatio: 0,
    earningsDaysAway: -1,
    isReal: true,
  };
}

// Throttled batch fetch to avoid hammering Yahoo (which will start dropping requests).
async function batchFetch<T>(items: string[], worker: (s: string) => Promise<T>, concurrency = 6): Promise<T[]> {
  const out: T[] = new Array(items.length);
  let idx = 0;
  async function next() {
    while (idx < items.length) {
      const i = idx++;
      out[i] = await worker(items[i]);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, next));
  return out;
}

export async function getQuotes(tickers: string[]): Promise<Quote[]> {
  const results = await batchFetch(tickers, async t => {
    const chart = await fetchChart(t);
    return chart ? chartToQuote(t, chart) : mockQuote(t);
  });
  return results;
}

export async function getDetailedQuote(ticker: string): Promise<Quote> {
  const chart = await fetchChart(ticker);
  if (!chart) return mockQuote(ticker);
  const q = chartToQuote(ticker, chart);
  q.earningsDaysAway = await getEarningsDaysAway(ticker);
  return q;
}

export async function getQuote(ticker: string): Promise<Quote> {
  return getDetailedQuote(ticker);
}

// Market implied probability proxy from price momentum + IV.
export function impliedProbability(q: Quote): number {
  const momentum = (q.price - q.ema20) / Math.max(q.ema20, 1);
  return Math.max(0.05, Math.min(0.95, 0.5 + momentum * 0.4 - q.impliedVolatility * 0.1));
}

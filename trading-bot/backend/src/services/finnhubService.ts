// Finnhub free tier client. Used for real-time quotes, earnings calendar, company profiles.
// Get a free key at https://finnhub.io/register
// Free tier: 60 API calls/minute.

const KEY = () => process.env.FINNHUB_API_KEY;
const BASE = 'https://finnhub.io/api/v1';

interface EarningsCacheEntry { ts: number; days: number; }
const earningsCache = new Map<string, EarningsCacheEntry>();
const TTL = 6 * 60 * 60 * 1000;

const QUOTE_TTL = 5 * 60_000;
const PROFILE_TTL = 24 * 60 * 60_000;
const quoteCache = new Map<string, { ts: number; data: FinnhubQuote }>();
const profileCache = new Map<string, { ts: number; name: string }>();

export interface FinnhubQuote {
  c: number;  // current
  h: number;  // high
  l: number;  // low
  o: number;  // open
  pc: number; // prev close
  d: number;  // day change
  dp: number; // day change percent
  t: number;  // timestamp
}

export async function getFinnhubQuote(ticker: string): Promise<FinnhubQuote | null> {
  if (!KEY()) return null;
  const cached = quoteCache.get(ticker);
  if (cached && Date.now() - cached.ts < QUOTE_TTL) return cached.data;
  try {
    const r = await fetch(`${BASE}/quote?symbol=${ticker}&token=${KEY()}`);
    if (!r.ok) return null;
    const data: any = await r.json();
    if (typeof data?.c !== 'number' || data.c === 0) return null;
    quoteCache.set(ticker, { ts: Date.now(), data });
    return data;
  } catch { return null; }
}

export async function getFinnhubProfile(ticker: string): Promise<string | null> {
  if (!KEY()) return null;
  const cached = profileCache.get(ticker);
  if (cached && Date.now() - cached.ts < PROFILE_TTL) return cached.name;
  try {
    const r = await fetch(`${BASE}/stock/profile2?symbol=${ticker}&token=${KEY()}`);
    if (!r.ok) return null;
    const data: any = await r.json();
    const name = data?.name || null;
    if (name) profileCache.set(ticker, { ts: Date.now(), name });
    return name;
  } catch { return null; }
}

// Daily candles. Free tier sometimes restricts this — falls back to null.
export async function getFinnhubCandles(ticker: string, days = 60): Promise<{ closes: number[]; volumes: number[] } | null> {
  if (!KEY()) return null;
  try {
    const to = Math.floor(Date.now() / 1000);
    const from = to - days * 86400;
    const r = await fetch(`${BASE}/stock/candle?symbol=${ticker}&resolution=D&from=${from}&to=${to}&token=${KEY()}`);
    if (!r.ok) return null;
    const data: any = await r.json();
    if (data?.s !== 'ok' || !Array.isArray(data.c)) return null;
    return { closes: data.c, volumes: data.v || [] };
  } catch { return null; }
}

export async function getEarningsDaysAway(ticker: string): Promise<number> {
  if (!KEY()) return -1;
  const cached = earningsCache.get(ticker);
  if (cached && Date.now() - cached.ts < TTL) return cached.days;
  try {
    const from = new Date().toISOString().slice(0, 10);
    const to = new Date(Date.now() + 60 * 86400_000).toISOString().slice(0, 10);
    const r = await fetch(`${BASE}/calendar/earnings?from=${from}&to=${to}&symbol=${ticker}&token=${KEY()}`);
    const data: any = await r.json();
    const next = (data.earningsCalendar || [])[0];
    if (!next) { earningsCache.set(ticker, { ts: Date.now(), days: -1 }); return -1; }
    const days = Math.floor((new Date(next.date).getTime() - Date.now()) / 86400_000);
    earningsCache.set(ticker, { ts: Date.now(), days });
    return days;
  } catch {
    return -1;
  }
}

export async function getCompanyMetrics(ticker: string): Promise<{ shortRatio: number; beta: number } | null> {
  if (!KEY()) return null;
  try {
    const r = await fetch(`${BASE}/stock/metric?symbol=${ticker}&metric=all&token=${KEY()}`);
    const data: any = await r.json();
    return {
      shortRatio: data.metric?.shortRatio ?? 0,
      beta: data.metric?.beta ?? 1,
    };
  } catch { return null; }
}

export const finnhubEnabled = () => !!KEY();

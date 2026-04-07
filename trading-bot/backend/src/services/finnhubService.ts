// Finnhub free tier client. Used for earnings calendar + company metrics.
// Get a free key at https://finnhub.io/register

const KEY = process.env.FINNHUB_API_KEY;
const BASE = 'https://finnhub.io/api/v1';

interface EarningsCacheEntry { ts: number; days: number; }
const earningsCache = new Map<string, EarningsCacheEntry>();
const TTL = 6 * 60 * 60 * 1000;

export async function getEarningsDaysAway(ticker: string): Promise<number> {
  if (!KEY) return -1;
  const cached = earningsCache.get(ticker);
  if (cached && Date.now() - cached.ts < TTL) return cached.days;
  try {
    const from = new Date().toISOString().slice(0, 10);
    const to = new Date(Date.now() + 60 * 86400_000).toISOString().slice(0, 10);
    const r = await fetch(`${BASE}/calendar/earnings?from=${from}&to=${to}&symbol=${ticker}&token=${KEY}`);
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
  if (!KEY) return null;
  try {
    const r = await fetch(`${BASE}/stock/metric?symbol=${ticker}&metric=all&token=${KEY}`);
    const data: any = await r.json();
    return {
      shortRatio: data.metric?.shortRatio ?? 0,
      beta: data.metric?.beta ?? 1,
    };
  } catch { return null; }
}

export const finnhubEnabled = () => !!KEY;

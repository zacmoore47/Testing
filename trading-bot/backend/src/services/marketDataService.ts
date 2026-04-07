// Real Yahoo Finance data with mock fallback. yahoo-finance2 is unofficial and free, no key needed.
import yahooFinance from 'yahoo-finance2';
import { getEarningsDaysAway } from './finnhubService';

try { (yahooFinance as any).suppressNotices?.(['ripHistorical', 'yahooSurvey']); } catch {}

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

// 14-period RSI from a closing-price series.
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

// Batched lightweight quotes for the Filter stage. Yahoo Finance accepts arrays.
export async function getQuotes(tickers: string[]): Promise<Quote[]> {
  try {
    const results = await yahooFinance.quote(tickers as any) as any[];
    const arr = Array.isArray(results) ? results : [results];
    return arr.map((q: any) => {
      if (!q || !q.regularMarketPrice) return mockQuote(q?.symbol || 'UNKNOWN');
      const price = q.regularMarketPrice;
      const volume = q.regularMarketVolume ?? 0;
      const avgVol = q.averageDailyVolume10Day ?? q.averageDailyVolume3Month ?? 1;
      const bid = q.bid ?? price;
      const ask = q.ask ?? price;
      return {
        ticker: q.symbol,
        companyName: q.longName || q.shortName || q.symbol,
        price,
        volume,
        avgVolume20d: avgVol,
        volumeRatio: +(volume / Math.max(avgVol, 1)).toFixed(2),
        bidAskSpreadPct: +(((ask - bid) / Math.max(price, 1)) * 100).toFixed(3),
        rsi14: 50, // filled in detailed step
        ema20: q.fiftyDayAverage ?? price,
        impliedVolatility: 0.3, // proxy filled in detailed step
        shortInterestRatio: 0,
        earningsDaysAway: -1,
        isReal: true,
      } as Quote;
    });
  } catch (e) {
    console.warn('[yahoo] batch quote failed, using mocks:', (e as Error).message);
    return tickers.map(mockQuote);
  }
}

// Detailed quote with RSI + earnings + short interest. Used in Predict stage for ~20 stocks.
export async function getDetailedQuote(ticker: string): Promise<Quote> {
  try {
    const [summary, hist] = await Promise.all([
      yahooFinance.quoteSummary(ticker, {
        modules: ['price', 'summaryDetail', 'defaultKeyStatistics'] as any,
      }).catch(() => null),
      yahooFinance.historical(ticker, {
        period1: new Date(Date.now() - 60 * 86400_000),
        interval: '1d',
      }).catch(() => [] as any[]),
    ]);
    if (!summary) return mockQuote(ticker);
    const price = (summary.price as any)?.regularMarketPrice ?? 0;
    const volume = (summary.price as any)?.regularMarketVolume ?? 0;
    const sd: any = summary.summaryDetail || {};
    const ks: any = (summary as any).defaultKeyStatistics || {};
    const closes = (hist || []).map((h: any) => h.close).filter((c: number) => typeof c === 'number');
    const ema20 = closes.length >= 20
      ? closes.slice(-20).reduce((a: number, b: number) => a + b, 0) / 20
      : sd.fiftyDayAverage ?? price;
    const rsi = computeRSI(closes);
    const bid = sd.bid ?? price;
    const ask = sd.ask ?? price;
    const earningsDays = await getEarningsDaysAway(ticker);
    const shortRatio = (ks.shortRatio ?? 0) / 100;
    // Yahoo doesn't publish IV at the security level; use beta * 0.3 as a proxy.
    const beta = ks.beta ?? 1;
    const impliedVolatility = Math.max(0.1, Math.min(1.5, beta * 0.3));
    return {
      ticker,
      companyName: (summary.price as any)?.longName || (summary.price as any)?.shortName || ticker,
      price,
      volume,
      avgVolume20d: sd.averageDailyVolume10Day ?? 1,
      volumeRatio: +(volume / Math.max(sd.averageDailyVolume10Day ?? 1, 1)).toFixed(2),
      bidAskSpreadPct: +(((ask - bid) / Math.max(price, 1)) * 100).toFixed(3),
      rsi14: rsi,
      ema20: +ema20.toFixed(2),
      impliedVolatility: +impliedVolatility.toFixed(3),
      shortInterestRatio: +shortRatio.toFixed(3),
      earningsDaysAway: earningsDays,
      isReal: true,
    };
  } catch (e) {
    console.warn(`[yahoo] detailed ${ticker}:`, (e as Error).message);
    return mockQuote(ticker);
  }
}

export async function getQuote(ticker: string): Promise<Quote> {
  const [q] = await getQuotes([ticker]);
  return q || mockQuote(ticker);
}

// Market implied probability proxy from price momentum + IV.
export function impliedProbability(q: Quote): number {
  const momentum = (q.price - q.ema20) / q.ema20;
  return Math.max(0.05, Math.min(0.95, 0.5 + momentum * 0.4 - q.impliedVolatility * 0.1));
}

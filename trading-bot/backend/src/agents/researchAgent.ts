import Parser from 'rss-parser';
import { insertResearch, uid, now } from '../db/queries';
import { scoreBatch, mockSentiment } from '../services/sentimentService';

const rssParser = new Parser();

const RSS_FEEDS = [
  'https://feeds.reuters.com/reuters/businessNews',
  'https://feeds.marketwatch.com/marketwatch/topstories/',
  'https://seekingalpha.com/market_currents.xml',
];

const MOCK_TICKERS = ['NVDA', 'AAPL', 'TSLA', 'AMD', 'META', 'MSFT', 'GOOGL', 'AMZN', 'SMCI', 'PLTR'];
const MOCK_TOPICS = ['earnings beat', 'short squeeze', 'FDA approval', 'guidance raised', 'analyst upgrade', 'insider buying'];

interface RawSignal { ticker: string; source: 'x' | 'reddit' | 'rss'; content: string; }

async function scrapeX(): Promise<RawSignal[]> {
  // Real Twitter API integration would go here using TWITTER_BEARER_TOKEN.
  // Mock fallback: generate realistic cashtag buzz.
  if (!process.env.TWITTER_BEARER_TOKEN) {
    return MOCK_TICKERS.slice(0, 6).map(t => ({
      ticker: t, source: 'x' as const,
      content: `$${t} ${MOCK_TOPICS[Math.floor(Math.random() * MOCK_TOPICS.length)]} incoming 🚀`,
    }));
  }
  try {
    const q = encodeURIComponent('($AAPL OR $NVDA OR $TSLA OR $AMD) -is:retweet lang:en');
    const r = await fetch(`https://api.twitter.com/2/tweets/search/recent?query=${q}&max_results=20`, {
      headers: { Authorization: `Bearer ${process.env.TWITTER_BEARER_TOKEN}` },
    });
    const data: any = await r.json();
    return (data.data || []).map((t: any) => {
      const m = t.text.match(/\$([A-Z]{1,5})/);
      return { ticker: m?.[1] || 'UNKNOWN', source: 'x' as const, content: t.text };
    });
  } catch { return []; }
}

async function scrapeReddit(): Promise<RawSignal[]> {
  if (!process.env.REDDIT_CLIENT_ID) {
    return MOCK_TICKERS.slice(2, 8).map(t => ({
      ticker: t, source: 'reddit' as const,
      content: `DD: Why ${t} is the next big ${MOCK_TOPICS[Math.floor(Math.random() * MOCK_TOPICS.length)]} play`,
    }));
  }
  try {
    // snoowrap integration deferred; use public JSON endpoint as fallback
    const r = await fetch('https://www.reddit.com/r/wallstreetbets/hot.json?limit=25', {
      headers: { 'User-Agent': 'trading-bot/1.0' },
    });
    const data: any = await r.json();
    return (data.data?.children || []).map((c: any) => {
      const title = c.data.title as string;
      const m = title.match(/\$?([A-Z]{2,5})\b/);
      return { ticker: m?.[1] || 'SPY', source: 'reddit' as const, content: title };
    });
  } catch { return []; }
}

async function scrapeRSS(): Promise<RawSignal[]> {
  const results: RawSignal[] = [];
  await Promise.all(RSS_FEEDS.map(async url => {
    try {
      const feed = await rssParser.parseURL(url);
      for (const item of (feed.items || []).slice(0, 10)) {
        const title = item.title || '';
        const m = title.match(/\b([A-Z]{2,5})\b/);
        results.push({ ticker: m?.[1] || 'SPY', source: 'rss', content: title });
      }
    } catch {}
  }));
  if (results.length === 0) {
    return MOCK_TICKERS.slice(0, 5).map(t => ({
      ticker: t, source: 'rss' as const, content: `${t} reports strong Q3 results, beats estimates`,
    }));
  }
  return results;
}

export async function runResearch() {
  const [x, reddit, rss] = await Promise.all([scrapeX(), scrapeReddit(), scrapeRSS()]);
  const all = [...x, ...reddit, ...rss];
  const texts = all.map(s => s.content);
  let sentiments;
  try { sentiments = await scoreBatch(texts); }
  catch { sentiments = texts.map(mockSentiment); }
  const ts = now();
  const inserted = all.map((s, i) => {
    const sent = sentiments[i] || mockSentiment(s.content);
    const id = uid();
    insertResearch.run(id, s.ticker, s.source, s.content, sent.score, sent.label, ts);
    return { id, ...s, sentiment: sent, created_at: ts };
  });
  return inserted;
}

export const lastRun = { research: 0 };

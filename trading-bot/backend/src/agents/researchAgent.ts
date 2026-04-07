import Parser from 'rss-parser';
import { insertResearch, uid, now } from '../db/queries';
import { scoreBatch, mockSentiment } from '../services/sentimentService';
import { fetchRedditPosts } from '../services/redditService';
import { fetchXPosts, xEnabled } from '../services/twitterService';

const rssParser = new Parser({ timeout: 10_000 });

const RSS_FEEDS = [
  'https://feeds.marketwatch.com/marketwatch/topstories/',
  'https://feeds.marketwatch.com/marketwatch/marketpulse/',
  'https://www.investing.com/rss/news_25.rss',
  'https://seekingalpha.com/market_currents.xml',
];

const MOCK_TICKERS = ['NVDA', 'AAPL', 'TSLA', 'AMD', 'META', 'MSFT', 'GOOGL', 'AMZN', 'SMCI', 'PLTR'];
const MOCK_TOPICS = ['earnings beat', 'short squeeze', 'FDA approval', 'guidance raised', 'analyst upgrade'];

interface RawSignal { ticker: string; source: 'x' | 'reddit' | 'rss'; content: string; }

async function scrapeX(): Promise<RawSignal[]> {
  if (!xEnabled()) {
    return MOCK_TICKERS.slice(0, 6).map(t => ({
      ticker: t, source: 'x' as const,
      content: `[mock] $${t} ${MOCK_TOPICS[Math.floor(Math.random() * MOCK_TOPICS.length)]}`,
    }));
  }
  const posts = await fetchXPosts();
  return posts.map(p => ({ ticker: p.ticker, source: 'x' as const, content: p.text }));
}

async function scrapeReddit(): Promise<RawSignal[]> {
  const posts = await fetchRedditPosts();
  if (!posts.length) {
    return MOCK_TICKERS.slice(2, 8).map(t => ({
      ticker: t, source: 'reddit' as const,
      content: `[mock] DD: ${t} ${MOCK_TOPICS[Math.floor(Math.random() * MOCK_TOPICS.length)]}`,
    }));
  }
  return posts.map(p => ({ ticker: p.ticker, source: 'reddit' as const, content: p.title }));
}

async function scrapeRSS(): Promise<RawSignal[]> {
  const results: RawSignal[] = [];
  await Promise.all(RSS_FEEDS.map(async url => {
    try {
      const feed = await rssParser.parseURL(url);
      for (const item of (feed.items || []).slice(0, 15)) {
        const title = item.title || '';
        const m = title.match(/\b([A-Z]{2,5})\b/);
        results.push({ ticker: m?.[1] || 'SPY', source: 'rss', content: title });
      }
    } catch (e) {
      console.warn('[rss]', url, (e as Error).message);
    }
  }));
  if (results.length === 0) {
    return MOCK_TICKERS.slice(0, 5).map(t => ({
      ticker: t, source: 'rss' as const, content: `[mock] ${t} reports strong Q3 results`,
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

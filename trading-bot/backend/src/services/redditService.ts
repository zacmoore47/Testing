// Reddit OAuth client via snoowrap. Free tier supports 100 QPM which is plenty.
// Setup: https://www.reddit.com/prefs/apps → create "script" app
let snoowrap: any = null;
try { snoowrap = require('snoowrap'); } catch {}

let client: any = null;
function getClient() {
  if (client) return client;
  if (!snoowrap || !process.env.REDDIT_CLIENT_ID || !process.env.REDDIT_CLIENT_SECRET) return null;
  try {
    client = new snoowrap({
      userAgent: 'trading-bot/1.0',
      clientId: process.env.REDDIT_CLIENT_ID,
      clientSecret: process.env.REDDIT_CLIENT_SECRET,
      username: process.env.REDDIT_USERNAME,
      password: process.env.REDDIT_PASSWORD,
    });
    return client;
  } catch (e) {
    console.warn('[reddit] init failed:', (e as Error).message);
    return null;
  }
}

const SUBS = ['wallstreetbets', 'stocks', 'investing'];

export interface RedditPost { ticker: string; title: string; score: number; comments: number; }

export async function fetchRedditPosts(): Promise<RedditPost[]> {
  const c = getClient();
  if (!c) {
    // Public JSON endpoint fallback (no auth, lower reliability)
    try {
      const out: RedditPost[] = [];
      for (const sub of SUBS) {
        const r = await fetch(`https://www.reddit.com/r/${sub}/hot.json?limit=15`, {
          headers: { 'User-Agent': 'trading-bot/1.0' },
        });
        const data: any = await r.json();
        for (const ch of data?.data?.children || []) {
          const t = ch.data.title as string;
          const m = t.match(/\$?\b([A-Z]{2,5})\b/);
          if (m) out.push({ ticker: m[1], title: t, score: ch.data.score, comments: ch.data.num_comments });
        }
      }
      return out;
    } catch { return []; }
  }
  try {
    const all = await Promise.all(SUBS.map(sub => c.getSubreddit(sub).getHot({ limit: 25 })));
    const out: RedditPost[] = [];
    for (const posts of all) {
      for (const p of posts) {
        const t = p.title as string;
        const m = t.match(/\$?\b([A-Z]{2,5})\b/);
        if (m) out.push({ ticker: m[1], title: t, score: p.score, comments: p.num_comments });
      }
    }
    return out;
  } catch (e) {
    console.warn('[reddit] fetch failed:', (e as Error).message);
    return [];
  }
}

export const redditEnabled = () => !!process.env.REDDIT_CLIENT_ID;

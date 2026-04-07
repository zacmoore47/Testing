// X (Twitter) API v2 client. Requires a Bearer token from a Basic-tier or higher developer account.
// Free tier on X is read-zero — you need a paid plan ($100+/month) to actually read tweets.
// Get one at https://developer.x.com/

const TOKEN = process.env.TWITTER_BEARER_TOKEN;

export interface XPost { ticker: string; text: string; author: string; likes: number; createdAt: string; }

const CASHTAGS = ['$AAPL', '$NVDA', '$TSLA', '$AMD', '$META', '$MSFT', '$GOOGL', '$AMZN', '$SMCI', '$PLTR'];

export async function fetchXPosts(): Promise<XPost[]> {
  if (!TOKEN) return [];
  try {
    const query = encodeURIComponent(`(${CASHTAGS.join(' OR ')}) -is:retweet lang:en`);
    const r = await fetch(
      `https://api.twitter.com/2/tweets/search/recent?query=${query}&max_results=50&tweet.fields=public_metrics,created_at,author_id`,
      { headers: { Authorization: `Bearer ${TOKEN}` } }
    );
    if (!r.ok) {
      console.warn('[x] response', r.status, await r.text());
      return [];
    }
    const data: any = await r.json();
    return (data.data || []).map((t: any) => {
      const m = t.text.match(/\$([A-Z]{1,5})/);
      return {
        ticker: m?.[1] || 'UNKNOWN',
        text: t.text,
        author: t.author_id,
        likes: t.public_metrics?.like_count || 0,
        createdAt: t.created_at,
      };
    });
  } catch (e) {
    console.warn('[x] fetch failed:', (e as Error).message);
    return [];
  }
}

export const xEnabled = () => !!TOKEN;

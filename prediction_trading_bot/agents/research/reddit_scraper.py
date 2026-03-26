"""Reddit scraper — fetches top posts and comments, scores sentiment."""

import asyncio
import logging
from datetime import datetime, timezone

import praw
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

from prediction_trading_bot import config

logger = logging.getLogger(__name__)

_sentiment = SentimentIntensityAnalyzer()


def _build_reddit_client() -> praw.Reddit:
    """Create a read-only PRAW Reddit instance from config."""
    return praw.Reddit(
        client_id=config.REDDIT_CLIENT_ID,
        client_secret=config.REDDIT_CLIENT_SECRET,
        user_agent=config.REDDIT_USER_AGENT,
    )


def _keyword_match(text: str, keywords: list[str]) -> bool:
    """Return True if any keyword appears (case-insensitive) in *text*."""
    lower = text.lower()
    return any(kw.lower() in lower for kw in keywords)


def _scrape_sync(
    keywords: list[str],
    subreddits: list[str],
    limit: int,
) -> list[dict]:
    """Synchronous helper executed via ``asyncio.to_thread``."""
    reddit = _build_reddit_client()
    reddit.read_only = True
    results: list[dict] = []

    for sub_name in subreddits:
        try:
            subreddit = reddit.subreddit(sub_name)
            for submission in subreddit.hot(limit=limit):
                title = submission.title or ""
                selftext = submission.selftext or ""
                full_text = f"{title}. {selftext}".strip()

                if not _keyword_match(full_text, keywords):
                    continue

                sentiment = _sentiment.polarity_scores(full_text)["compound"]
                engagement = (submission.score or 0) + (submission.num_comments or 0)
                created_utc = datetime.fromtimestamp(
                    submission.created_utc, tz=timezone.utc
                )

                results.append(
                    {
                        "source": f"reddit/r/{sub_name}",
                        "text": full_text[:2000],
                        "sentiment_score": round(sentiment, 4),
                        "engagement": engagement,
                        "timestamp": created_utc.isoformat(),
                    }
                )

                # Also scan top-level comments for additional signal.
                submission.comment_sort = "top"
                submission.comments.replace_more(limit=0)
                for comment in submission.comments[:10]:
                    body = comment.body or ""
                    if not _keyword_match(body, keywords):
                        continue

                    c_sentiment = _sentiment.polarity_scores(body)["compound"]
                    c_created = datetime.fromtimestamp(
                        comment.created_utc, tz=timezone.utc
                    )

                    results.append(
                        {
                            "source": f"reddit/r/{sub_name}/comment",
                            "text": body[:2000],
                            "sentiment_score": round(c_sentiment, 4),
                            "engagement": comment.score or 0,
                            "timestamp": c_created.isoformat(),
                        }
                    )

        except Exception as exc:  # noqa: BLE001
            logger.error("Error scraping r/%s: %s", sub_name, exc)

    return results


async def scrape_reddit(
    keywords: list[str],
    subreddits: list[str] | None = None,
    limit: int = 50,
) -> list[dict]:
    """Scrape Reddit for posts/comments matching *keywords*.

    Returns a list of dicts with keys:
        source, text, sentiment_score, engagement, timestamp
    """
    if not config.REDDIT_CLIENT_ID or not config.REDDIT_CLIENT_SECRET:
        logger.error("Reddit credentials not set — skipping Reddit scrape.")
        return []

    subs = subreddits if subreddits is not None else config.SUBREDDITS

    try:
        results = await asyncio.to_thread(_scrape_sync, keywords, subs, limit)
        logger.info(
            "Scraped %d Reddit items for keywords %s across %d subreddits",
            len(results),
            keywords,
            len(subs),
        )
        return results
    except Exception as exc:  # noqa: BLE001
        logger.exception("Unexpected error during Reddit scrape: %s", exc)
        return []

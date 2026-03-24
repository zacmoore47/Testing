"""X (Twitter) scraper — searches recent tweets and scores sentiment."""

import logging
from datetime import datetime, timezone

import tweepy
import tweepy.asynchronous
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

from prediction_trading_bot import config

logger = logging.getLogger(__name__)

_sentiment = SentimentIntensityAnalyzer()


async def scrape_x(
    keywords: list[str],
    max_results: int = 100,
) -> list[dict]:
    """Search recent tweets matching *keywords* and return scored results.

    Each result dict has:
        source, text, sentiment_score, engagement, timestamp
    """
    if not config.TWITTER_BEARER_TOKEN:
        logger.error("TWITTER_BEARER_TOKEN is not set — skipping X scrape.")
        return []

    client = tweepy.asynchronous.AsyncClient(
        bearer_token=config.TWITTER_BEARER_TOKEN,
        wait_on_rate_limit=True,
    )

    query = " OR ".join(keywords) + " -is:retweet lang:en"
    results: list[dict] = []

    try:
        # Twitter API v2 caps per-request max_results at 100; paginate if needed.
        fetched = 0
        next_token: str | None = None

        while fetched < max_results:
            batch_size = min(max_results - fetched, 100)
            # Minimum allowed by the API is 10.
            batch_size = max(batch_size, 10)

            response = await client.search_recent_tweets(
                query=query,
                max_results=batch_size,
                tweet_fields=["created_at", "public_metrics"],
                next_token=next_token,
            )

            if response.data is None:
                logger.info("No tweets returned for query: %s", query)
                break

            for tweet in response.data:
                text: str = tweet.text
                metrics = tweet.public_metrics or {}
                likes = metrics.get("like_count", 0)
                retweets = metrics.get("retweet_count", 0)
                engagement = likes + retweets

                sentiment = _sentiment.polarity_scores(text)["compound"]

                created_at = tweet.created_at
                if created_at is None:
                    created_at = datetime.now(timezone.utc)

                results.append(
                    {
                        "source": "x",
                        "text": text,
                        "sentiment_score": round(sentiment, 4),
                        "engagement": engagement,
                        "timestamp": created_at.isoformat(),
                    }
                )

            fetched += len(response.data)
            meta = response.meta or {}
            next_token = meta.get("next_token")
            if next_token is None:
                break

        logger.info("Scraped %d tweets for keywords %s", len(results), keywords)

    except tweepy.TweepyException as exc:
        logger.error("Twitter API error: %s", exc)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Unexpected error during X scrape: %s", exc)

    return results

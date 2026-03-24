"""RSS scraper — fetches and parses RSS feeds, scores sentiment."""

import asyncio
import logging
from datetime import datetime, timezone
from difflib import SequenceMatcher
from email.utils import parsedate_to_datetime

import aiohttp
import feedparser
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

from prediction_trading_bot import config

logger = logging.getLogger(__name__)

_sentiment = SentimentIntensityAnalyzer()

_SIMILARITY_THRESHOLD = 0.85


def _parse_feed(raw_xml: str, feed_url: str) -> list[dict]:
    """Parse a single feed's XML into result dicts."""
    parsed = feedparser.parse(raw_xml)
    items: list[dict] = []

    for entry in parsed.entries:
        title = entry.get("title", "")
        summary = entry.get("summary", entry.get("description", ""))
        text = f"{title}. {summary}".strip()

        # Try to extract a timestamp.
        published = entry.get("published", entry.get("updated", ""))
        try:
            ts = parsedate_to_datetime(published).astimezone(timezone.utc)
        except Exception:  # noqa: BLE001
            ts = datetime.now(timezone.utc)

        sentiment = _sentiment.polarity_scores(text)["compound"]

        items.append(
            {
                "source": f"rss:{feed_url}",
                "text": text[:2000],
                "sentiment_score": round(sentiment, 4),
                "engagement": 0,
                "timestamp": ts.isoformat(),
            }
        )

    return items


async def _fetch_feed(
    session: aiohttp.ClientSession,
    url: str,
) -> list[dict]:
    """Download and parse a single RSS feed."""
    try:
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=15)) as resp:
            if resp.status != 200:
                logger.warning("Non-200 from RSS feed %s: %s", url, resp.status)
                return []
            raw = await resp.text()
            return _parse_feed(raw, url)
    except asyncio.TimeoutError:
        logger.warning("Timeout fetching RSS feed: %s", url)
        return []
    except Exception as exc:  # noqa: BLE001
        logger.error("Error fetching RSS feed %s: %s", url, exc)
        return []


def _is_duplicate(title_a: str, title_b: str) -> bool:
    """Return True if two titles are near-duplicates."""
    return SequenceMatcher(None, title_a.lower(), title_b.lower()).ratio() >= _SIMILARITY_THRESHOLD


def _deduplicate(items: list[dict]) -> list[dict]:
    """Remove near-duplicate entries based on title similarity."""
    unique: list[dict] = []
    for item in items:
        # Extract the title portion (text before the first period).
        title = item["text"].split(".")[0]
        if not any(_is_duplicate(title, u["text"].split(".")[0]) for u in unique):
            unique.append(item)
    return unique


def _keyword_filter(items: list[dict], keywords: list[str]) -> list[dict]:
    """Keep only items whose text contains at least one keyword."""
    lower_keywords = [kw.lower() for kw in keywords]
    return [
        item
        for item in items
        if any(kw in item["text"].lower() for kw in lower_keywords)
    ]


async def scrape_rss(
    keywords: list[str] | None = None,
) -> list[dict]:
    """Scrape configured RSS feeds and return scored items.

    If *keywords* is provided, only items matching at least one keyword
    are returned.  Results are deduplicated by headline similarity.

    Each result dict has keys:
        source, text, sentiment_score, engagement (always 0), timestamp
    """
    feeds = config.RSS_FEEDS
    if not feeds:
        logger.warning("No RSS feeds configured — skipping RSS scrape.")
        return []

    all_items: list[dict] = []

    async with aiohttp.ClientSession() as session:
        tasks = [_fetch_feed(session, url) for url in feeds]
        feed_results = await asyncio.gather(*tasks, return_exceptions=True)

        for result in feed_results:
            if isinstance(result, BaseException):
                logger.error("Feed task failed: %s", result)
                continue
            all_items.extend(result)

    # Deduplicate before filtering to keep the set small.
    all_items = _deduplicate(all_items)

    if keywords:
        all_items = _keyword_filter(all_items, keywords)

    logger.info("RSS scrape returned %d items (keywords=%s)", len(all_items), keywords)
    return all_items

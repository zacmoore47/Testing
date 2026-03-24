"""RSS scraper — fetches and parses RSS feeds, scores sentiment.

Uses stdlib xml.etree.ElementTree instead of feedparser to avoid the
sgmllib dependency that is broken on Python 3.11+.
"""

import asyncio
import logging
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from difflib import SequenceMatcher
from email.utils import parsedate_to_datetime

import aiohttp
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

from prediction_trading_bot import config

logger = logging.getLogger(__name__)

_sentiment = SentimentIntensityAnalyzer()

_SIMILARITY_THRESHOLD = 0.85

# Common RSS namespace prefixes
_NS = {
    "dc": "http://purl.org/dc/elements/1.1/",
    "content": "http://purl.org/rss/1.0/modules/content/",
    "atom": "http://www.w3.org/2005/Atom",
}


def _text(element: ET.Element | None) -> str:
    """Safely extract text from an XML element."""
    if element is None:
        return ""
    return (element.text or "").strip()


def _parse_feed(raw_xml: str, feed_url: str) -> list[dict]:
    """Parse a single feed's XML into result dicts using ElementTree."""
    items: list[dict] = []

    try:
        root = ET.fromstring(raw_xml)
    except ET.ParseError as exc:
        logger.warning("Failed to parse XML from %s: %s", feed_url, exc)
        return items

    # Handle RSS 2.0 (<rss><channel><item>)
    entries: list[ET.Element] = []
    channel = root.find("channel")
    if channel is not None:
        entries = channel.findall("item")

    # Handle Atom feeds (<feed><entry>)
    if not entries:
        entries = root.findall("{http://www.w3.org/2005/Atom}entry")
        if not entries:
            entries = root.findall("entry")

    # Handle RSS 1.0 / RDF
    if not entries:
        entries = root.findall("item")

    for entry in entries:
        # RSS 2.0 fields
        title = _text(entry.find("title"))
        if not title:
            title = _text(entry.find("{http://www.w3.org/2005/Atom}title"))

        summary = _text(entry.find("description"))
        if not summary:
            summary = _text(entry.find("{http://www.w3.org/2005/Atom}summary"))
        if not summary:
            content_el = entry.find("{http://www.w3.org/2005/Atom}content")
            summary = _text(content_el)

        text = f"{title}. {summary}".strip()
        if not text or text == ".":
            continue

        # Timestamp
        published = _text(entry.find("pubDate"))
        if not published:
            published = _text(entry.find("{http://purl.org/dc/elements/1.1/}date"))
        if not published:
            published = _text(entry.find("{http://www.w3.org/2005/Atom}published"))
        if not published:
            published = _text(entry.find("{http://www.w3.org/2005/Atom}updated"))

        try:
            ts = parsedate_to_datetime(published).astimezone(timezone.utc)
        except Exception:  # noqa: BLE001
            try:
                # Try ISO 8601 format (common in Atom feeds)
                ts = datetime.fromisoformat(published.replace("Z", "+00:00"))
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

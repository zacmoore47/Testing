"""Persistent storage for loss lessons using SQLite."""

import json
import logging
from typing import Any

import aiosqlite

from prediction_trading_bot.config import DB_PATH

logger = logging.getLogger(__name__)

CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS loss_lessons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    market_id TEXT NOT NULL,
    trade_id TEXT NOT NULL,
    findings_json TEXT NOT NULL,
    synthesized_lesson TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT '',
    keywords TEXT NOT NULL DEFAULT '',
    timestamp TEXT NOT NULL
)
"""

INSERT_SQL = """
INSERT INTO loss_lessons (market_id, trade_id, findings_json, synthesized_lesson, category, keywords, timestamp)
VALUES (?, ?, ?, ?, ?, ?, ?)
"""

SEARCH_SQL = """
SELECT market_id, trade_id, findings_json, synthesized_lesson, category, keywords, timestamp
FROM loss_lessons
WHERE category = ?
ORDER BY timestamp DESC
LIMIT ?
"""

KEYWORD_SEARCH_SQL = """
SELECT market_id, trade_id, findings_json, synthesized_lesson, category, keywords, timestamp
FROM loss_lessons
WHERE {keyword_clauses}
ORDER BY timestamp DESC
LIMIT ?
"""

COMBINED_SEARCH_SQL = """
SELECT market_id, trade_id, findings_json, synthesized_lesson, category, keywords, timestamp
FROM loss_lessons
WHERE category = ? AND ({keyword_clauses})
ORDER BY timestamp DESC
LIMIT ?
"""


def _extract_category(findings: list[dict[str, str]]) -> str:
    """Derive a category from the highest-severity finding's agent name."""
    severity_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    if not findings:
        return "unknown"
    sorted_findings = sorted(
        findings, key=lambda f: severity_order.get(f.get("severity", "medium"), 2)
    )
    agent_name = sorted_findings[0].get("agent_name", "unknown")
    # Map agent names to short categories
    category_map = {
        "Data Quality Agent": "data_quality",
        "Model Agent": "model",
        "Narrative Agent": "narrative",
        "Execution Agent": "execution",
        "Black Swan Agent": "black_swan",
    }
    return category_map.get(agent_name, "unknown")


def _extract_keywords(lesson: object) -> list[str]:
    """Extract searchable keywords from a lesson's synthesized text and findings."""
    keywords: list[str] = []
    synthesized = getattr(lesson, "synthesized_lesson", "")
    # Pull severity tags and agent names as keywords
    findings: list[dict[str, Any]] = getattr(lesson, "findings", [])
    for finding in findings:
        sev = finding.get("severity", "")
        if sev in ("high", "critical"):
            keywords.append(sev)
        agent = finding.get("agent_name", "")
        if agent:
            keywords.append(agent.lower().replace(" ", "_"))
    # Pull a few significant words from the synthesized lesson
    stop_words = {
        "the", "a", "an", "is", "was", "were", "be", "been", "to", "of", "and",
        "in", "for", "on", "with", "that", "this", "it", "from", "by", "at", "or",
        "as", "not", "but", "are", "has", "had", "have", "do", "did", "will",
        "would", "could", "should", "may", "might", "can", "no", "if", "so",
    }
    words = synthesized.lower().split()
    for w in words:
        cleaned = "".join(c for c in w if c.isalnum())
        if len(cleaned) > 3 and cleaned not in stop_words and cleaned not in keywords:
            keywords.append(cleaned)
            if len(keywords) >= 15:
                break
    return keywords


async def _ensure_table(db: aiosqlite.Connection) -> None:
    """Create the loss_lessons table if it does not already exist."""
    await db.execute(CREATE_TABLE_SQL)
    await db.commit()


async def store_lesson(lesson: object) -> None:
    """Persist a LossLesson (or compatible object) to the SQLite database.

    Args:
        lesson: An object with attributes ``market_id``, ``trade_id``,
            ``findings`` (list of dicts), ``synthesized_lesson`` (str),
            and ``timestamp`` (str).
    """
    market_id: str = getattr(lesson, "market_id", "unknown")
    trade_id: str = getattr(lesson, "trade_id", "unknown")
    findings: list[dict[str, Any]] = getattr(lesson, "findings", [])
    synthesized_lesson: str = getattr(lesson, "synthesized_lesson", "")
    timestamp: str = getattr(lesson, "timestamp", "")

    category = _extract_category(findings)
    keywords = _extract_keywords(lesson)

    findings_json = json.dumps(findings, default=str)
    keywords_str = ",".join(keywords)

    logger.info("Storing lesson for trade %s (category=%s)", trade_id, category)

    async with aiosqlite.connect(DB_PATH) as db:
        await _ensure_table(db)
        await db.execute(
            INSERT_SQL,
            (market_id, trade_id, findings_json, synthesized_lesson, category, keywords_str, timestamp),
        )
        await db.commit()

    logger.info("Lesson stored successfully for trade %s", trade_id)


async def get_relevant_lessons(
    market_category: str,
    keywords: list[str],
    limit: int = 3,
) -> list[dict[str, Any]]:
    """Retrieve the most relevant past lessons from the database.

    Searches by category and/or keywords. Returns the most recent matching
    lessons up to ``limit``.

    Args:
        market_category: A category string to filter on (e.g. "data_quality",
            "model", "narrative", "execution", "black_swan").
        keywords: A list of keyword strings to search within the keywords column.
        limit: Maximum number of lessons to return.

    Returns:
        A list of dicts, each containing the lesson fields.
    """
    logger.info(
        "Searching for lessons: category=%s, keywords=%s, limit=%d",
        market_category,
        keywords,
        limit,
    )

    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        await _ensure_table(db)

        has_category = bool(market_category and market_category.strip())
        has_keywords = bool(keywords)

        if has_category and has_keywords:
            keyword_clauses = " OR ".join(["keywords LIKE ?" for _ in keywords])
            sql = COMBINED_SEARCH_SQL.format(keyword_clauses=keyword_clauses)
            params: list[Any] = [market_category] + [f"%{kw}%" for kw in keywords] + [limit]
        elif has_category:
            sql = SEARCH_SQL
            params = [market_category, limit]
        elif has_keywords:
            keyword_clauses = " OR ".join(["keywords LIKE ?" for _ in keywords])
            sql = KEYWORD_SEARCH_SQL.format(keyword_clauses=keyword_clauses)
            params = [f"%{kw}%" for kw in keywords] + [limit]
        else:
            sql = (
                "SELECT market_id, trade_id, findings_json, synthesized_lesson, "
                "category, keywords, timestamp FROM loss_lessons "
                "ORDER BY timestamp DESC LIMIT ?"
            )
            params = [limit]

        cursor = await db.execute(sql, params)
        rows = await cursor.fetchall()

    results: list[dict[str, Any]] = []
    for row in rows:
        findings_raw = row["findings_json"] if isinstance(row, dict) else row[2]
        try:
            findings = json.loads(findings_raw)
        except (json.JSONDecodeError, TypeError):
            findings = []

        result: dict[str, Any] = {
            "market_id": row["market_id"] if isinstance(row, dict) else row[0],
            "trade_id": row["trade_id"] if isinstance(row, dict) else row[1],
            "findings": findings,
            "synthesized_lesson": row["synthesized_lesson"] if isinstance(row, dict) else row[3],
            "category": row["category"] if isinstance(row, dict) else row[4],
            "keywords": row["keywords"] if isinstance(row, dict) else row[5],
            "timestamp": row["timestamp"] if isinstance(row, dict) else row[6],
        }
        results.append(result)

    logger.info("Found %d relevant lessons", len(results))
    return results

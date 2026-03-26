"""Market scanner — fetches and filters active prediction-market opportunities."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone

import aiohttp

from prediction_trading_bot import config

logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class MarketOpportunity:
    market_id: str
    title: str
    current_yes_price: float
    volume: float
    liquidity: float
    closes_at: str
    category: str


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _hours_until(iso_timestamp: str) -> float:
    """Return hours from now until *iso_timestamp*."""
    try:
        target = datetime.fromisoformat(iso_timestamp.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return float("inf")
    delta = target - datetime.now(timezone.utc)
    return max(delta.total_seconds() / 3600, 0)


def _passes_filters(opp: MarketOpportunity, excluded_ids: set[str]) -> bool:
    """Return True when a market passes every configured filter."""
    if opp.market_id in excluded_ids:
        return False
    if opp.volume < config.MIN_DAILY_VOLUME:
        return False
    if opp.liquidity < config.MIN_LIQUIDITY:
        return False
    hours_left = _hours_until(opp.closes_at)
    if hours_left < config.MIN_HOURS_TO_RESOLUTION:
        return False
    if hours_left > config.MAX_DAYS_TO_RESOLUTION * 24:
        return False
    return True


# ---------------------------------------------------------------------------
# Manifold Markets
# ---------------------------------------------------------------------------

async def _fetch_manifold(session: aiohttp.ClientSession) -> list[MarketOpportunity]:
    """Fetch active binary markets from Manifold Markets v0 API."""
    url = f"{config.MANIFOLD_API_URL}/markets"
    params = {"limit": 500, "sort": "newest"}
    opportunities: list[MarketOpportunity] = []

    try:
        async with session.get(url, params=params) as resp:
            resp.raise_for_status()
            markets = await resp.json()
    except Exception:
        logger.exception("Failed to fetch markets from Manifold")
        return opportunities

    for m in markets:
        # Only keep binary, open markets
        if m.get("outcomeType") != "BINARY":
            continue
        if m.get("isResolved", False):
            continue

        close_time_ms = m.get("closeTime")
        if close_time_ms is None:
            continue
        closes_at = datetime.fromtimestamp(
            close_time_ms / 1000, tz=timezone.utc
        ).isoformat()

        probability = m.get("probability", 0.5)
        volume = m.get("volume", 0.0)
        liquidity = m.get("totalLiquidity", 0.0)
        category = (m.get("groupSlugs") or ["uncategorized"])[0]

        opportunities.append(
            MarketOpportunity(
                market_id=m["id"],
                title=m.get("question", ""),
                current_yes_price=round(probability, 4),
                volume=volume,
                liquidity=liquidity,
                closes_at=closes_at,
                category=category,
            )
        )

    logger.info("Manifold returned %d candidate markets", len(opportunities))
    return opportunities


# ---------------------------------------------------------------------------
# Polymarket (CLOB API)
# ---------------------------------------------------------------------------

async def _fetch_polymarket(session: aiohttp.ClientSession) -> list[MarketOpportunity]:
    """Fetch active markets from the Polymarket CLOB API."""
    url = f"{config.POLYMARKET_API_URL}/markets"
    opportunities: list[MarketOpportunity] = []
    next_cursor: str | None = None

    # Paginate up to 5 pages (100 per page) to stay reasonable.
    for _ in range(5):
        params: dict[str, str] = {}
        if next_cursor:
            params["next_cursor"] = next_cursor

        try:
            async with session.get(url, params=params) as resp:
                resp.raise_for_status()
                payload = await resp.json()
        except Exception:
            logger.exception("Failed to fetch markets from Polymarket")
            break

        data = payload if isinstance(payload, list) else payload.get("data", [])

        for m in data:
            if not m.get("active", False):
                continue
            if m.get("closed", False):
                continue

            tokens = m.get("tokens", [])
            yes_price = 0.5
            for tok in tokens:
                if tok.get("outcome", "").upper() == "YES":
                    yes_price = float(tok.get("price", 0.5))
                    break

            closes_at = m.get("end_date_iso", m.get("end_date", ""))
            volume = float(m.get("volume", 0))
            liquidity = float(m.get("liquidity", 0))
            category = m.get("category", "uncategorized") or "uncategorized"

            opportunities.append(
                MarketOpportunity(
                    market_id=str(m.get("condition_id", m.get("id", ""))),
                    title=m.get("question", m.get("title", "")),
                    current_yes_price=round(yes_price, 4),
                    volume=volume,
                    liquidity=liquidity,
                    closes_at=closes_at,
                    category=category,
                )
            )

        # Handle pagination
        if isinstance(payload, dict):
            next_cursor = payload.get("next_cursor")
            if not next_cursor:
                break
        else:
            break

    logger.info("Polymarket returned %d candidate markets", len(opportunities))
    return opportunities


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def scan_markets(
    excluded_ids: set[str] | None = None,
) -> list[MarketOpportunity]:
    """Scan the configured prediction-market platform for tradeable opportunities.

    Parameters
    ----------
    excluded_ids:
        Market IDs that should be skipped (e.g. already-held positions).

    Returns
    -------
    list[MarketOpportunity]
        Filtered markets sorted by 24-hour volume descending.
    """
    excluded: set[str] = excluded_ids or set()

    async with aiohttp.ClientSession() as session:
        if config.MARKET_PLATFORM.lower() == "polymarket":
            raw = await _fetch_polymarket(session)
        else:
            raw = await _fetch_manifold(session)

    filtered = [opp for opp in raw if _passes_filters(opp, excluded)]
    filtered.sort(key=lambda o: o.volume, reverse=True)

    logger.info(
        "scan_markets: %d markets passed filters (out of %d fetched)",
        len(filtered),
        len(raw),
    )
    return filtered

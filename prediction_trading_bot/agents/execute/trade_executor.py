"""Trade execution and settlement polling.

Places trades on Manifold Markets or Polymarket (configurable via
``config.MARKET_PLATFORM``) and polls for settlement, recording outcomes in a
SQLite database.
"""

from __future__ import annotations

import asyncio
import datetime
import logging
import uuid

import aiohttp
import aiosqlite

from prediction_trading_bot import config

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Database helpers
# ---------------------------------------------------------------------------

CREATE_TRADES_TABLE = """
CREATE TABLE IF NOT EXISTS trades (
    trade_id   TEXT PRIMARY KEY,
    market_id  TEXT NOT NULL,
    side       TEXT NOT NULL,
    amount     REAL NOT NULL,
    placed_at  TEXT NOT NULL,
    settled_at TEXT,
    outcome    TEXT,
    pnl        REAL
);
"""


async def _ensure_table(db_path: str) -> None:
    """Create the trades table if it doesn't already exist."""
    async with aiosqlite.connect(db_path) as db:
        await db.execute(CREATE_TRADES_TABLE)
        await db.commit()


# ---------------------------------------------------------------------------
# Trade placement
# ---------------------------------------------------------------------------


async def _place_manifold_bet(
    market_id: str,
    side: str,
    amount: float,
    session: aiohttp.ClientSession,
) -> dict:
    """Place a bet via the Manifold Markets API (POST /v0/bet)."""
    url = f"{config.MANIFOLD_API_URL}/bet"
    payload = {
        "contractId": market_id,
        "outcome": side.upper(),  # "YES" or "NO"
        "amount": amount,
    }
    headers = {"Content-Type": "application/json"}

    # Manifold uses an API key passed as an Authorization header.
    manifold_api_key = getattr(config, "MANIFOLD_API_KEY", None)
    if manifold_api_key:
        headers["Authorization"] = f"Key {manifold_api_key}"

    async with session.post(url, json=payload, headers=headers) as resp:
        resp.raise_for_status()
        data = await resp.json()
        return data


async def _place_polymarket_bet(
    market_id: str,
    side: str,
    amount: float,
    session: aiohttp.ClientSession,
) -> dict:
    """Place an order via the Polymarket CLOB API."""
    url = f"{config.POLYMARKET_API_URL}/order"
    payload = {
        "tokenID": market_id,
        "side": side.upper(),
        "size": amount,
        "type": "market",
    }
    headers = {
        "Content-Type": "application/json",
        "POLY_API_KEY": config.POLYMARKET_PRIVATE_KEY,
    }

    async with session.post(url, json=payload, headers=headers) as resp:
        resp.raise_for_status()
        data = await resp.json()
        return data


async def execute_trade(
    market_id: str,
    side: str,
    amount: float,
    dry_run: bool = False,
) -> dict:
    """Execute a trade on the configured platform.

    Parameters
    ----------
    market_id:
        Platform-specific market / contract identifier.
    side:
        ``"YES"`` or ``"NO"`` (Manifold) / ``"BUY"`` or ``"SELL"`` (Polymarket).
    amount:
        Dollar amount to wager.
    dry_run:
        If ``True``, skip the actual API call and return a simulated result.

    Returns
    -------
    dict
        ``{"trade_id": str, "status": str, "market_id": str, "side": str, "amount": float}``
    """
    trade_id = str(uuid.uuid4())
    placed_at = datetime.datetime.now(datetime.timezone.utc).isoformat()

    if dry_run:
        logger.info(
            "[DRY RUN] Would place %s $%.2f on market %s (%s)",
            side,
            amount,
            market_id,
            config.MARKET_PLATFORM,
        )
        result = {
            "trade_id": trade_id,
            "status": "dry_run",
            "market_id": market_id,
            "side": side,
            "amount": amount,
        }
    else:
        async with aiohttp.ClientSession() as session:
            try:
                if config.MARKET_PLATFORM == "polymarket":
                    api_response = await _place_polymarket_bet(
                        market_id, side, amount, session
                    )
                else:
                    api_response = await _place_manifold_bet(
                        market_id, side, amount, session
                    )

                # Use the platform's trade ID if available, else keep ours.
                trade_id = str(
                    api_response.get("id")
                    or api_response.get("orderID")
                    or trade_id
                )

                logger.info(
                    "Trade placed: id=%s market=%s side=%s amount=%.2f platform=%s",
                    trade_id,
                    market_id,
                    side,
                    amount,
                    config.MARKET_PLATFORM,
                )

                result = {
                    "trade_id": trade_id,
                    "status": "placed",
                    "market_id": market_id,
                    "side": side,
                    "amount": amount,
                }
            except aiohttp.ClientResponseError as exc:
                logger.error(
                    "API error placing trade on %s: %s %s",
                    config.MARKET_PLATFORM,
                    exc.status,
                    exc.message,
                )
                result = {
                    "trade_id": trade_id,
                    "status": f"error:{exc.status}",
                    "market_id": market_id,
                    "side": side,
                    "amount": amount,
                }
            except Exception as exc:
                logger.error(
                    "Unexpected error placing trade: %s: %s",
                    type(exc).__name__,
                    exc,
                )
                result = {
                    "trade_id": trade_id,
                    "status": f"error:{type(exc).__name__}",
                    "market_id": market_id,
                    "side": side,
                    "amount": amount,
                }

    # Record the trade in the database.
    try:
        await _ensure_table(config.DB_PATH)
        async with aiosqlite.connect(config.DB_PATH) as db:
            await db.execute(
                "INSERT INTO trades (trade_id, market_id, side, amount, placed_at) "
                "VALUES (?, ?, ?, ?, ?)",
                (trade_id, market_id, side, amount, placed_at),
            )
            await db.commit()
        logger.debug("Trade %s recorded in database", trade_id)
    except Exception as exc:
        logger.error("Failed to record trade %s in DB: %s", trade_id, exc)

    return result


# ---------------------------------------------------------------------------
# Settlement polling
# ---------------------------------------------------------------------------


async def _check_manifold_settlement(
    market_id: str,
    session: aiohttp.ClientSession,
) -> dict | None:
    """Return resolution data if the Manifold market has resolved, else None."""
    url = f"{config.MANIFOLD_API_URL}/market/{market_id}"
    async with session.get(url) as resp:
        resp.raise_for_status()
        data = await resp.json()
    if data.get("isResolved"):
        return {
            "outcome": data.get("resolution", "UNKNOWN"),
            "resolution_probability": data.get("resolutionProbability"),
        }
    return None


async def _check_polymarket_settlement(
    market_id: str,
    session: aiohttp.ClientSession,
) -> dict | None:
    """Return resolution data if the Polymarket condition has resolved, else None."""
    url = f"{config.POLYMARKET_API_URL}/markets/{market_id}"
    async with session.get(url) as resp:
        resp.raise_for_status()
        data = await resp.json()
    if data.get("resolved"):
        return {
            "outcome": data.get("outcome", "UNKNOWN"),
        }
    return None


async def poll_settlement(trade_id: str, market_id: str) -> None:
    """Poll for market resolution and record the outcome.

    Checks the market every ``config.SETTLEMENT_POLL_MINUTES`` minutes until
    it resolves, then updates the trade record in the SQLite database with
    the settlement timestamp, outcome, and estimated P&L.

    Parameters
    ----------
    trade_id:
        The trade to monitor (must already exist in the DB).
    market_id:
        The platform market identifier to poll.
    """
    poll_interval = config.SETTLEMENT_POLL_MINUTES * 60  # seconds

    logger.info(
        "Starting settlement poll for trade %s (market %s) every %d minutes",
        trade_id,
        market_id,
        config.SETTLEMENT_POLL_MINUTES,
    )

    await _ensure_table(config.DB_PATH)

    # Fetch trade details so we can compute P&L later.
    async with aiosqlite.connect(config.DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT side, amount FROM trades WHERE trade_id = ?", (trade_id,)
        )
        row = await cursor.fetchone()

    if row is None:
        logger.error("Trade %s not found in DB; aborting settlement poll", trade_id)
        return

    side = row["side"]
    amount = row["amount"]

    while True:
        try:
            async with aiohttp.ClientSession() as session:
                if config.MARKET_PLATFORM == "polymarket":
                    result = await _check_polymarket_settlement(market_id, session)
                else:
                    result = await _check_manifold_settlement(market_id, session)

            if result is not None:
                outcome = result["outcome"]
                settled_at = datetime.datetime.now(datetime.timezone.utc).isoformat()

                # Simple P&L estimate: if outcome matches our side we profit
                # roughly (1 - implied_cost) * amount; otherwise we lose amount.
                won = outcome.upper() == side.upper()
                pnl = amount if won else -amount

                async with aiosqlite.connect(config.DB_PATH) as db:
                    await db.execute(
                        "UPDATE trades SET settled_at = ?, outcome = ?, pnl = ? "
                        "WHERE trade_id = ?",
                        (settled_at, outcome, pnl, trade_id),
                    )
                    await db.commit()

                logger.info(
                    "Trade %s settled: outcome=%s, pnl=%.2f",
                    trade_id,
                    outcome,
                    pnl,
                )
                return

        except Exception as exc:
            logger.warning(
                "Error polling settlement for trade %s: %s: %s",
                trade_id,
                type(exc).__name__,
                exc,
            )

        await asyncio.sleep(poll_interval)

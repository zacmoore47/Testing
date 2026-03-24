"""Risk-management approval gate.

Every trade must pass through ``approve_trade`` before execution.
The function enforces hard limits (daily loss, open positions, minimum edge,
liquidity) and then asks Claude for a final sanity check on the trade
rationale.
"""

from __future__ import annotations

import logging

import anthropic

from prediction_trading_bot import config

logger = logging.getLogger(__name__)


async def approve_trade(
    market_id: str,
    market_title: str,
    edge: float,
    bet_size: float,
    reasoning: str,
    current_daily_loss: float,
    open_positions: int,
    liquidity: float,
) -> dict:
    """Decide whether a proposed trade should be executed.

    Parameters
    ----------
    market_id:
        Market identifier.
    market_title:
        Human-readable title of the prediction market.
    edge:
        Estimated edge (our_probability - market_price).
    bet_size:
        Dollar amount the Kelly sizer recommends.
    reasoning:
        Free-text rationale produced by the research/analysis pipeline.
    current_daily_loss:
        Cumulative P&L loss for the current day (positive number = loss).
    open_positions:
        Number of currently open positions.
    liquidity:
        Market liquidity in dollars.

    Returns
    -------
    dict
        ``{"approved": bool, "reason": str}``
    """

    # --- Hard-limit checks (any failure is an immediate reject) ---

    if current_daily_loss >= config.DAILY_LOSS_LIMIT:
        reason = (
            f"Daily loss limit reached: current loss ${current_daily_loss:.2f} "
            f">= limit ${config.DAILY_LOSS_LIMIT:.2f}"
        )
        logger.warning("Trade BLOCKED for %s: %s", market_id, reason)
        return {"approved": False, "reason": reason}

    if open_positions >= config.MAX_OPEN_POSITIONS:
        reason = (
            f"Max open positions reached: {open_positions} "
            f">= limit {config.MAX_OPEN_POSITIONS}"
        )
        logger.warning("Trade BLOCKED for %s: %s", market_id, reason)
        return {"approved": False, "reason": reason}

    if edge < config.EDGE_THRESHOLD:
        reason = (
            f"Edge too small: {edge:.4f} < minimum {config.EDGE_THRESHOLD:.4f}"
        )
        logger.warning("Trade BLOCKED for %s: %s", market_id, reason)
        return {"approved": False, "reason": reason}

    if liquidity < config.MIN_LIQUIDITY:
        reason = (
            f"Market illiquid: liquidity ${liquidity:.2f} "
            f"< minimum ${config.MIN_LIQUIDITY:.2f}"
        )
        logger.warning("Trade BLOCKED for %s: %s", market_id, reason)
        return {"approved": False, "reason": reason}

    # --- LLM sanity check ---
    try:
        client = anthropic.AsyncAnthropic(api_key=config.ANTHROPIC_API_KEY)

        prompt = (
            "You are a risk manager for a prediction-market trading bot. "
            "Review the following proposed trade and decide if it should proceed.\n\n"
            f"Market ID: {market_id}\n"
            f"Market Title: {market_title}\n"
            f"Estimated Edge: {edge:.4f}\n"
            f"Proposed Bet Size: ${bet_size:.2f}\n"
            f"Market Liquidity: ${liquidity:.2f}\n"
            f"Current Daily Loss: ${current_daily_loss:.2f}\n"
            f"Open Positions: {open_positions}\n\n"
            f"Analyst Reasoning:\n{reasoning}\n\n"
            "Respond with EXACTLY one of these two formats (no extra text):\n"
            "APPROVE: <one-sentence justification>\n"
            "REJECT: <one-sentence justification>"
        )

        message = await client.messages.create(
            model=config.LLM_MODEL,
            max_tokens=256,
            temperature=0.0,
            messages=[{"role": "user", "content": prompt}],
        )

        llm_response = message.content[0].text.strip()
        logger.info("LLM risk check for %s: %s", market_id, llm_response)

        if llm_response.upper().startswith("APPROVE"):
            reason = llm_response.split(":", 1)[1].strip() if ":" in llm_response else "LLM approved"
            return {"approved": True, "reason": reason}
        else:
            reason = llm_response.split(":", 1)[1].strip() if ":" in llm_response else llm_response
            logger.warning("Trade REJECTED by LLM for %s: %s", market_id, reason)
            return {"approved": False, "reason": reason}

    except Exception as exc:
        # If the LLM call fails we fail-closed (reject).
        reason = f"LLM sanity check failed ({type(exc).__name__}: {exc}); rejecting trade as precaution"
        logger.error("Trade BLOCKED for %s: %s", market_id, reason)
        return {"approved": False, "reason": reason}

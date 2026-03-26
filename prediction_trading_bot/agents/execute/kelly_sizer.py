"""Kelly Criterion bet sizing for prediction markets.

Implements full Kelly: f* = (b*p - q) / b
where b = decimal odds derived from market price, p = our probability, q = 1 - p.
Applies fractional Kelly and caps max bet as a fraction of bankroll.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from prediction_trading_bot import config

logger = logging.getLogger(__name__)


@dataclass
class BetSize:
    """Result of a Kelly bet-sizing calculation."""

    market_id: str
    recommended_size: float
    kelly_fraction: float
    bankroll_at_risk: float


async def size_bet(
    market_id: str,
    our_probability: float,
    market_price: float,
    bankroll: float | None = None,
) -> BetSize:
    """Compute the Kelly-optimal bet size for a prediction-market position.

    Parameters
    ----------
    market_id:
        Identifier of the market being sized.
    our_probability:
        Our estimated true probability of the outcome (0, 1).
    market_price:
        Current market price / implied probability (0, 1).
    bankroll:
        Total available capital.  Falls back to ``config.BANKROLL``.

    Returns
    -------
    BetSize
        Dataclass with the recommended bet and supporting metrics.
    """
    if bankroll is None:
        bankroll = config.BANKROLL

    # --- Validate inputs ---
    if not (0.0 < our_probability < 1.0):
        logger.warning(
            "our_probability=%.4f out of range for market %s; clamping",
            our_probability,
            market_id,
        )
        our_probability = max(0.001, min(0.999, our_probability))

    if not (0.0 < market_price < 1.0):
        logger.warning(
            "market_price=%.4f out of range for market %s; clamping",
            market_price,
            market_id,
        )
        market_price = max(0.001, min(0.999, market_price))

    if bankroll <= 0:
        logger.error("Non-positive bankroll (%.2f) for market %s", bankroll, market_id)
        return BetSize(
            market_id=market_id,
            recommended_size=0.0,
            kelly_fraction=0.0,
            bankroll_at_risk=0.0,
        )

    # --- Full Kelly calculation ---
    # b = decimal odds the market offers (what you win per $1 risked)
    # If we buy YES at price `market_price`, payout on win is 1.0,
    # so net profit per $1 risked = (1 - market_price) / market_price.
    b = (1.0 - market_price) / market_price
    p = our_probability
    q = 1.0 - p

    full_kelly_fraction = (b * p - q) / b if b > 0 else 0.0

    logger.debug(
        "Market %s: b=%.4f, p=%.4f, q=%.4f, full_kelly=%.4f",
        market_id,
        b,
        p,
        q,
        full_kelly_fraction,
    )

    # Negative Kelly means no edge — do not bet.
    if full_kelly_fraction <= 0:
        logger.info(
            "No positive edge for market %s (kelly=%.4f); recommending zero bet",
            market_id,
            full_kelly_fraction,
        )
        return BetSize(
            market_id=market_id,
            recommended_size=0.0,
            kelly_fraction=0.0,
            bankroll_at_risk=0.0,
        )

    # --- Apply fractional Kelly ---
    fractional_kelly = full_kelly_fraction * config.KELLY_FRACTION

    # --- Cap at maximum bet fraction ---
    capped_fraction = min(fractional_kelly, config.MAX_BET_FRACTION)

    recommended_size = round(capped_fraction * bankroll, 2)
    bankroll_at_risk = round(capped_fraction * 100, 4)

    logger.info(
        "Market %s: full_kelly=%.4f, fractional(%.2fx)=%.4f, capped=%.4f, "
        "recommended=$%.2f of $%.2f bankroll (%.2f%% at risk)",
        market_id,
        full_kelly_fraction,
        config.KELLY_FRACTION,
        fractional_kelly,
        capped_fraction,
        recommended_size,
        bankroll,
        bankroll_at_risk,
    )

    return BetSize(
        market_id=market_id,
        recommended_size=recommended_size,
        kelly_fraction=capped_fraction,
        bankroll_at_risk=bankroll_at_risk,
    )

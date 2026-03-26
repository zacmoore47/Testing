"""LLM calibrator — uses Claude as a superforecaster to refine XGBoost estimates."""

from __future__ import annotations

import json
import logging
import re

import anthropic

from prediction_trading_bot import config

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Prompt template
# ---------------------------------------------------------------------------

_SYSTEM_PROMPT = (
    "You are a superforecaster with deep expertise in calibrated probability "
    "estimation. You combine quantitative models with qualitative reasoning to "
    "produce well-calibrated probability estimates for prediction markets. "
    "Always output valid JSON."
)

_USER_TEMPLATE = """\
Analyze the following prediction-market opportunity and return a calibrated \
probability estimate.

### Market
- **Title:** {title}
- **Current YES price (implied probability):** {market_price:.4f}
- **Category:** {category}
- **Closes at:** {closes_at}

### Quantitative Model (XGBoost)
- **XGBoost estimated probability:** {xgb_probability:.4f}
- **Confidence interval:** ({ci_lo:.4f}, {ci_hi:.4f})

### Narrative / Qualitative Analysis
{narrative_summary}

### Base-Rate Context
- Historical base rate for similar markets: {base_rate:.4f}

Instructions:
1. Weigh the quantitative estimate against the narrative evidence.
2. Consider how the current market price compares to your estimate.
3. Identify any information the model may be missing.
4. Return your answer as a JSON object with exactly these keys:
   - "calibrated_probability": float (0-1)
   - "edge": float (your probability minus the market price, can be negative)
   - "reasoning": string (2-4 sentences)

Respond ONLY with the JSON object, no markdown fences or extra text.
"""


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _parse_json_response(text: str) -> dict:
    """Best-effort extraction of a JSON object from Claude's reply."""
    # Try direct parse first
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Strip markdown code fences if present
    stripped = re.sub(r"```(?:json)?\s*", "", text)
    stripped = stripped.replace("```", "").strip()
    try:
        return json.loads(stripped)
    except json.JSONDecodeError:
        pass

    # Last resort: find first { ... } block
    match = re.search(r"\{[\s\S]*\}", text)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass

    logger.error("Could not parse JSON from Claude response: %s", text[:300])
    return {}


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def calibrate(
    market: object,
    xgb_result: object,
    narrative: dict,
) -> dict:
    """Ask Claude to calibrate an XGBoost prediction.

    Parameters
    ----------
    market:
        A ``MarketOpportunity`` (or any object with the expected attrs).
    xgb_result:
        A ``PredictionResult`` from the XGBoost model.
    narrative:
        Dict with at least ``"summary"`` (str) and optionally
        ``"base_rate"`` (float).

    Returns
    -------
    dict
        Keys: market_id, calibrated_probability, edge, reasoning, proceed.
    """
    market_id = getattr(market, "market_id", "unknown")
    market_price = getattr(market, "current_yes_price", 0.5)
    title = getattr(market, "title", "")
    category = getattr(market, "category", "uncategorized")
    closes_at = getattr(market, "closes_at", "")
    xgb_probability = getattr(xgb_result, "xgb_probability", 0.5)
    ci = getattr(xgb_result, "confidence_interval", (0.4, 0.6))
    narrative_summary = narrative.get("summary", "No narrative analysis available.")
    base_rate = narrative.get("base_rate", market_price)

    user_message = _USER_TEMPLATE.format(
        title=title,
        market_price=market_price,
        category=category,
        closes_at=closes_at,
        xgb_probability=xgb_probability,
        ci_lo=ci[0],
        ci_hi=ci[1],
        narrative_summary=narrative_summary,
        base_rate=base_rate,
    )

    client = anthropic.AsyncAnthropic(api_key=config.ANTHROPIC_API_KEY)

    try:
        response = await client.messages.create(
            model=config.LLM_MODEL,
            max_tokens=config.LLM_MAX_TOKENS,
            temperature=config.LLM_TEMPERATURE,
            system=_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_message}],
        )
        raw_text = response.content[0].text
    except Exception:
        logger.exception("Claude API call failed for market %s", market_id)
        # Graceful fallback: use the XGBoost estimate directly.
        edge = xgb_probability - market_price
        return {
            "market_id": market_id,
            "calibrated_probability": xgb_probability,
            "edge": round(edge, 4),
            "reasoning": "LLM calibration failed; falling back to XGBoost estimate.",
            "proceed": edge > config.EDGE_THRESHOLD,
        }

    parsed = _parse_json_response(raw_text)

    calibrated_probability = float(
        parsed.get("calibrated_probability", xgb_probability)
    )
    edge = calibrated_probability - market_price
    reasoning = parsed.get(
        "reasoning",
        "No reasoning returned by Claude.",
    )

    proceed = edge > config.EDGE_THRESHOLD

    logger.info(
        "LLM calibration for %s: calibrated=%.4f  edge=%.4f  proceed=%s",
        market_id,
        calibrated_probability,
        edge,
        proceed,
    )

    return {
        "market_id": market_id,
        "calibrated_probability": round(calibrated_probability, 4),
        "edge": round(edge, 4),
        "reasoning": reasoning,
        "proceed": proceed,
    }

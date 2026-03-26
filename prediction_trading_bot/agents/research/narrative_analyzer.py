"""Narrative analyzer — uses Claude to extract dominant narratives and edge."""

import json
import logging

import anthropic

from prediction_trading_bot import config

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = (
    "You are a prediction-market research analyst. You will receive aggregated "
    "research data (tweets, Reddit posts, RSS headlines) together with a market "
    "title and its current price (probability). Your job is to:\n"
    "1. Identify the single dominant narrative across the data.\n"
    "2. Estimate the implied probability suggested by the narrative.\n"
    "3. Compare that probability to the current market price.\n"
    "4. Compute a narrative_edge between -1 and +1 (positive = narrative "
    "suggests the market is underpriced, negative = overpriced).\n\n"
    "Respond ONLY with valid JSON matching this schema:\n"
    "{\n"
    '  "dominant_narrative": "<string>",\n'
    '  "implied_probability": <float 0-1>,\n'
    '  "narrative_edge": <float -1 to 1>,\n'
    '  "reasoning": "<string>"\n'
    "}"
)


def _build_user_prompt(
    research_data: list[dict],
    market_title: str,
    market_price: float,
) -> str:
    """Assemble the user message for Claude."""
    # Trim data to avoid excessive token use — keep the most engaged items.
    sorted_data = sorted(
        research_data, key=lambda d: d.get("engagement", 0), reverse=True
    )
    top_items = sorted_data[:80]

    snippets: list[str] = []
    for item in top_items:
        snippets.append(
            f"[{item.get('source', 'unknown')}] "
            f"(sentiment={item.get('sentiment_score', 'N/A')}, "
            f"engagement={item.get('engagement', 0)}) "
            f"{item.get('text', '')[:500]}"
        )

    data_block = "\n".join(snippets)

    return (
        f"Market: {market_title}\n"
        f"Current price (probability): {market_price}\n\n"
        f"--- Research Data ({len(top_items)} items) ---\n"
        f"{data_block}\n"
        f"--- End ---\n\n"
        "Analyze the above and respond with the JSON object only."
    )


def _parse_response(raw_text: str) -> dict:
    """Extract JSON from Claude's response, handling markdown fences."""
    text = raw_text.strip()

    # Strip optional markdown code fences.
    if text.startswith("```"):
        # Remove first line (```json or ```) and last line (```)
        lines = text.splitlines()
        lines = [l for l in lines if not l.strip().startswith("```")]
        text = "\n".join(lines).strip()

    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        logger.error("Failed to parse Claude response as JSON: %s", exc)
        logger.debug("Raw response: %s", raw_text[:500])
        return {
            "dominant_narrative": "Parse error — could not extract narrative.",
            "implied_probability": 0.5,
            "narrative_edge": 0.0,
            "reasoning": f"JSON parse failed: {exc}",
        }

    # Clamp narrative_edge to [-1, 1].
    edge = data.get("narrative_edge", 0.0)
    try:
        edge = float(edge)
    except (TypeError, ValueError):
        edge = 0.0
    data["narrative_edge"] = max(-1.0, min(1.0, edge))

    # Ensure all expected keys exist.
    data.setdefault("dominant_narrative", "")
    data.setdefault("implied_probability", 0.5)
    data.setdefault("reasoning", "")

    return data


async def analyze_narrative(
    research_data: list[dict],
    market_title: str,
    market_price: float,
) -> dict:
    """Analyze aggregated research data and return narrative edge.

    Returns a dict with keys:
        dominant_narrative, implied_probability, narrative_edge, reasoning
    """
    if not research_data:
        logger.warning("No research data provided — returning neutral analysis.")
        return {
            "dominant_narrative": "No data available.",
            "implied_probability": market_price,
            "narrative_edge": 0.0,
            "reasoning": "Insufficient research data to form a narrative.",
        }

    if not config.ANTHROPIC_API_KEY:
        logger.error("ANTHROPIC_API_KEY is not set — cannot run narrative analysis.")
        return {
            "dominant_narrative": "API key missing.",
            "implied_probability": market_price,
            "narrative_edge": 0.0,
            "reasoning": "Anthropic API key not configured.",
        }

    client = anthropic.AsyncAnthropic(api_key=config.ANTHROPIC_API_KEY)
    user_prompt = _build_user_prompt(research_data, market_title, market_price)

    try:
        message = await client.messages.create(
            model=config.LLM_MODEL,
            max_tokens=config.LLM_MAX_TOKENS,
            temperature=config.LLM_TEMPERATURE,
            system=_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_prompt}],
        )

        raw_text = message.content[0].text
        result = _parse_response(raw_text)

        logger.info(
            "Narrative analysis complete — edge=%.3f for '%s'",
            result["narrative_edge"],
            market_title,
        )
        return result

    except anthropic.APIError as exc:
        logger.error("Anthropic API error during narrative analysis: %s", exc)
        return {
            "dominant_narrative": "API error.",
            "implied_probability": market_price,
            "narrative_edge": 0.0,
            "reasoning": f"Anthropic API error: {exc}",
        }
    except Exception as exc:  # noqa: BLE001
        logger.exception("Unexpected error in narrative analysis: %s", exc)
        return {
            "dominant_narrative": "Unexpected error.",
            "implied_probability": market_price,
            "narrative_edge": 0.0,
            "reasoning": f"Unexpected error: {exc}",
        }

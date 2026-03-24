"""Post-mortem analysis of losing trades using parallel Claude agents."""

import asyncio
import json
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

import anthropic

from prediction_trading_bot.config import (
    ANTHROPIC_API_KEY,
    LLM_MAX_TOKENS,
    LLM_MODEL,
    LLM_TEMPERATURE,
)

logger = logging.getLogger(__name__)

AGENT_PROMPTS: dict[str, str] = {
    "Data Quality Agent": (
        "You are a Data Quality Agent. Analyze the following losing trade and determine "
        "whether the input data (market prices, volumes, news feeds, social signals) was "
        "reliable and accurate at the time of the trade. Look for stale data, missing fields, "
        "contradictory sources, or data-feed outages.\n\n"
        "Trade data:\n{trade_data}\n\n"
        "Respond with ONLY a JSON object (no markdown fences) with these exact keys:\n"
        '  "agent_name": "Data Quality Agent",\n'
        '  "finding": "<your finding>",\n'
        '  "recommendation": "<your recommendation>",\n'
        '  "severity": "<low|medium|high|critical>"'
    ),
    "Model Agent": (
        "You are a Model Agent. Analyze the following losing trade and determine whether "
        "the XGBoost probability estimate was reasonable given the available features. "
        "Consider whether feature engineering was adequate, whether the model was over- or "
        "under-confident, and whether known calibration issues could explain the miss.\n\n"
        "Trade data:\n{trade_data}\n\n"
        "Respond with ONLY a JSON object (no markdown fences) with these exact keys:\n"
        '  "agent_name": "Model Agent",\n'
        '  "finding": "<your finding>",\n'
        '  "recommendation": "<your recommendation>",\n'
        '  "severity": "<low|medium|high|critical>"'
    ),
    "Narrative Agent": (
        "You are a Narrative Agent. Analyze the following losing trade and determine whether "
        "the LLM narrative assessment was accurate. Did the language model misinterpret news "
        "sentiment, miss key context, fall for misleading headlines, or over-weight a single "
        "source?\n\n"
        "Trade data:\n{trade_data}\n\n"
        "Respond with ONLY a JSON object (no markdown fences) with these exact keys:\n"
        '  "agent_name": "Narrative Agent",\n'
        '  "finding": "<your finding>",\n'
        '  "recommendation": "<your recommendation>",\n'
        '  "severity": "<low|medium|high|critical>"'
    ),
    "Execution Agent": (
        "You are an Execution Agent. Analyze the following losing trade and determine whether "
        "the bet sizing and timing were correct. Consider Kelly criterion application, slippage, "
        "position concentration, and whether the trade was entered too early or too late relative "
        "to information flow.\n\n"
        "Trade data:\n{trade_data}\n\n"
        "Respond with ONLY a JSON object (no markdown fences) with these exact keys:\n"
        '  "agent_name": "Execution Agent",\n'
        '  "finding": "<your finding>",\n'
        '  "recommendation": "<your recommendation>",\n'
        '  "severity": "<low|medium|high|critical>"'
    ),
    "Black Swan Agent": (
        "You are a Black Swan Agent. Analyze the following losing trade and determine whether "
        "the loss was caused by a genuinely unpredictable event — a true outlier that no "
        "reasonable model or analyst could have foreseen. Distinguish between 'hard to predict' "
        "and 'truly unpredictable'.\n\n"
        "Trade data:\n{trade_data}\n\n"
        "Respond with ONLY a JSON object (no markdown fences) with these exact keys:\n"
        '  "agent_name": "Black Swan Agent",\n'
        '  "finding": "<your finding>",\n'
        '  "recommendation": "<your recommendation>",\n'
        '  "severity": "<low|medium|high|critical>"'
    ),
}

VALID_SEVERITIES = {"low", "medium", "high", "critical"}


@dataclass
class LossLesson:
    """Structured record of lessons learned from a losing trade."""

    market_id: str
    trade_id: str
    findings: list[dict[str, str]]
    synthesized_lesson: str
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


def _parse_agent_response(text: str, agent_name: str) -> dict[str, str]:
    """Safely parse a JSON response from an agent, returning a fallback on failure."""
    # Strip markdown fences if present
    cleaned = text.strip()
    if cleaned.startswith("```"):
        first_newline = cleaned.find("\n")
        last_fence = cleaned.rfind("```")
        if first_newline != -1 and last_fence > first_newline:
            cleaned = cleaned[first_newline + 1 : last_fence].strip()

    try:
        parsed: dict[str, Any] = json.loads(cleaned)
    except (json.JSONDecodeError, TypeError):
        logger.warning("Failed to parse JSON from %s, using raw text as finding.", agent_name)
        return {
            "agent_name": agent_name,
            "finding": text.strip(),
            "recommendation": "Review raw agent output manually.",
            "severity": "medium",
        }

    severity = str(parsed.get("severity", "medium")).lower()
    if severity not in VALID_SEVERITIES:
        severity = "medium"

    return {
        "agent_name": str(parsed.get("agent_name", agent_name)),
        "finding": str(parsed.get("finding", "")),
        "recommendation": str(parsed.get("recommendation", "")),
        "severity": severity,
    }


async def _run_single_agent(
    client: anthropic.AsyncAnthropic,
    agent_name: str,
    prompt_template: str,
    trade_data: dict,
) -> dict[str, str]:
    """Call Claude for a single analysis agent and return its parsed finding."""
    trade_data_str = json.dumps(trade_data, indent=2, default=str)
    prompt = prompt_template.format(trade_data=trade_data_str)

    try:
        response = await client.messages.create(
            model=LLM_MODEL,
            max_tokens=LLM_MAX_TOKENS,
            temperature=LLM_TEMPERATURE,
            messages=[{"role": "user", "content": prompt}],
        )
        raw_text = response.content[0].text
        logger.debug("%s raw response: %s", agent_name, raw_text[:200])
        return _parse_agent_response(raw_text, agent_name)
    except Exception:
        logger.exception("Error running %s", agent_name)
        return {
            "agent_name": agent_name,
            "finding": "Agent failed to execute.",
            "recommendation": "Retry or inspect logs.",
            "severity": "high",
        }


async def _synthesize_findings(
    client: anthropic.AsyncAnthropic,
    trade_data: dict,
    findings: list[dict[str, str]],
) -> str:
    """Ask Claude to synthesize all agent findings into a single actionable lesson."""
    prompt = (
        "You are a senior trading analyst. Five specialist agents have analyzed a losing "
        "trade. Synthesize their findings into a single concise paragraph (2-4 sentences) "
        "that captures the root cause, the most important lesson, and one concrete action "
        "to prevent similar losses.\n\n"
        f"Trade data:\n{json.dumps(trade_data, indent=2, default=str)}\n\n"
        f"Agent findings:\n{json.dumps(findings, indent=2)}\n\n"
        "Respond with ONLY the synthesized lesson paragraph, no JSON."
    )
    try:
        response = await client.messages.create(
            model=LLM_MODEL,
            max_tokens=LLM_MAX_TOKENS,
            temperature=LLM_TEMPERATURE,
            messages=[{"role": "user", "content": prompt}],
        )
        return response.content[0].text.strip()
    except Exception:
        logger.exception("Failed to synthesize findings")
        severity_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
        sorted_findings = sorted(findings, key=lambda f: severity_order.get(f["severity"], 2))
        top = sorted_findings[0]
        return (
            f"Synthesis unavailable. Highest-severity finding from {top['agent_name']}: "
            f"{top['finding']} Recommendation: {top['recommendation']}"
        )


async def run_postmortem(trade_data: dict) -> LossLesson:
    """Run a full post-mortem on a losing trade using 5 parallel Claude agents.

    Args:
        trade_data: Dictionary containing at minimum ``market_id``, ``trade_id``,
            and any relevant trade context (predicted probability, actual outcome,
            bet size, news context, model features, etc.).

    Returns:
        A ``LossLesson`` dataclass with all agent findings and a synthesized lesson.
    """
    market_id = str(trade_data.get("market_id", "unknown"))
    trade_id = str(trade_data.get("trade_id", "unknown"))
    logger.info("Starting post-mortem for trade %s on market %s", trade_id, market_id)

    client = anthropic.AsyncAnthropic(api_key=ANTHROPIC_API_KEY)

    # Launch all 5 agents in parallel
    tasks = [
        _run_single_agent(client, name, prompt, trade_data)
        for name, prompt in AGENT_PROMPTS.items()
    ]
    findings: list[dict[str, str]] = list(await asyncio.gather(*tasks))

    logger.info(
        "All 5 agents completed for trade %s. Severities: %s",
        trade_id,
        [f["severity"] for f in findings],
    )

    # Synthesize the findings into a single lesson
    synthesized_lesson = await _synthesize_findings(client, trade_data, findings)

    lesson = LossLesson(
        market_id=market_id,
        trade_id=trade_id,
        findings=findings,
        synthesized_lesson=synthesized_lesson,
    )

    logger.info("Post-mortem complete for trade %s: %s", trade_id, synthesized_lesson[:120])
    return lesson

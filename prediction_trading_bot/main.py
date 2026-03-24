"""
Prediction Trading Bot — Main Orchestrator

Runs the full 5-stage pipeline:
  1. Research  (parallel scrapers + narrative analysis)
  2. Filter    (scan & rank markets)
  3. Predict   (XGBoost + LLM calibration)
  4. Execute   (Kelly sizing → risk gate → trade)
  5. Learn     (post-mortem on losses, retrain model)

Usage:
    python -m prediction_trading_bot.main [--dry-run] [--once]
"""

import argparse
import asyncio
import logging
import os
import sys
from datetime import datetime

from prediction_trading_bot import config
from prediction_trading_bot.agents.research.x_scraper import scrape_x
from prediction_trading_bot.agents.research.reddit_scraper import scrape_reddit
from prediction_trading_bot.agents.research.rss_scraper import scrape_rss
from prediction_trading_bot.agents.research.narrative_analyzer import analyze_narrative
from prediction_trading_bot.agents.filter.market_scanner import scan_markets
from prediction_trading_bot.agents.predict.xgboost_model import predict
from prediction_trading_bot.agents.predict.llm_calibrator import calibrate
from prediction_trading_bot.agents.execute.kelly_sizer import size_bet
from prediction_trading_bot.agents.execute.risk_agent import approve_trade
from prediction_trading_bot.agents.execute.trade_executor import (
    execute_trade,
    poll_settlement,
)
from prediction_trading_bot.agents.learn.postmortem import run_postmortem
from prediction_trading_bot.agents.learn.memory_store import (
    store_lesson,
    get_relevant_lessons,
)
from prediction_trading_bot.agents.learn.model_updater import retrain_model

logger = logging.getLogger("prediction_trading_bot")


def setup_logging() -> None:
    """Configure structured logging to file and console."""
    os.makedirs(os.path.dirname(config.LOG_FILE), exist_ok=True)
    fmt = logging.Formatter(
        "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    file_handler = logging.FileHandler(config.LOG_FILE)
    file_handler.setFormatter(fmt)

    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(fmt)

    root = logging.getLogger()
    root.setLevel(getattr(logging, config.LOG_LEVEL.upper(), logging.INFO))
    root.addHandler(file_handler)
    root.addHandler(console_handler)


# ── Pipeline stages ─────────────────────────────────────────────────────────


async def stage_research(keywords: list[str], market_title: str, market_price: float) -> dict:
    """Stage 1: Run all scrapers in parallel, then analyze narrative."""
    logger.info("STAGE 1 — RESEARCH: gathering data for '%s'", market_title)

    x_data, reddit_data, rss_data = await asyncio.gather(
        scrape_x(keywords),
        scrape_reddit(keywords),
        scrape_rss(keywords),
    )

    all_data = x_data + reddit_data + rss_data
    logger.info(
        "Research collected %d items (X=%d, Reddit=%d, RSS=%d)",
        len(all_data), len(x_data), len(reddit_data), len(rss_data),
    )

    if not all_data:
        logger.warning("No research data collected — skipping narrative analysis")
        return {
            "research_items": [],
            "narrative": {
                "dominant_narrative": "No data",
                "implied_probability": market_price,
                "narrative_edge": 0.0,
                "reasoning": "Insufficient research data.",
            },
        }

    narrative = await analyze_narrative(all_data, market_title, market_price)
    logger.info(
        "Narrative edge: %.3f | Implied probability: %.3f",
        narrative.get("narrative_edge", 0),
        narrative.get("implied_probability", 0),
    )
    return {"research_items": all_data, "narrative": narrative}


async def stage_filter(excluded_ids: set[str] | None = None):
    """Stage 2: Scan and filter markets."""
    logger.info("STAGE 2 — FILTER: scanning markets")
    markets = await scan_markets(excluded_ids)
    logger.info("Found %d qualifying markets", len(markets))
    return markets


async def stage_predict(market, sentiment_score: float, narrative: dict):
    """Stage 3: XGBoost prediction + LLM calibration."""
    logger.info("STAGE 3 — PREDICT: market %s", market.market_id)

    xgb_result = await predict(
        market,
        sentiment_score=sentiment_score,
        narrative_edge=narrative.get("narrative_edge", 0.0),
    )
    logger.info(
        "XGBoost probability: %.3f [%.3f, %.3f]",
        xgb_result.xgb_probability,
        xgb_result.confidence_interval[0],
        xgb_result.confidence_interval[1],
    )

    calibration = await calibrate(market, xgb_result, narrative)
    logger.info(
        "Calibrated probability: %.3f | Edge: %.3f | Proceed: %s",
        calibration["calibrated_probability"],
        calibration["edge"],
        calibration["proceed"],
    )
    return xgb_result, calibration


async def stage_execute(
    market,
    calibration: dict,
    dry_run: bool = False,
    current_daily_loss: float = 0.0,
    open_positions: int = 0,
) -> dict | None:
    """Stage 4: Size bet → risk check → execute trade."""
    logger.info("STAGE 4 — EXECUTE: market %s", market.market_id)

    bet = await size_bet(
        market_id=market.market_id,
        our_probability=calibration["calibrated_probability"],
        market_price=market.current_yes_price,
    )
    logger.info(
        "Kelly sizing: $%.2f (%.1f%% of bankroll)",
        bet.recommended_size,
        bet.bankroll_at_risk * 100,
    )

    approval = await approve_trade(
        market_id=market.market_id,
        market_title=market.title,
        edge=calibration["edge"],
        bet_size=bet.recommended_size,
        reasoning=calibration.get("reasoning", ""),
        current_daily_loss=current_daily_loss,
        open_positions=open_positions,
        liquidity=market.liquidity,
    )

    if not approval["approved"]:
        logger.warning("Trade REJECTED: %s", approval["reason"])
        return None

    logger.info("Trade APPROVED — executing")
    side = "YES" if calibration["calibrated_probability"] > market.current_yes_price else "NO"
    result = await execute_trade(
        market_id=market.market_id,
        side=side,
        amount=bet.recommended_size,
        dry_run=dry_run,
    )
    logger.info("Trade placed: %s", result)
    return result


async def stage_learn(trade_data: dict) -> None:
    """Stage 5: Post-mortem on losses, store lessons, optionally retrain."""
    logger.info("STAGE 5 — LEARN: analyzing trade %s", trade_data.get("trade_id"))

    lesson = await run_postmortem(trade_data)
    await store_lesson(lesson)
    logger.info("Lesson stored: %s", lesson.synthesized_lesson[:120])

    retrain_result = await retrain_model()
    if retrain_result["degraded"]:
        logger.warning(
            "Model accuracy degraded to %.3f — review recommended",
            retrain_result["accuracy"],
        )
    else:
        logger.info("Model accuracy: %.3f", retrain_result["accuracy"])


# ── Full pipeline ────────────────────────────────────────────────────────────


async def run_pipeline(dry_run: bool = False) -> None:
    """Execute the complete 5-stage pipeline once."""
    run_id = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    logger.info("=" * 60)
    logger.info("Pipeline run %s started (dry_run=%s)", run_id, dry_run)
    logger.info("=" * 60)

    # Stage 2 first — get markets to evaluate
    markets = await stage_filter()
    if not markets:
        logger.info("No qualifying markets found — pipeline complete")
        return

    current_daily_loss = 0.0
    open_positions = 0
    trades_executed = 0

    for market in markets:
        try:
            # Build keywords from market title
            keywords = [
                w for w in market.title.lower().split()
                if len(w) > 3 and w not in {"will", "what", "when", "does", "this", "that", "with", "from", "have", "been"}
            ][:5]

            # Stage 1 — Research
            research = await stage_research(
                keywords=keywords,
                market_title=market.title,
                market_price=market.current_yes_price,
            )
            narrative = research["narrative"]

            # Compute average sentiment from research items
            items = research["research_items"]
            avg_sentiment = (
                sum(i.get("sentiment_score", 0) for i in items) / len(items)
                if items else 0.0
            )

            # Inject past lessons
            lessons = await get_relevant_lessons(
                market_category=market.category or "",
                keywords=keywords,
            )
            if lessons:
                narrative["past_lessons"] = lessons
                logger.info("Injected %d past lessons", len(lessons))

            # Stage 3 — Predict
            xgb_result, calibration = await stage_predict(
                market, avg_sentiment, narrative,
            )

            if not calibration["proceed"]:
                logger.info(
                    "Edge %.3f below threshold — skipping %s",
                    calibration["edge"], market.market_id,
                )
                continue

            # Stage 4 — Execute
            trade_result = await stage_execute(
                market,
                calibration,
                dry_run=dry_run,
                current_daily_loss=current_daily_loss,
                open_positions=open_positions,
            )

            if trade_result:
                trades_executed += 1
                open_positions += 1

                # Start settlement polling in background (non-blocking)
                if not dry_run:
                    asyncio.create_task(
                        poll_settlement(trade_result["trade_id"], market.market_id)
                    )

        except Exception:
            logger.exception("Error processing market %s", market.market_id)
            continue

    logger.info(
        "Pipeline run %s complete — %d trades executed across %d markets",
        run_id, trades_executed, len(markets),
    )


async def run_scheduled(dry_run: bool = False) -> None:
    """Run the pipeline on a recurring schedule."""
    from apscheduler.schedulers.asyncio import AsyncIOScheduler

    scheduler = AsyncIOScheduler()
    scheduler.add_job(
        run_pipeline,
        "interval",
        hours=config.PIPELINE_CRON_HOURS,
        args=[dry_run],
        id="pipeline",
        max_instances=1,
    )
    scheduler.start()
    logger.info(
        "Scheduler started — pipeline runs every %dh", config.PIPELINE_CRON_HOURS
    )

    # Run immediately on startup, then let scheduler handle the rest
    await run_pipeline(dry_run=dry_run)

    # Keep alive
    try:
        while True:
            await asyncio.sleep(3600)
    except (KeyboardInterrupt, SystemExit):
        scheduler.shutdown()
        logger.info("Scheduler shut down")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="AI-powered prediction market trading bot"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Run full pipeline but skip actual trade execution",
    )
    parser.add_argument(
        "--once",
        action="store_true",
        help="Run pipeline once and exit (no scheduling)",
    )
    args = parser.parse_args()

    setup_logging()

    if args.once:
        asyncio.run(run_pipeline(dry_run=args.dry_run))
    else:
        asyncio.run(run_scheduled(dry_run=args.dry_run))


if __name__ == "__main__":
    main()

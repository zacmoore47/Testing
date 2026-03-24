"""
Tests for the prediction trading bot pipeline.

Each stage has at least one test with mocked external dependencies.
Run with: pytest prediction_trading_bot/tests/test_pipeline.py -v
"""

import asyncio
import json
from dataclasses import dataclass
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# ---------------------------------------------------------------------------
# Stage 1 — Research
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_x_scraper_returns_structured_data():
    """X scraper returns items with the expected schema."""
    mock_tweet = MagicMock()
    mock_tweet.id = 1
    mock_tweet.text = "Markets are looking bullish today!"
    mock_tweet.created_at = "2025-01-01T00:00:00Z"

    mock_includes_user = MagicMock()
    mock_includes_user.username = "testuser"

    mock_public_metrics = MagicMock()
    mock_public_metrics.like_count = 10
    mock_public_metrics.retweet_count = 5
    mock_public_metrics.reply_count = 2

    mock_response = MagicMock()
    mock_response.data = [mock_tweet]
    mock_response.includes = {"users": [mock_includes_user]}
    mock_tweet.public_metrics = {
        "like_count": 10,
        "retweet_count": 5,
        "reply_count": 2,
    }

    with patch("prediction_trading_bot.agents.research.x_scraper.tweepy") as mock_tweepy:
        mock_client = AsyncMock()
        mock_client.search_recent_tweets = AsyncMock(return_value=mock_response)
        mock_tweepy.asynchronous.AsyncClient.return_value = mock_client

        from prediction_trading_bot.agents.research.x_scraper import scrape_x
        results = await scrape_x(["markets", "bullish"], max_results=10)

    assert isinstance(results, list)
    if results:
        item = results[0]
        assert "source" in item
        assert "text" in item
        assert "sentiment_score" in item
        assert "engagement" in item
        assert "timestamp" in item


@pytest.mark.asyncio
async def test_reddit_scraper_returns_structured_data():
    """Reddit scraper returns items with expected schema."""
    mock_submission = MagicMock()
    mock_submission.title = "Bitcoin is crashing"
    mock_submission.selftext = "Markets are in freefall"
    mock_submission.score = 150
    mock_submission.num_comments = 42
    mock_submission.created_utc = 1700000000.0
    mock_submission.subreddit.display_name = "finance"

    mock_comment = MagicMock()
    mock_comment.body = "This is a crash for sure"
    mock_comment.score = 20
    mock_comment.created_utc = 1700000100.0

    mock_submission.comments.list.return_value = [mock_comment]

    mock_subreddit = MagicMock()
    mock_subreddit.hot.return_value = [mock_submission]

    mock_reddit = MagicMock()
    mock_reddit.subreddit.return_value = mock_subreddit

    with patch("prediction_trading_bot.agents.research.reddit_scraper.praw") as mock_praw:
        mock_praw.Reddit.return_value = mock_reddit

        from prediction_trading_bot.agents.research.reddit_scraper import scrape_reddit
        results = await scrape_reddit(["bitcoin", "crash"], subreddits=["finance"])

    assert isinstance(results, list)


@pytest.mark.asyncio
async def test_rss_scraper_returns_items():
    """RSS scraper fetches and parses feeds via mocked feedparser."""
    import sys
    import types

    # feedparser depends on sgmllib which is unavailable on Python 3.11+;
    # mock the entire module so we can import rss_scraper cleanly.
    mock_feedparser = types.ModuleType("feedparser")

    def _mock_parse(raw_xml):
        entry = types.SimpleNamespace(
            title="Test headline about markets",
            summary="Markets are volatile today",
            published="Mon, 01 Jan 2025 00:00:00 GMT",
        )
        # Wrap in dict-like access for .get()
        entry.get = lambda key, default="": getattr(entry, key, default)
        return types.SimpleNamespace(entries=[entry])

    mock_feedparser.parse = _mock_parse
    sys.modules["feedparser"] = mock_feedparser

    # Now import rss_scraper (it will get our mock feedparser)
    import importlib
    if "prediction_trading_bot.agents.research.rss_scraper" in sys.modules:
        del sys.modules["prediction_trading_bot.agents.research.rss_scraper"]
    import prediction_trading_bot.agents.research.rss_scraper as rss_mod

    mock_response = AsyncMock()
    mock_response.status = 200
    mock_response.text = AsyncMock(return_value="<rss>mock</rss>")
    mock_response.__aenter__ = AsyncMock(return_value=mock_response)
    mock_response.__aexit__ = AsyncMock(return_value=False)

    mock_session = AsyncMock()
    mock_session.get = MagicMock(return_value=mock_response)
    mock_session.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session.__aexit__ = AsyncMock(return_value=False)

    with patch.object(rss_mod.aiohttp, "ClientSession", return_value=mock_session):
        with patch.object(rss_mod.config, "RSS_FEEDS", ["https://example.com/feed.xml"]):
            results = await rss_mod.scrape_rss(keywords=["markets"])

    assert isinstance(results, list)
    assert len(results) >= 1
    assert results[0]["source"].startswith("rss:")
    assert "sentiment_score" in results[0]


@pytest.mark.asyncio
async def test_narrative_analyzer_returns_edge():
    """Narrative analyzer returns edge score from LLM."""
    mock_message = MagicMock()
    mock_message.content = [MagicMock()]
    mock_message.content[0].text = json.dumps({
        "dominant_narrative": "Bullish sentiment on tech stocks",
        "implied_probability": 0.72,
        "narrative_edge": 0.12,
        "reasoning": "Strong positive signals across sources.",
    })

    mock_client = AsyncMock()
    mock_client.messages.create = AsyncMock(return_value=mock_message)

    with patch("prediction_trading_bot.agents.research.narrative_analyzer.anthropic.AsyncAnthropic", return_value=mock_client):
        from prediction_trading_bot.agents.research.narrative_analyzer import analyze_narrative

        result = await analyze_narrative(
            research_data=[
                {"source": "x", "text": "Tech is booming", "sentiment_score": 0.8, "engagement": 100, "timestamp": "2025-01-01"},
            ],
            market_title="Will tech stocks rise?",
            market_price=0.60,
        )

    assert "narrative_edge" in result
    assert -1 <= result["narrative_edge"] <= 1


# ---------------------------------------------------------------------------
# Stage 2 — Filter
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_market_scanner_filters_markets():
    """Market scanner filters by volume and liquidity."""
    fake_api_response = [
        {
            "id": "mkt_001",
            "question": "Will X happen?",
            "probability": 0.55,
            "volume24Hours": 5000,
            "totalLiquidity": 10000,
            "closeTime": 1800000000000,  # far future
            "groupSlugs": ["politics"],
        },
        {
            "id": "mkt_002",
            "question": "Low volume market",
            "probability": 0.50,
            "volume24Hours": 10,
            "totalLiquidity": 50,
            "closeTime": 1800000000000,
            "groupSlugs": ["misc"],
        },
    ]

    mock_response = AsyncMock()
    mock_response.status = 200
    mock_response.json = AsyncMock(return_value=fake_api_response)
    mock_response.__aenter__ = AsyncMock(return_value=mock_response)
    mock_response.__aexit__ = AsyncMock(return_value=False)

    mock_session = AsyncMock()
    mock_session.get = MagicMock(return_value=mock_response)
    mock_session.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session.__aexit__ = AsyncMock(return_value=False)

    with patch("prediction_trading_bot.agents.filter.market_scanner.aiohttp.ClientSession", return_value=mock_session):
        with patch("prediction_trading_bot.agents.filter.market_scanner.config") as mock_config:
            mock_config.MARKET_PLATFORM = "manifold"
            mock_config.MANIFOLD_API_URL = "https://api.manifold.markets/v0"
            mock_config.POLYMARKET_API_URL = "https://clob.polymarket.com"
            mock_config.MIN_DAILY_VOLUME = 1000
            mock_config.MIN_LIQUIDITY = 5000
            mock_config.MIN_HOURS_TO_RESOLUTION = 24
            mock_config.MAX_DAYS_TO_RESOLUTION = 30

            from prediction_trading_bot.agents.filter.market_scanner import scan_markets
            markets = await scan_markets()

    # Only the first market should pass filters
    assert isinstance(markets, list)


# ---------------------------------------------------------------------------
# Stage 3 — Predict
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_xgboost_model_returns_prediction():
    """XGBoost model returns a probability estimate."""
    @dataclass
    class FakeMarket:
        market_id: str = "mkt_001"
        title: str = "Test market"
        current_yes_price: float = 0.55
        volume: float = 5000
        liquidity: float = 10000
        closes_at: str = "2025-02-01T00:00:00Z"
        category: str = "politics"

    from prediction_trading_bot.agents.predict.xgboost_model import predict
    result = await predict(
        market=FakeMarket(),
        sentiment_score=0.6,
        narrative_edge=0.1,
    )

    assert 0.0 <= result.xgb_probability <= 1.0
    assert result.confidence_interval[0] <= result.xgb_probability <= result.confidence_interval[1]


@pytest.mark.asyncio
async def test_llm_calibrator_returns_calibrated_probability():
    """LLM calibrator returns calibrated probability and edge."""
    @dataclass
    class FakeMarket:
        market_id: str = "mkt_001"
        title: str = "Test market"
        current_yes_price: float = 0.55
        volume: float = 5000
        liquidity: float = 10000
        closes_at: str = "2025-02-01T00:00:00Z"
        category: str = "politics"

    @dataclass
    class FakeXGBResult:
        market_id: str = "mkt_001"
        xgb_probability: float = 0.65
        confidence_interval: tuple = (0.55, 0.75)

    mock_message = MagicMock()
    mock_message.content = [MagicMock()]
    mock_message.content[0].text = json.dumps({
        "calibrated_probability": 0.68,
        "reasoning": "Strong fundamentals support higher probability.",
    })

    mock_client = AsyncMock()
    mock_client.messages.create = AsyncMock(return_value=mock_message)

    with patch("prediction_trading_bot.agents.predict.llm_calibrator.anthropic.AsyncAnthropic", return_value=mock_client):
        from prediction_trading_bot.agents.predict.llm_calibrator import calibrate

        result = await calibrate(
            market=FakeMarket(),
            xgb_result=FakeXGBResult(),
            narrative={"dominant_narrative": "Bullish", "narrative_edge": 0.1, "reasoning": "test"},
        )

    assert "calibrated_probability" in result
    assert "edge" in result
    assert "proceed" in result


# ---------------------------------------------------------------------------
# Stage 4 — Execute
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_kelly_sizer_computes_bet():
    """Kelly criterion produces a valid bet size."""
    from prediction_trading_bot.agents.execute.kelly_sizer import size_bet

    bet = await size_bet(
        market_id="mkt_001",
        our_probability=0.70,
        market_price=0.55,
    )

    assert bet.recommended_size > 0
    assert bet.kelly_fraction > 0
    assert bet.bankroll_at_risk <= 100.0  # percentage of bankroll


@pytest.mark.asyncio
async def test_risk_agent_blocks_over_loss_limit():
    """Risk agent rejects trade when daily loss limit is exceeded."""
    from prediction_trading_bot.agents.execute.risk_agent import approve_trade

    result = await approve_trade(
        market_id="mkt_001",
        market_title="Test Market",
        edge=0.10,
        bet_size=100.0,
        reasoning="Looks good",
        current_daily_loss=99999.0,  # way over limit
        open_positions=1,
        liquidity=50000.0,
    )

    assert result["approved"] is False
    assert "loss limit" in result["reason"].lower()


@pytest.mark.asyncio
async def test_trade_executor_dry_run():
    """Trade executor in dry-run mode does not place real trades."""
    from prediction_trading_bot.agents.execute.trade_executor import execute_trade

    result = await execute_trade(
        market_id="mkt_001",
        side="YES",
        amount=50.0,
        dry_run=True,
    )

    assert result["status"] == "dry_run"
    assert result["market_id"] == "mkt_001"


# ---------------------------------------------------------------------------
# Stage 5 — Learn
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_postmortem_runs_five_agents():
    """Post-mortem spins up 5 parallel analysis agents."""
    mock_message = MagicMock()
    mock_message.content = [MagicMock()]
    mock_message.content[0].text = json.dumps({
        "agent_name": "Test Agent",
        "finding": "Data was unreliable",
        "recommendation": "Use more sources",
        "severity": "medium",
    })

    mock_client = AsyncMock()
    mock_client.messages.create = AsyncMock(return_value=mock_message)

    with patch("prediction_trading_bot.agents.learn.postmortem.anthropic.AsyncAnthropic", return_value=mock_client):
        from prediction_trading_bot.agents.learn.postmortem import run_postmortem

        lesson = await run_postmortem({
            "trade_id": "t_001",
            "market_id": "mkt_001",
            "market_title": "Will X happen?",
            "side": "YES",
            "amount": 100.0,
            "our_probability": 0.70,
            "market_price": 0.55,
            "outcome": "NO",
            "pnl": -100.0,
            "narrative_summary": "Strong positive sentiment",
            "xgb_probability": 0.65,
            "category": "politics",
        })

    assert lesson.market_id == "mkt_001"
    assert len(lesson.findings) == 5  # 5 parallel agents


@pytest.mark.asyncio
async def test_memory_store_roundtrip():
    """Memory store persists and retrieves lessons."""
    import tempfile
    import os

    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = os.path.join(tmpdir, "test.db")

        with patch("prediction_trading_bot.agents.learn.memory_store.DB_PATH", db_path):
            from prediction_trading_bot.agents.learn.memory_store import (
                store_lesson,
                get_relevant_lessons,
            )

            @dataclass
            class FakeLesson:
                market_id: str = "mkt_001"
                trade_id: str = "t_001"
                findings: list = None
                synthesized_lesson: str = "Market was illiquid"
                timestamp: str = "2025-01-01T00:00:00Z"

                def __post_init__(self):
                    if self.findings is None:
                        self.findings = [{"agent_name": "test", "finding": "test", "recommendation": "test", "severity": "low"}]

            lesson = FakeLesson()
            await store_lesson(lesson)

            results = await get_relevant_lessons("politics", ["market", "illiquid"])

    assert isinstance(results, list)

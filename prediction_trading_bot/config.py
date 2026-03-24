"""Configuration module — loads all settings from environment variables."""

import os
from dotenv import load_dotenv

load_dotenv()


# --- API Keys ---
ANTHROPIC_API_KEY: str = os.getenv("ANTHROPIC_API_KEY", "")
TWITTER_BEARER_TOKEN: str = os.getenv("TWITTER_BEARER_TOKEN", "")
REDDIT_CLIENT_ID: str = os.getenv("REDDIT_CLIENT_ID", "")
REDDIT_CLIENT_SECRET: str = os.getenv("REDDIT_CLIENT_SECRET", "")
REDDIT_USER_AGENT: str = os.getenv("REDDIT_USER_AGENT", "prediction_bot/1.0")
POLYMARKET_API_URL: str = os.getenv(
    "POLYMARKET_API_URL", "https://clob.polymarket.com"
)
MANIFOLD_API_URL: str = os.getenv(
    "MANIFOLD_API_URL", "https://api.manifold.markets/v0"
)
POLYMARKET_PRIVATE_KEY: str = os.getenv("POLYMARKET_PRIVATE_KEY", "")

# --- LLM Settings ---
LLM_MODEL: str = "claude-sonnet-4-20250514"
LLM_MAX_TOKENS: int = 4096
LLM_TEMPERATURE: float = 0.2

# --- Market Filter Thresholds ---
MIN_DAILY_VOLUME: float = float(os.getenv("MIN_DAILY_VOLUME", "1000"))
MIN_LIQUIDITY: float = float(os.getenv("MIN_LIQUIDITY", "5000"))
MIN_HOURS_TO_RESOLUTION: int = int(os.getenv("MIN_HOURS_TO_RESOLUTION", "24"))
MAX_DAYS_TO_RESOLUTION: int = int(os.getenv("MAX_DAYS_TO_RESOLUTION", "30"))

# --- Prediction Thresholds ---
EDGE_THRESHOLD: float = float(os.getenv("EDGE_THRESHOLD", "0.05"))
CONFIDENCE_THRESHOLD: float = float(os.getenv("CONFIDENCE_THRESHOLD", "0.6"))

# --- Execution Settings ---
KELLY_FRACTION: float = float(os.getenv("KELLY_FRACTION", "0.25"))
MAX_BET_FRACTION: float = float(os.getenv("MAX_BET_FRACTION", "0.05"))
BANKROLL: float = float(os.getenv("BANKROLL", "10000.0"))
MAX_OPEN_POSITIONS: int = int(os.getenv("MAX_OPEN_POSITIONS", "10"))
DAILY_LOSS_LIMIT: float = float(os.getenv("DAILY_LOSS_LIMIT", "500.0"))
SETTLEMENT_POLL_MINUTES: int = int(os.getenv("SETTLEMENT_POLL_MINUTES", "15"))

# --- Market Platform ---
MARKET_PLATFORM: str = os.getenv("MARKET_PLATFORM", "manifold")  # "polymarket" or "manifold"

# --- RSS Feeds ---
RSS_FEEDS: list[str] = [
    "https://feeds.reuters.com/reuters/topNews",
    "https://feeds.reuters.com/reuters/worldNews",
    "https://feeds.bbci.co.uk/news/rss.xml",
    "https://feeds.bbci.co.uk/news/world/rss.xml",
    "https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml",
    "https://feeds.washingtonpost.com/rss/politics",
    "https://www.aljazeera.com/xml/rss/all.xml",
    "https://feeds.npr.org/1001/rss.xml",
    "https://www.theguardian.com/world/rss",
    "https://feeds.arstechnica.com/arstechnica/index",
    "https://rss.cnn.com/rss/edition.rss",
    "https://feeds.skynews.com/feeds/rss/world.xml",
    "https://www.espn.com/espn/rss/news",
    "https://www.coindesk.com/arc/outboundfeeds/rss/",
    "https://finance.yahoo.com/news/rssindex",
]

# --- Reddit Subreddits ---
SUBREDDITS: list[str] = [
    "politics", "worldnews", "sports", "finance",
    "cryptocurrency", "technology", "science", "economics",
]

# --- Scheduling ---
PIPELINE_CRON_HOURS: int = int(os.getenv("PIPELINE_CRON_HOURS", "4"))

# --- Database ---
DB_PATH: str = os.getenv("DB_PATH", "data/market_history.db")

# --- Logging ---
LOG_FILE: str = "logs/bot.log"
LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")

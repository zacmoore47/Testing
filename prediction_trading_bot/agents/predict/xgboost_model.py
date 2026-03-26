"""XGBoost probability model for prediction-market opportunities."""

from __future__ import annotations

import asyncio
import hashlib
import logging
import os
import pickle
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from sklearn.model_selection import train_test_split
from xgboost import XGBClassifier

from prediction_trading_bot import config

logger = logging.getLogger(__name__)

# Path to the persisted model relative to project root.
_MODEL_DIR = Path(__file__).resolve().parents[3] / "models"
_MODEL_PATH = _MODEL_DIR / "xgboost_trained.pkl"

# Canonical feature order used during training and inference.
FEATURE_NAMES: list[str] = [
    "sentiment_score",
    "narrative_edge",
    "volume_zscore",
    "liquidity_ratio",
    "days_to_resolution",
    "category_encoding",
    "historical_base_rate",
]


@dataclass(frozen=True, slots=True)
class PredictionResult:
    market_id: str
    xgb_probability: float
    confidence_interval: tuple[float, float]


# ---------------------------------------------------------------------------
# Model management
# ---------------------------------------------------------------------------

def _category_hash(category: str) -> float:
    """Deterministic float encoding for a category string (0-1)."""
    digest = hashlib.md5(category.encode(), usedforsecurity=False).hexdigest()
    return int(digest[:8], 16) / 0xFFFFFFFF


def _build_baseline_model() -> XGBClassifier:
    """Train a simple baseline XGBClassifier on synthetic data and persist it."""
    rng = np.random.default_rng(42)
    n_samples = 2000

    X = rng.random((n_samples, len(FEATURE_NAMES)))
    # Synthetic label: probability is driven mainly by sentiment + base rate
    logit = (
        1.5 * X[:, 0]        # sentiment_score
        + 1.0 * X[:, 1]      # narrative_edge
        + 0.3 * X[:, 2]      # volume_zscore
        + 0.2 * X[:, 3]      # liquidity_ratio
        - 0.5 * X[:, 4]      # days_to_resolution
        + 0.1 * X[:, 5]      # category_encoding
        + 1.2 * X[:, 6]      # historical_base_rate
        - 2.0
    )
    prob = 1 / (1 + np.exp(-logit))
    y = rng.binomial(1, prob)

    X_train, X_val, y_train, y_val = train_test_split(
        X, y, test_size=0.2, random_state=42,
    )

    model = XGBClassifier(
        n_estimators=100,
        max_depth=4,
        learning_rate=0.1,
        use_label_encoder=False,
        eval_metric="logloss",
        random_state=42,
    )
    model.fit(
        X_train, y_train,
        eval_set=[(X_val, y_val)],
        verbose=False,
    )

    _MODEL_DIR.mkdir(parents=True, exist_ok=True)
    with open(_MODEL_PATH, "wb") as fh:
        pickle.dump(model, fh)

    logger.info("Baseline XGBoost model trained and saved to %s", _MODEL_PATH)
    return model


def _load_model() -> XGBClassifier:
    """Load the persisted model or create a baseline if none exists."""
    if _MODEL_PATH.exists():
        with open(_MODEL_PATH, "rb") as fh:
            model = pickle.load(fh)  # noqa: S301
        logger.info("Loaded XGBoost model from %s", _MODEL_PATH)
        return model
    logger.warning("No pre-trained model found — building baseline")
    return _build_baseline_model()


# Module-level lazy singleton
_model: XGBClassifier | None = None


def _get_model() -> XGBClassifier:
    global _model
    if _model is None:
        _model = _load_model()
    return _model


# ---------------------------------------------------------------------------
# Feature engineering helpers
# ---------------------------------------------------------------------------

def _hours_until(iso_timestamp: str) -> float:
    try:
        target = datetime.fromisoformat(iso_timestamp.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return 24.0 * 15  # fallback: 15 days
    delta = target - datetime.now(timezone.utc)
    return max(delta.total_seconds() / 3600, 0)


def _build_feature_vector(
    market: object,
    sentiment_score: float,
    narrative_edge: float,
) -> np.ndarray:
    """Build a 1-D feature vector matching ``FEATURE_NAMES``."""
    volume = getattr(market, "volume", 0.0)
    liquidity = getattr(market, "liquidity", 1.0)
    closes_at = getattr(market, "closes_at", "")
    category = getattr(market, "category", "uncategorized")

    days_to_resolution = _hours_until(closes_at) / 24.0
    # z-score placeholder: normalise volume assuming mean 5000, std 3000
    volume_zscore = (volume - 5000) / 3000
    liquidity_ratio = liquidity / max(volume, 1.0)
    category_encoding = _category_hash(category)
    # Base-rate heuristic: use current market price
    historical_base_rate = getattr(market, "current_yes_price", 0.5)

    return np.array(
        [
            sentiment_score,
            narrative_edge,
            volume_zscore,
            liquidity_ratio,
            days_to_resolution,
            category_encoding,
            historical_base_rate,
        ],
        dtype=np.float32,
    ).reshape(1, -1)


# ---------------------------------------------------------------------------
# Sync prediction (will be wrapped in asyncio.to_thread)
# ---------------------------------------------------------------------------

def _predict_sync(
    market: object,
    sentiment_score: float,
    narrative_edge: float,
) -> PredictionResult:
    model = _get_model()
    features = _build_feature_vector(market, sentiment_score, narrative_edge)

    proba = model.predict_proba(features)[0, 1]  # P(YES)

    # Simple confidence interval via logistic approximation
    raw_logit = np.log(max(proba, 1e-8) / max(1 - proba, 1e-8))
    stderr = 0.15  # conservative estimate
    lo = float(1 / (1 + np.exp(-(raw_logit - 1.96 * stderr))))
    hi = float(1 / (1 + np.exp(-(raw_logit + 1.96 * stderr))))

    market_id = getattr(market, "market_id", "unknown")
    return PredictionResult(
        market_id=market_id,
        xgb_probability=round(float(proba), 4),
        confidence_interval=(round(lo, 4), round(hi, 4)),
    )


# ---------------------------------------------------------------------------
# Public async API
# ---------------------------------------------------------------------------

async def predict(
    market: object,
    sentiment_score: float,
    narrative_edge: float,
) -> PredictionResult:
    """Return an XGBoost-based probability estimate for *market*.

    Heavy lifting runs in a thread so the event-loop stays responsive.
    """
    result = await asyncio.to_thread(
        _predict_sync, market, sentiment_score, narrative_edge,
    )
    logger.info(
        "XGBoost prediction for %s: %.4f  CI=(%.4f, %.4f)",
        result.market_id,
        result.xgb_probability,
        *result.confidence_interval,
    )
    return result

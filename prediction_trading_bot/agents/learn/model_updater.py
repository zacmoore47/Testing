"""Periodic XGBoost model retraining on updated trade history."""

import logging
import os
import pickle
from pathlib import Path

import aiosqlite
import numpy as np
import xgboost as xgb
from sklearn.metrics import accuracy_score
from sklearn.model_selection import train_test_split

from prediction_trading_bot.config import DB_PATH

logger = logging.getLogger(__name__)

MODEL_DIR = Path("models")
MODEL_PATH = MODEL_DIR / "xgboost_trained.pkl"
ACCURACY_THRESHOLD = 0.55

# Feature columns expected in the trade_history table
FEATURE_COLUMNS = [
    "market_price",
    "volume_24h",
    "liquidity",
    "hours_to_resolution",
    "sentiment_score",
    "news_count",
    "social_volume",
    "price_momentum",
    "volatility",
    "edge_estimate",
]

LABEL_COLUMN = "outcome"

FETCH_HISTORY_SQL = """
SELECT {features}, {label}
FROM trade_history
WHERE {label} IS NOT NULL
"""


async def _load_training_data(
    db_path: str,
) -> tuple[np.ndarray, np.ndarray, list[str]]:
    """Load feature matrix and labels from the trade history database.

    Returns:
        A tuple of (X, y, available_features) where X is the feature matrix,
        y is the label vector, and available_features lists the column names
        actually present in the table.
    """
    async with aiosqlite.connect(db_path) as db:
        # Discover which feature columns actually exist in the table
        cursor = await db.execute("PRAGMA table_info(trade_history)")
        columns_info = await cursor.fetchall()
        existing_columns = {row[1] for row in columns_info}

        available_features = [c for c in FEATURE_COLUMNS if c in existing_columns]
        if not available_features:
            raise ValueError(
                "No recognized feature columns found in trade_history table. "
                f"Expected some of: {FEATURE_COLUMNS}"
            )

        if LABEL_COLUMN not in existing_columns:
            raise ValueError(
                f"Label column '{LABEL_COLUMN}' not found in trade_history table."
            )

        features_str = ", ".join(available_features)
        sql = FETCH_HISTORY_SQL.format(features=features_str, label=LABEL_COLUMN)

        cursor = await db.execute(sql)
        rows = await cursor.fetchall()

    if len(rows) < 20:
        raise ValueError(
            f"Insufficient training data: only {len(rows)} rows available (need at least 20)."
        )

    data = np.array(rows, dtype=np.float64)
    X = data[:, :-1]
    y = data[:, -1]

    # Binarize labels if they aren't already 0/1
    unique_labels = np.unique(y[~np.isnan(y)])
    if not set(unique_labels).issubset({0.0, 1.0}):
        median_val = np.nanmedian(y)
        y = (y >= median_val).astype(np.float64)

    # Replace NaN with column medians
    for col_idx in range(X.shape[1]):
        col = X[:, col_idx]
        nan_mask = np.isnan(col)
        if nan_mask.any():
            median_val = np.nanmedian(col)
            col[nan_mask] = median_val if not np.isnan(median_val) else 0.0

    logger.info(
        "Loaded %d rows with %d features from trade_history",
        X.shape[0],
        X.shape[1],
    )
    return X, y, available_features


def _load_old_model() -> xgb.XGBClassifier | None:
    """Load the previously saved XGBoost model, if it exists."""
    if not MODEL_PATH.exists():
        logger.info("No existing model found at %s", MODEL_PATH)
        return None
    try:
        with open(MODEL_PATH, "rb") as f:
            model = pickle.load(f)
        logger.info("Loaded existing model from %s", MODEL_PATH)
        return model
    except Exception:
        logger.exception("Failed to load existing model from %s", MODEL_PATH)
        return None


def _log_feature_importance_drift(
    old_model: xgb.XGBClassifier | None,
    new_model: xgb.XGBClassifier,
    feature_names: list[str],
) -> dict[str, dict[str, float]]:
    """Compare old and new feature importances, logging significant drift.

    Returns:
        A dict mapping feature names to {"old": ..., "new": ..., "drift": ...}.
    """
    new_importances = new_model.feature_importances_
    drift_report: dict[str, dict[str, float]] = {}

    if old_model is not None:
        try:
            old_importances = old_model.feature_importances_
        except Exception:
            logger.warning("Could not extract feature importances from old model.")
            old_importances = None
    else:
        old_importances = None

    for i, name in enumerate(feature_names):
        new_imp = float(new_importances[i]) if i < len(new_importances) else 0.0
        old_imp = 0.0
        if old_importances is not None and i < len(old_importances):
            old_imp = float(old_importances[i])

        drift = abs(new_imp - old_imp)
        drift_report[name] = {"old": old_imp, "new": new_imp, "drift": drift}

        if drift > 0.05:
            logger.warning(
                "Feature importance drift for '%s': %.4f -> %.4f (drift=%.4f)",
                name,
                old_imp,
                new_imp,
                drift,
            )

    logger.info("Feature importances: %s", {k: round(v["new"], 4) for k, v in drift_report.items()})
    return drift_report


async def retrain_model() -> dict:
    """Retrain the XGBoost model on the latest trade history data.

    Loads data from SQLite, trains a new XGBClassifier, compares feature
    importance with the previous model, saves the new model to disk, and
    flags degradation if accuracy drops below the threshold.

    Returns:
        A dict with keys:
          - ``accuracy`` (float): Test-set accuracy of the new model.
          - ``feature_importance`` (dict): Mapping of feature name to importance.
          - ``degraded`` (bool): True if accuracy is below the threshold.
    """
    logger.info("Starting model retraining...")

    X, y, feature_names = await _load_training_data(DB_PATH)

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y,
    )

    old_model = _load_old_model()

    new_model = xgb.XGBClassifier(
        n_estimators=200,
        max_depth=6,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        min_child_weight=3,
        eval_metric="logloss",
        use_label_encoder=False,
        random_state=42,
    )

    new_model.fit(
        X_train,
        y_train,
        eval_set=[(X_test, y_test)],
        verbose=False,
    )

    y_pred = new_model.predict(X_test)
    accuracy = float(accuracy_score(y_test, y_pred))
    degraded = accuracy < ACCURACY_THRESHOLD

    logger.info("New model accuracy: %.4f (threshold: %.4f)", accuracy, ACCURACY_THRESHOLD)
    if degraded:
        logger.warning(
            "MODEL DEGRADATION DETECTED: accuracy %.4f is below threshold %.4f",
            accuracy,
            ACCURACY_THRESHOLD,
        )

    drift_report = _log_feature_importance_drift(old_model, new_model, feature_names)

    # Save the new model
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    with open(MODEL_PATH, "wb") as f:
        pickle.dump(new_model, f)
    logger.info("New model saved to %s", MODEL_PATH)

    feature_importance = {name: round(float(new_model.feature_importances_[i]), 4)
                          for i, name in enumerate(feature_names)}

    return {
        "accuracy": round(accuracy, 4),
        "feature_importance": feature_importance,
        "degraded": degraded,
    }

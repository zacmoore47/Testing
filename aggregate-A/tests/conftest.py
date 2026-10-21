"""Shared synthetic fixtures. These exist ONLY for tests and never reach outputs/."""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from aggregate_a.config import load_config


@pytest.fixture
def rng() -> np.random.Generator:
    return np.random.default_rng(12345)


def synthetic_ohlc(n: int, rng: np.random.Generator, start: str = "1995-01-02") -> pd.DataFrame:
    """GARCH-ish synthetic index path with internally consistent OHLC bars."""
    idx = pd.bdate_range(start, periods=n)
    s2, r = 1e-4, np.empty(n)
    for t in range(n):
        e = rng.standard_t(6) / np.sqrt(1.5)
        r[t] = np.sqrt(s2) * e
        s2 = 2e-6 + (0.05 + 0.1 * (r[t] < 0)) * r[t] ** 2 + 0.88 * s2
    close = 1000 * np.exp(np.cumsum(r))
    open_ = np.r_[1000, close[:-1]] * np.exp(rng.normal(0, 0.001, n))
    hi = np.maximum(open_, close) * np.exp(np.abs(rng.normal(0, 0.004, n)))
    lo = np.minimum(open_, close) * np.exp(-np.abs(rng.normal(0, 0.004, n)))
    return pd.DataFrame({"open": open_, "high": hi, "low": lo, "close": close}, index=idx)


@pytest.fixture
def ohlc(rng: np.random.Generator) -> pd.DataFrame:
    return synthetic_ohlc(1600, rng)


@pytest.fixture
def cfg(tmp_path):
    c = load_config()
    raw = {**c.raw}
    raw["paths"] = {"raw_cache": str(tmp_path / "raw"), "outputs": str(tmp_path / "out")}
    raw["vol"] = {**raw["vol"], "min_train_days": 500, "refit_every_days": 250}
    raw["estimators"] = {**raw["estimators"], "moments_window_days": 400,
                         "credit_min_history_days": 100}
    return type(c)(raw=raw, root=c.root)

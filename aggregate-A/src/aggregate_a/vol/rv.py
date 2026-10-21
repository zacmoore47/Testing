"""Daily realized-variance proxies from daily OHLC (no free intraday data exists for ^GSPC).

Garman & Klass (1980), "On the Estimation of Security Price Volatilities from Historical Data",
Journal of Business 53(1): the practical estimator
    σ²_GK = 0.5·[ln(H/L)]² − (2·ln2 − 1)·[ln(C/O)]²
measures open-to-close variance only, so `gk_overnight` adds the squared overnight log return
ln(O_t / C_{t−1}) to capture the close-to-open gap. Caveat: for older ^GSPC history Yahoo's "open"
often equals the prior close, which zeroes the overnight term — the result then understates
close-to-close variance on those days.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

GK_COEF = 2.0 * np.log(2.0) - 1.0


def garman_klass(ohlc: pd.DataFrame) -> pd.Series:
    hl = np.log(ohlc["high"] / ohlc["low"])
    co = np.log(ohlc["close"] / ohlc["open"])
    return (0.5 * hl**2 - GK_COEF * co**2).clip(lower=0.0)


def overnight_sq(ohlc: pd.DataFrame) -> pd.Series:
    return np.log(ohlc["open"] / ohlc["close"].shift(1)) ** 2


def close_to_close_sq(ohlc: pd.DataFrame) -> pd.Series:
    return np.log(ohlc["close"]).diff() ** 2


def daily_variance(ohlc: pd.DataFrame, measure: str = "gk_overnight") -> pd.Series:
    """Daily (not annualized) variance proxy."""
    if measure == "close_to_close":
        rv = close_to_close_sq(ohlc)
    elif measure == "gk":
        rv = garman_klass(ohlc)
    elif measure == "gk_overnight":
        rv = garman_klass(ohlc) + overnight_sq(ohlc)
    else:
        raise ValueError(f"unknown rv measure {measure}")
    # Days with degenerate bars (H == L, common in early index data) fall back to close-to-close.
    bad = (ohlc["high"] <= ohlc["low"]) | rv.isna()
    rv = rv.where(~bad, close_to_close_sq(ohlc))
    return rv.rename("rv_daily")

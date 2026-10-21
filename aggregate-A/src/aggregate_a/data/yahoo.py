"""S&P 500 daily OHLC via yfinance.

yfinance (https://github.com/ranaroussi/yfinance) is an *unofficial* client for Yahoo Finance's
public endpoints; Yahoo's terms restrict it to personal use. It is used here only because the user
specified it and no official free source offers ^GSPC OHLC back to 1990 (FRED's SP500 series covers
only the last ~10 years). Known failure mode: breaks when Yahoo changes its endpoints.
"""

from __future__ import annotations

import pandas as pd


def normalize_ohlc(df: pd.DataFrame) -> pd.DataFrame:
    if isinstance(df.columns, pd.MultiIndex):  # yfinance >=0.2.4x returns (field, ticker)
        df = df.droplevel(-1, axis=1) if df.columns.nlevels > 1 else df
    df = df.rename(columns=str.lower)[["open", "high", "low", "close"]].astype(float)
    df.index = pd.to_datetime(df.index).tz_localize(None).normalize()
    df.index.name = "date"
    return df.dropna(subset=["close"])


def fetch_gspc(start: str) -> pd.DataFrame:
    import yfinance as yf

    raw = yf.download("^GSPC", start=start, auto_adjust=False, progress=False, threads=False)
    if raw is None or raw.empty:
        raise ValueError("yfinance returned no data for ^GSPC")
    return normalize_ohlc(raw)

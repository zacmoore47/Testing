"""VIX history from Cboe's public daily-prices CSV (backup for FRED VIXCLS).

URL as linked from Cboe's VIX historical data page
(https://www.cboe.com/tradable_products/vix/vix_historical_data/).
"""

from __future__ import annotations

import io

import pandas as pd

from .http import get

VIX_CSV = "https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX_History.csv"


def parse_vix_csv(text: str) -> pd.DataFrame:
    df = pd.read_csv(io.StringIO(text))
    df.columns = [c.strip().upper() for c in df.columns]
    df["DATE"] = pd.to_datetime(df["DATE"])  # column layout as observed; verified by network test
    out = df.set_index("DATE")[["CLOSE"]].rename(columns={"CLOSE": "VIX"}).astype(float)
    out.index.name = "date"
    return out


def fetch_vix(timeout: float = 30, retries: int = 3) -> pd.DataFrame:
    return parse_vix_csv(get(VIX_CSV, timeout=timeout, retries=retries).text)

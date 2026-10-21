"""FRED (Federal Reserve Bank of St. Louis) series.

Primary: the official FRED API, `fred/series/observations`
(https://fred.stlouisfed.org/docs/api/fred/series_observations.html), which needs a free key.
Fallback: FRED's public CSV download endpoint `fredgraph.csv?id=<SERIES>` (the "Download CSV" link
on each series page). Both are official FRED distribution channels.
"""

from __future__ import annotations

import io

import pandas as pd

from .http import get

API_URL = "https://api.stlouisfed.org/fred/series/observations"
CSV_URL = "https://fred.stlouisfed.org/graph/fredgraph.csv"


def parse_observations_json(payload: dict, series_id: str) -> pd.DataFrame:
    obs = payload.get("observations", [])
    df = pd.DataFrame(obs, columns=["date", "value"])
    # FRED encodes missing values as "." (documented in the API response format).
    df["value"] = pd.to_numeric(df["value"].replace(".", None), errors="coerce")
    df["date"] = pd.to_datetime(df["date"])
    return df.set_index("date")[["value"]].rename(columns={"value": series_id}).dropna()


def parse_fredgraph_csv(text: str, series_id: str) -> pd.DataFrame:
    df = pd.read_csv(io.StringIO(text))
    date_col = df.columns[0]  # "observation_date" (current) or "DATE" (older files)
    df[date_col] = pd.to_datetime(df[date_col])
    df = df.set_index(date_col)
    df.index.name = "date"
    col = series_id if series_id in df.columns else df.columns[-1]
    out = pd.to_numeric(df[col].replace(".", None), errors="coerce").to_frame(series_id)
    return out.dropna()


def fetch_series(series_id: str, start: str, api_key: str | None, timeout: float = 30,
                 retries: int = 3) -> pd.DataFrame:
    if api_key:
        resp = get(API_URL, params={"series_id": series_id, "api_key": api_key,
                                    "file_type": "json", "observation_start": start},
                   timeout=timeout, retries=retries)
        return parse_observations_json(resp.json(), series_id)
    resp = get(CSV_URL, params={"id": series_id, "cosd": start}, timeout=timeout, retries=retries)
    return parse_fredgraph_csv(resp.text, series_id)

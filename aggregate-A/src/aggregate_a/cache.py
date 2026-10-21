"""Parquet cache: every fetched series is stored so an outage degrades to the last good copy."""

from __future__ import annotations

import time
from collections.abc import Callable
from pathlib import Path

import pandas as pd

from .log import HEALTH, SourceStatus, logger


def _status(name: str, df: pd.DataFrame, status: str, detail: str = "") -> SourceStatus:
    idx = df.index if len(df) else None
    return SourceStatus(
        source=name, status=status, rows=len(df),
        first=str(idx.min().date()) if idx is not None else None,
        last=str(idx.max().date()) if idx is not None else None, detail=detail,
    )


def cached_fetch(
    name: str,
    fetch: Callable[[], pd.DataFrame],
    cache_dir: Path,
    max_age_hours: float,
    offline: bool = False,
) -> pd.DataFrame | None:
    """Return a fresh fetch, else the cached copy, else None. Never fabricates data.

    The fetch callable must return a DataFrame indexed by a DatetimeIndex.
    """
    cache_dir.mkdir(parents=True, exist_ok=True)
    path = cache_dir / f"{name}.parquet"
    if path.exists():
        age_h = (time.time() - path.stat().st_mtime) / 3600
        if offline or age_h < max_age_hours:
            df = pd.read_parquet(path)
            HEALTH.record(_status(name, df, "cache", f"age={age_h:.1f}h"))
            return df
    if offline:
        HEALTH.record(SourceStatus(name, "failed", detail="offline and no cache"))
        return None
    try:
        df = fetch()
        if df is None or df.empty:
            raise ValueError("source returned no rows")
        df = df.sort_index()
        df.to_parquet(path)
        HEALTH.record(_status(name, df, "fresh"))
        return df
    except Exception as exc:  # noqa: BLE001 — any fetch failure degrades to cache
        logger.warning("fetch %s failed: %s", name, exc)
        if path.exists():
            df = pd.read_parquet(path)
            HEALTH.record(_status(name, df, "cache", f"fetch failed: {exc!s:.200}"))
            return df
        HEALTH.record(SourceStatus(name, "failed", detail=f"{exc!s:.300}"))
        return None

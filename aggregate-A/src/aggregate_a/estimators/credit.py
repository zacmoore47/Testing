"""Credit-spread cross-checks (not in A units — direction/timing comparison only).

- BAMLH0A0HYM2: ICE BofA US High Yield Index option-adjusted spread (FRED). Since April 2026
  FRED distributes only a rolling ~3-year window of ICE BofA data (reported by third-party mirrors;
  UNVERIFIED against an official FRED notice), so its z-score has a short, recent baseline.
- BAA10Y: Moody's seasoned Baa corporate yield minus 10y Treasury (FRED), daily since 1986.
z-scores use an expanding window so each value only uses history available on that date.
"""

from __future__ import annotations

import pandas as pd

from .vrp import expanding_z


def credit_z(spread: pd.Series, min_history: int) -> pd.Series:
    return expanding_z(spread, min_history)

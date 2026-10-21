"""Plausibility range checks. The [1, 15] band is the project owner's specification, not a
literature result: it brackets values commonly quoted for portfolio-choice risk aversion, while
consumption-based estimates can be far higher (Mehra & Prescott 1985, J. Monetary Economics)."""

from __future__ import annotations

import pandas as pd


def range_summary(est: pd.DataFrame, cols: list[str], lo: float, hi: float) -> pd.DataFrame:
    rows = []
    for c in cols:
        s = est[c].dropna()
        rows.append({
            "estimator": c, "n": len(s),
            "share_below": float((s < lo).mean()) if len(s) else float("nan"),
            "share_above": float((s > hi).mean()) if len(s) else float("nan"),
            "share_nonpositive": float((s <= 0).mean()) if len(s) else float("nan"),
        })
    return pd.DataFrame(rows).set_index("estimator")

"""Flag days where the A-unit estimators disagree.

Two signals (thresholds in config.yaml → disagreement):
1. Direction conflict: over the last `change_window_days`, at least one estimator's log A rose and
   another's fell by more than `min_abs_log_change`.
2. Level dispersion: the cross-sectional std of log A exceeds its own expanding
   `dispersion_quantile` (only history up to that day is used).
Only estimators with A > 0 enter (log undefined otherwise).
"""

from __future__ import annotations

import numpy as np
import pandas as pd


def disagreement_flags(est: pd.DataFrame, cols: list[str], window: int, min_move: float,
                       q: float, min_history: int = 252) -> pd.DataFrame:
    la = np.log(est[cols].where(est[cols] > 0))
    d = la - la.shift(window)
    up = (d > min_move).sum(axis=1)
    down = (d < -min_move).sum(axis=1)
    disp = la.std(axis=1, ddof=0).where(la.notna().sum(axis=1) >= 2)
    thresh = disp.expanding(min_periods=min_history).quantile(q).shift(1)
    out = pd.DataFrame(index=est.index)
    out["n_up"] = up
    out["n_down"] = down
    out["log_dispersion"] = disp
    out["flag_direction_conflict"] = (up > 0) & (down > 0)
    out["flag_high_dispersion"] = disp > thresh
    out["flag_disagree"] = out["flag_direction_conflict"] | out["flag_high_dispersion"]
    return out

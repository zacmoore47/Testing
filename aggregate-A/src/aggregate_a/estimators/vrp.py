"""Variance-risk-premium estimators.

VRP_t = σ²_Q,t − E_t^P[σ²] (annualized), with σ²_Q = (VIX/100)² and the physical expectation from
the HAR forecast. Bollerslev, Tauchen & Zhou (2009), "Expected Stock Returns and Variance Risk
Premia", Review of Financial Studies 22(11), relate the VRP to time-varying risk aversion
(and volatility-of-volatility). The raw VRP is in variance units, not A units.

Mapping VRP → A (our derivation, documented here so it can be checked):
Assume a representative investor with power utility over market wealth at horizon h, so the
pricing kernel is m ∝ exp(−A·r) with r the h-period log market return. Then the risk-neutral
density is the exponential (Esscher) tilt of the physical density — Esscher (1932),
Skandinavisk Aktuarietidskrift; applied to option pricing by Gerber & Shiu (1994), Transactions
of the Society of Actuaries:
    q(r) ∝ exp(−A·r)·p(r)
and Var_Q(r; A) is a function of A alone given p. We solve Var_Q(r; A) = σ²_Q·h/252 for A.

Physical density p: filtered historical simulation — the last `window` overlapping h-day log
returns, each divided by the ex-ante HAR volatility forecast at its start, re-standardized to unit
variance, then scaled by the current HAR forecast. This keeps the empirical skew/kurtosis shape
while centring the physical variance on the HAR forecast, so A = 0 ⇔ VRP = 0.

Second-order check: expanding the cumulant generating function, Var_Q ≈ κ2 − A·κ3 + (A²/2)·κ4
(κ_n = physical cumulants), so a positive VRP requires negative skew and/or excess kurtosis.
This has the same form as the volatility-spread theory of Bakshi & Madan (2006), "A Theory of
Volatility Spreads", Management Science 52(12) — their exact coefficients are UNVERIFIED here;
we rely on our own derivation, which is tested in tests/test_vrp.py.

Var_Q(A) is hump-shaped (as A → ∞ all weight sits on the worst return and the variance → 0), so we
take the *first* crossing on a grid and refine with Brent's method. No crossing (e.g. VRP ≤ 0, or
VRP larger than the tilted distribution can produce) ⇒ NaN.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from scipy.optimize import brentq


def tilted_variance(r: np.ndarray, a: float) -> float:
    x = -a * r
    w = np.exp(x - np.max(x))
    w /= w.sum()
    mu = float(w @ r)
    return float(w @ (r - mu) ** 2)


def solve_esscher_a(r: np.ndarray, target_var: float, a_max: float = 60.0,
                    grid_step: float = 0.25) -> float:
    """Smallest A ≥ 0 with tilted_variance(r, A) = target_var, else NaN."""
    if not np.isfinite(target_var) or len(r) < 50:
        return np.nan
    f0 = tilted_variance(r, 0.0) - target_var
    if f0 >= 0:  # no premium (or negative): risk-neutral variance not above physical
        return np.nan
    prev_a = 0.0
    for a in np.arange(grid_step, a_max + 1e-9, grid_step):
        f = tilted_variance(r, float(a)) - target_var
        if f >= 0:
            return float(brentq(lambda z: tilted_variance(r, z) - target_var, prev_a, float(a)))
        prev_a = float(a)
    return np.nan


def vrp_esscher(close: pd.Series, var_q_ann: pd.Series, var_p_daily_fcst: pd.Series,
                h: int = 22, window: int = 1260, a_max: float = 60.0, step: int = 1,
                days_per_year: int = 252) -> pd.Series:
    """Daily Esscher-tilt risk-aversion estimate; uses only returns realized by date t."""
    lr = np.log(close)
    idx = close.index
    ret_h = (lr.shift(-h) - lr)  # return over (s, s+h], stamped at its start s
    ex_ante_sd = np.sqrt(var_p_daily_fcst * h)  # HAR forecast made at s for (s, s+h]
    z = (ret_h / ex_ante_sd).to_numpy()
    vq = (var_q_ann * h / days_per_year).reindex(idx).to_numpy()
    vp = (var_p_daily_fcst * h).reindex(idx).to_numpy()
    out = np.full(len(idx), np.nan)
    for t in range(0, len(idx), step):
        end = t - h + 1  # starts s ≤ t − h have returns fully realized by t
        if end < window // 2 or not (np.isfinite(vq[t]) and np.isfinite(vp[t])):
            continue
        zs = z[max(0, end - window):end]
        zs = zs[np.isfinite(zs)]
        if len(zs) < window // 2:
            continue
        zs = (zs - zs.mean()) / zs.std()
        out[t] = solve_esscher_a(zs * np.sqrt(vp[t]), vq[t], a_max=a_max)
    s = pd.Series(out, index=idx, name="vrp_esscher")
    return s.ffill(limit=step - 1) if step > 1 else s


def expanding_z(x: pd.Series, min_periods: int) -> pd.Series:
    """z-score vs the history available at each date (no look-ahead)."""
    m = x.expanding(min_periods=min_periods).mean()
    sd = x.expanding(min_periods=min_periods).std()
    return (x - m) / sd

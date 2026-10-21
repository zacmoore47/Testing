"""GJR-GARCH(1,1) with Student-t errors: forecast of mean daily variance over t+1..t+h.

Model: Glosten, Jagannathan & Runkle (1993), "On the Relation between the Expected Value and the
Volatility of the Nominal Excess Return on Stocks", Journal of Finance 48(5):
    σ²_{t+1} = ω + (α + γ·1[ε_t<0])·ε_t² + β·σ²_t
Parameters are estimated with the `arch` package (Sheppard) on an expanding window and refit every
`refit_every` days. Daily filtering and the multi-step forecast use our own recursion so that each
day's forecast uses only data through that day. For a symmetric error distribution
E[1(ε<0)] = 1/2, so the k-step forecast is σ²_{t+k} = ω + (α + γ/2 + β)·σ²_{t+k−1}.
"""

from __future__ import annotations

import warnings

import numpy as np
import pandas as pd


def gjr_filter(eps: np.ndarray, omega: float, alpha: float, gamma: float, beta: float,
               sigma2_0: float) -> np.ndarray:
    """Return σ²_{t+1|t} for each t (one-step-ahead conditional variance after observing ε_t)."""
    out = np.empty(len(eps))
    s2 = sigma2_0
    for t, e in enumerate(eps):
        s2 = omega + (alpha + gamma * (e < 0)) * e * e + beta * s2
        out[t] = s2
    return out


def mean_variance_path(s2_next: float, omega: float, persistence: float, h: int) -> float:
    """Mean of σ²_{t+1..t+h} given σ²_{t+1}."""
    total, s2 = 0.0, s2_next
    for _ in range(h):
        total += s2
        s2 = omega + persistence * s2
    return total / h


def fit_gjr(returns_pct: np.ndarray) -> dict[str, float]:
    from arch import arch_model

    am = arch_model(returns_pct, mean="Constant", vol="GARCH", p=1, o=1, q=1, dist="t",
                    rescale=False)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        res = am.fit(disp="off", show_warning=False)
    p = res.params
    return {"mu": float(p["mu"]), "omega": float(p["omega"]), "alpha": float(p["alpha[1]"]),
            "gamma": float(p["gamma[1]"]), "beta": float(p["beta[1]"])}


def garch_forecast(close: pd.Series, h: int = 22, min_train: int = 1000,
                   refit_every: int = 21) -> pd.Series:
    """Expanding-window OOS forecast of mean daily variance (decimal², not annualized)."""
    r = (np.log(close).diff() * 100.0).dropna()  # percent returns help the optimizer
    rv = r.to_numpy()
    n = len(rv)
    out = np.full(n, np.nan)
    params: dict[str, float] | None = None
    s2 = float(np.var(rv[:min_train])) if n >= min_train else np.nan
    for t in range(n):
        if t + 1 >= min_train and (params is None or (t + 1 - min_train) % refit_every == 0):
            params = fit_gjr(rv[: t + 1])
            # re-filter the history with the new parameters to get σ²_{t+1|t}
            eps = rv[: t + 1] - params["mu"]
            s2 = float(gjr_filter(eps, params["omega"], params["alpha"], params["gamma"],
                                  params["beta"], float(np.var(eps)))[-1])
        elif params is not None:
            e = rv[t] - params["mu"]
            s2 = params["omega"] + (params["alpha"] + params["gamma"] * (e < 0)) * e * e \
                + params["beta"] * s2
        if params is not None:
            pers = params["alpha"] + params["gamma"] / 2 + params["beta"]
            out[t] = mean_variance_path(s2, params["omega"], pers, h) / 1e4
    return pd.Series(out, index=r.index, name="garch_fcst")

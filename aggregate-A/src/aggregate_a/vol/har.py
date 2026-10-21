"""HAR-RV forecast of average daily variance over the next h trading days.

Corsi (2009), "A Simple Approximate Long-Memory Model of Realized Volatility",
Journal of Financial Econometrics 7(2):
    RV_{t+1:t+h} = b0 + b_d·RV_t + b_w·RV_{t−4:t} + b_m·RV_{t−21:t} + ε
fitted by OLS. Here RV is the daily OHLC proxy from `rv.py` and the target is the mean daily RV
over the next h days (h = 22 matches VIX's 30-calendar-day horizon).

Out-of-sample discipline: the coefficients used for the forecast made at date t are estimated only
on (regressor, target) pairs whose target window ended on or before t. Coefficients are refit every
`refit_every` days; between refits forecasts update daily with the latest regressors.
"""

from __future__ import annotations

import numpy as np
import pandas as pd


def har_regressors(rv: pd.Series) -> pd.DataFrame:
    return pd.DataFrame({
        "d": rv,
        "w": rv.rolling(5).mean(),
        "m": rv.rolling(22).mean(),
    })


def har_target(rv: pd.Series, h: int) -> pd.Series:
    # mean of rv[t+1 .. t+h], aligned at t
    return rv[::-1].rolling(h).mean()[::-1].shift(-1)


def har_forecast(rv: pd.Series, h: int = 22, min_train: int = 1000, refit_every: int = 21,
                 floor_frac: float = 0.05) -> pd.Series:
    """Expanding-window out-of-sample HAR forecast of mean daily variance over t+1..t+h."""
    rv = rv.astype(float)
    X = har_regressors(rv)
    y = har_target(rv, h)
    Xv = np.column_stack([np.ones(len(X)), X.to_numpy()])
    yv = y.to_numpy()
    n = len(rv)
    out = np.full(n, np.nan)
    beta: np.ndarray | None = None
    last_fit = -10**9
    floor = floor_frac * np.nanmedian(rv.to_numpy())
    for t in range(n):
        if t - last_fit >= refit_every:
            # usable training pairs: index s with s + h <= t (target fully observed by t)
            end = t - h + 1
            if end > 0:
                Xs, ys = Xv[:end], yv[:end]
                ok = np.isfinite(Xs).all(axis=1) & np.isfinite(ys)
                if ok.sum() >= min_train:
                    beta, *_ = np.linalg.lstsq(Xs[ok], ys[ok], rcond=None)
                    last_fit = t
        if beta is not None and np.isfinite(Xv[t]).all():
            out[t] = max(float(Xv[t] @ beta), floor)  # OLS can go negative after spikes; floor it
    return pd.Series(out, index=rv.index, name="har_fcst")

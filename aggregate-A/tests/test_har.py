import numpy as np
import pandas as pd

from aggregate_a.vol.har import har_forecast, har_target


def _sim_rv(rng, n=2500):
    rv = np.full(n, 1e-4)
    for t in range(22, n):
        mean = 1e-5 + 0.35 * rv[t - 1] + 0.3 * rv[t - 5:t].mean() + 0.25 * rv[t - 22:t].mean()
        rv[t] = mean * rng.chisquare(4) / 4
    return pd.Series(rv, index=pd.bdate_range("2000-01-03", periods=n))


def test_target_is_forward_mean():
    s = pd.Series(np.arange(10.0))
    assert har_target(s, 3)[0] == (1 + 2 + 3) / 3
    assert np.isnan(har_target(s, 3)[7])


def test_no_lookahead(rng):
    rv = _sim_rv(rng)
    f1 = har_forecast(rv, 22, min_train=500, refit_every=50)
    rv2 = rv.copy()
    rv2.iloc[1800:] *= 10  # perturb the future
    f2 = har_forecast(rv2, 22, min_train=500, refit_every=50)
    pd.testing.assert_series_equal(f1.iloc[:1800], f2.iloc[:1800])


def test_forecast_beats_unconditional_mean(rng):
    rv = _sim_rv(rng)
    f = har_forecast(rv, 22, min_train=500, refit_every=50)
    y = har_target(rv, 22)
    ok = f.notna() & y.notna()
    mse_har = ((f[ok] - y[ok]) ** 2).mean()
    mse_naive = ((rv.expanding().mean().shift(1)[ok] - y[ok]) ** 2).mean()
    assert mse_har < mse_naive
    assert (f.dropna() > 0).all()

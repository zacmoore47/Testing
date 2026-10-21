import numpy as np
import pandas as pd
import pytest
from scipy import stats

from aggregate_a.estimators.vrp import (
    expanding_z,
    solve_esscher_a,
    tilted_variance,
    vrp_esscher,
)


def test_tilt_zero_is_sample_variance(rng):
    r = rng.normal(0, 0.05, 5000)
    assert tilted_variance(r, 0.0) == pytest.approx(r.var())


def test_normal_has_no_premium():
    # Exponential tilting a normal shifts its mean only, so variance is unchanged and no A > 0
    # can create a positive VRP: the solver must return NaN rather than an arbitrary number.
    r = stats.norm.ppf(np.linspace(0.0005, 0.9995, 4001)) * 0.05
    # (grid truncated at ±3.3σ, so equality is approximate)
    assert tilted_variance(r, 5.0) == pytest.approx(r.var(), rel=1e-2)
    assert np.isnan(solve_esscher_a(r, r.var() * 1.2))


def test_recovers_known_a_on_skewed_returns(rng):
    # negatively skewed: minus a gamma variable
    r = -(rng.gamma(2.0, 0.02, 20000) - 0.04)
    for a_true in (1.5, 4.0, 9.0):
        target = tilted_variance(r, a_true)
        assert solve_esscher_a(r, target) == pytest.approx(a_true, rel=1e-6)


def test_matches_cumulant_expansion_for_small_a(rng):
    # Var_Q ≈ k2 − A k3 + A²/2 k4 for small A·σ (derivation in vrp.py docstring)
    r = -(rng.gamma(2.0, 0.01, 200000) - 0.02)
    k2, k3, k4 = (stats.kstat(r, n) for n in (2, 3, 4))
    a = 2.0
    approx = k2 - a * k3 + a * a / 2 * k4
    assert tilted_variance(r, a) == pytest.approx(approx, rel=0.02)


def test_negative_vrp_gives_nan(rng):
    r = -(rng.gamma(2.0, 0.02, 2000) - 0.04)
    assert np.isnan(solve_esscher_a(r, r.var() * 0.9))


def test_vrp_esscher_no_lookahead(ohlc):
    idx = ohlc.index
    close = ohlc["close"]
    var_p = pd.Series(1e-4, index=idx)
    var_q = pd.Series(0.04, index=idx)
    a1 = vrp_esscher(close, var_q, var_p, h=22, window=400)
    c2 = close.copy()
    c2.iloc[1200:] *= 0.6
    a2 = vrp_esscher(c2, var_q, var_p, h=22, window=400)
    np.testing.assert_allclose(a1.iloc[:1200].to_numpy(), a2.iloc[:1200].to_numpy())
    assert a1.notna().sum() > 500


def test_expanding_z_uses_past_only():
    x = pd.Series(np.arange(10.0))
    z = expanding_z(x, 3)
    assert np.isnan(z[1])
    x2 = x.copy()
    x2[8:] = 1000
    pd.testing.assert_series_equal(z[:8], expanding_z(x2, 3)[:8])

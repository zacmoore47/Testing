import numpy as np
import pandas as pd
import pytest

from aggregate_a.vol.rv import GK_COEF, daily_variance, garman_klass


def test_gk_hand_value():
    bar = pd.DataFrame({"open": [100.0], "high": [102.0], "low": [99.0], "close": [101.0]})
    expect = 0.5 * np.log(102 / 99) ** 2 - (2 * np.log(2) - 1) * np.log(101 / 100) ** 2
    assert garman_klass(bar)[0] == pytest.approx(expect)
    assert GK_COEF == pytest.approx(0.386294, abs=1e-6)


def test_gk_unbiased_for_brownian_bars(rng):
    # Simulate intraday Brownian paths; mean GK should match true variance within a few %.
    sigma2, n, steps = 1e-4, 4000, 390
    paths = np.cumsum(rng.normal(0, np.sqrt(sigma2 / steps), (n, steps)), axis=1)
    paths = np.hstack([np.zeros((n, 1)), paths])
    o, c = np.exp(paths[:, 0]), np.exp(paths[:, -1])
    h, lo = np.exp(paths.max(axis=1)), np.exp(paths.min(axis=1))
    df = pd.DataFrame({"open": o, "high": h, "low": lo, "close": c})
    assert garman_klass(df).mean() == pytest.approx(sigma2, rel=0.08)


def test_degenerate_bars_fall_back_to_close_to_close():
    df = pd.DataFrame({"open": [100, 100, 100.0], "high": [100, 101, 100.0],
                       "low": [100, 99, 100.0], "close": [100, 100.5, 102.0]})
    rv = daily_variance(df, "gk")
    assert rv.iloc[2] == pytest.approx(np.log(102 / 100.5) ** 2)

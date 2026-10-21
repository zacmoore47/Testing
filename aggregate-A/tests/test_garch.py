import numpy as np
import pytest
from arch import arch_model

from aggregate_a.vol.garch import garch_forecast, gjr_filter, mean_variance_path


def test_filter_matches_arch(ohlc):
    r = (np.log(ohlc["close"]).diff() * 100).dropna().to_numpy()
    res = arch_model(r, vol="GARCH", p=1, o=1, q=1, dist="t", rescale=False).fit(disp="off")
    p = res.params
    eps = r - p["mu"]
    ours = gjr_filter(eps, p["omega"], p["alpha[1]"], p["gamma[1]"], p["beta[1]"], 1.0)
    # arch's conditional_volatility[t] is sigma_t (variance for day t given t-1);
    # ours[t] is sigma^2_{t+1|t}. Compare after the initialisation washes out.
    theirs = res.conditional_volatility[1:] ** 2
    np.testing.assert_allclose(ours[300:-1], theirs[300:], rtol=1e-6)


def test_multistep_matches_arch(ohlc):
    r = (np.log(ohlc["close"]).diff() * 100).dropna().to_numpy()
    res = arch_model(r, vol="GARCH", p=1, o=1, q=1, dist="t", rescale=False).fit(disp="off")
    p = res.params
    fc = res.forecast(horizon=22, reindex=False).variance.to_numpy()[-1]
    pers = p["alpha[1]"] + p["gamma[1]"] / 2 + p["beta[1]"]
    ours = mean_variance_path(fc[0], p["omega"], pers, 22)
    assert ours == pytest.approx(fc.mean(), rel=1e-6)


def test_no_lookahead(ohlc):
    close = ohlc["close"]
    f1 = garch_forecast(close, 22, min_train=600, refit_every=300)
    c2 = close.copy()
    c2.iloc[1300:] = c2.iloc[1300:] * np.linspace(1, 0.5, len(c2) - 1300)
    f2 = garch_forecast(c2, 22, min_train=600, refit_every=300)
    np.testing.assert_allclose(f1.iloc[:1299].to_numpy(), f2.iloc[:1299].to_numpy())
    assert f1.dropna().gt(0).all()

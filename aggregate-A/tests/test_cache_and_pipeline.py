import numpy as np
import pandas as pd
import pytest

from aggregate_a.cache import cached_fetch
from aggregate_a.estimators.registry import ESTIMATORS
from aggregate_a.pipeline import build_inputs, compute_estimators


def _df():
    return pd.DataFrame({"v": [1.0, 2.0]}, index=pd.DatetimeIndex(["2020-01-01", "2020-01-02"]))


def test_cache_fallback(tmp_path):
    assert cached_fetch("s", _df, tmp_path, max_age_hours=0) is not None

    def boom():
        raise ConnectionError("down")

    got = cached_fetch("s", boom, tmp_path, max_age_hours=0)
    pd.testing.assert_frame_equal(got, _df(), check_freq=False)
    assert cached_fetch("never_cached", boom, tmp_path, max_age_hours=0) is None


def test_missing_prices_is_fatal(cfg):
    with pytest.raises(RuntimeError):
        build_inputs({"gspc": None}, cfg)


def test_missing_sources_degrade_to_nan(cfg, ohlc):
    # Only prices + VIX available: CAPE/Damodaran/credit estimators must be NaN, never filled.
    idx = ohlc.index
    vix = pd.DataFrame({"VIXCLS": 18.0 + np.sin(np.arange(len(idx)) / 50) * 4}, index=idx)
    raw = {"gspc": ohlc, "vix": vix, "rf_3m": pd.DataFrame({"DTB3": 2.0}, index=idx)}
    x = build_inputs(raw, cfg)
    e = compute_estimators(x, cfg)
    assert list(e.columns) == list(ESTIMATORS)
    for col in ["merton_cape_vix", "merton_dam_har", "credit_hy_z", "credit_baa_z"]:
        assert e[col].isna().all(), col
    assert e["vr_martin_har"].notna().sum() > 500
    assert (x["vix_source"].dropna() == "FRED").all()


def test_vix_backup_used_when_fred_missing(cfg, ohlc):
    idx = ohlc.index
    raw = {"gspc": ohlc, "vix_cboe": pd.DataFrame({"VIX": 20.0}, index=idx)}
    x = build_inputs(raw, cfg)
    assert (x["vix_source"] == "CBOE").all()
    assert x["var_q"].iloc[-1] == pytest.approx(0.04)


def test_stale_daily_series_not_bridged(cfg, ohlc):
    idx = ohlc.index
    t10 = pd.DataFrame({"DGS10": 3.0}, index=idx[:100])
    x = build_inputs({"gspc": ohlc, "t10": t10}, cfg)
    assert x["t10"].iloc[99] == 3.0
    assert x["t10"].iloc[110:].isna().all()

import numpy as np
import pandas as pd
import pytest

from aggregate_a.erp.cape import daily_cape, erp_cape
from aggregate_a.erp.damodaran import erp_damodaran_bill, erp_damodaran_daily


def test_cape_respects_publication_lag():
    sh = pd.DataFrame({"P": [100.0, 110.0], "CAPE": [20.0, 22.0]},
                      index=pd.DatetimeIndex(["2020-01-01", "2020-02-01"]))
    days = pd.DatetimeIndex(["2020-02-28", "2020-03-02", "2020-04-01"])
    close = pd.Series([120.0, 100.0, 121.0], index=days)
    out = daily_cape(sh, close, lag_months=1)
    assert np.isnan(out["cape"].iloc[0])  # Jan data not public until Mar 1
    assert out["cape"].iloc[1] == pytest.approx(20.0 * 100 / 100)
    assert out["cape"].iloc[2] == pytest.approx(22.0 * 121 / 110)  # Feb data public Apr 1
    assert out["cape_staleness_days"].iloc[1] == 1


def test_erp_cape_hand_value():
    # CAPE 25 -> 4% real; bill 5% nominal, 2% expected inflation -> real rf 3% -> ERP 1%
    got = erp_cape(pd.Series([25.0]), pd.Series([0.05]), pd.Series([0.02]))[0]
    assert got == pytest.approx(0.01)


def test_damodaran_availability_and_term_spread():
    dam = pd.DataFrame({"erp_t10": [0.05, 0.04]},
                       index=pd.DatetimeIndex(["2019-12-31", "2020-12-31"]))
    idx = pd.DatetimeIndex(["2020-01-02", "2020-06-01", "2021-01-04", "2021-01-06"])
    d = erp_damodaran_daily(dam, idx, lag_days=5)
    assert np.isnan(d["erp_dam_t10"].iloc[0])
    assert d["erp_dam_t10"].iloc[1] == 0.05
    assert d["erp_dam_t10"].iloc[2] == 0.05  # 2020 estimate not yet public
    assert d["erp_dam_t10"].iloc[3] == 0.04
    assert erp_damodaran_bill(pd.Series([0.05]), pd.Series([4.0]), pd.Series([0.02]))[0] == \
        pytest.approx(0.07)

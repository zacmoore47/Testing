import numpy as np
import pandas as pd
import pytest

from aggregate_a.erp.martin import erp_martin
from aggregate_a.erp.rates import tbill_discount_to_bey
from aggregate_a.estimators.merton import merton_a


def test_bey_hand_value():
    # 5% discount, 91 days: 365*0.05 / (360 - 0.05*91) = 18.25 / 355.45
    got = tbill_discount_to_bey(pd.Series([5.0]))[0]
    assert got == pytest.approx(18.25 / 355.45, rel=1e-12)
    assert got > 0.05  # BEY exceeds the discount rate


def test_merton_hand_value():
    # ERP 5%, sigma 20% -> A = 0.05 / 0.04 = 1.25
    assert merton_a(pd.Series([0.05]), pd.Series([0.04]))[0] == pytest.approx(1.25)


def test_merton_nonpositive_variance_is_nan_and_negative_erp_kept():
    a = merton_a(pd.Series([0.05, -0.01, 0.05]), pd.Series([0.0, 0.04, np.nan]))
    assert np.isnan(a[0]) and np.isnan(a[2])
    assert a[1] == pytest.approx(-0.25)  # reported, not censored


def test_martin_bound_scaling():
    # VIX 20 -> var 0.04; rf 4% over 22/252 years -> gross 1.003492...
    got = erp_martin(pd.Series([0.04]), pd.Series([0.04]))[0]
    assert got == pytest.approx(0.04 * (1 + 0.04 * 22 / 252))

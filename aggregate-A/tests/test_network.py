"""Live smoke tests against real sources. Run with: pytest -m network"""

import pytest

from aggregate_a.config import load_config
from aggregate_a.data import cboe, damodaran, fred, shiller, yahoo

pytestmark = pytest.mark.network


def test_fred_dtb3():
    df = fred.fetch_series("DTB3", "2024-01-01", load_config().secret("FRED_API_KEY"))
    assert len(df) > 100 and df["DTB3"].between(0, 20).all()


def test_yahoo_gspc():
    df = yahoo.fetch_gspc("2024-01-01")
    assert len(df) > 100 and (df["high"] >= df["low"]).all()


def test_cboe_vix():
    df = cboe.fetch_vix()
    assert df.index.min().year <= 1990 and df["VIX"].between(5, 100).all()


def test_shiller():
    df = shiller.fetch_ie_data()
    assert df.index.min().year < 1900 and df["CAPE"].between(4, 50).all()


def test_damodaran():
    df = damodaran.fetch_histimpl()
    assert df.index.min().year <= 1961 and df["erp_t10"].between(0, 0.15).all()

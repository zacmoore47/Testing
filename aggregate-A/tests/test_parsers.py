import io

import numpy as np
import pandas as pd
import pytest

from aggregate_a.data import cboe, damodaran, fred, shiller, yahoo


def test_fred_json_missing_dot():
    payload = {"observations": [{"date": "2020-01-02", "value": "1.5"},
                                {"date": "2020-01-03", "value": "."}]}
    df = fred.parse_observations_json(payload, "DTB3")
    assert list(df["DTB3"]) == [1.5]


def test_fredgraph_csv():
    text = "observation_date,DTB3\n2020-01-02,1.52\n2020-01-03,\n2020-01-06,1.50\n"
    df = fred.parse_fredgraph_csv(text, "DTB3")
    assert len(df) == 2 and df.index[0] == pd.Timestamp("2020-01-02")


def test_shiller_date_code_october():
    assert shiller.decode_shiller_date(1871.1) == pd.Timestamp("1871-10-01")
    assert shiller.decode_shiller_date(2024.01) == pd.Timestamp("2024-01-01")
    assert shiller.decode_shiller_date(1999.12) == pd.Timestamp("1999-12-01")


def _xlsx(frames: dict[str, pd.DataFrame]) -> bytes:
    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as w:
        for name, df in frames.items():
            df.to_excel(w, sheet_name=name, header=False, index=False)
    return buf.getvalue()


def test_shiller_parse_layout():
    rows = [["junk"] * 4] * 3 + [["Date", "P", "D", "CAPE"]] + [
        [2020.01, 3200.0, 60.0, 30.5], [2020.02, 3300.0, 60.0, 31.0],
        [2020.03, 2700.0, 60.0, np.nan]]
    out = shiller.parse_ie_data(_xlsx({"Data": pd.DataFrame(rows)}))
    assert list(out["CAPE"]) == [30.5, 31.0]
    assert out.index[1] == pd.Timestamp("2020-02-01")


def test_shiller_link_finder():
    html = '<a href="https://img1.example.com/x/ie_data.xls?ver=1">U.S. Stock Markets</a>'
    assert shiller.find_download_link(html).endswith("ie_data.xls?ver=1")


def test_damodaran_parse_percent_and_decimal():
    rows = [["Historical implied premiums"], [],
            ["Year", "Earnings Yield", "T.Bond Rate", "Implied ERP (FCFE)"]] + [
        [1960 + i, 0.05, 0.04, 0.03 + i * 0.001] for i in range(15)]
    out = damodaran.parse_histimpl(_xlsx({"Sheet1": pd.DataFrame(rows)}))
    assert out["erp_t10"].iloc[0] == pytest.approx(0.03)
    assert out.index[0] == pd.Timestamp("1960-12-31")
    rows_pct = [r if i < 3 else [r[0], 5.0, 4.0, r[3] * 100] for i, r in enumerate(rows)]
    out2 = damodaran.parse_histimpl(_xlsx({"Sheet1": pd.DataFrame(rows_pct)}))
    assert out2["erp_t10"].iloc[0] == pytest.approx(0.03)


def test_cboe_csv():
    df = cboe.parse_vix_csv("DATE,OPEN,HIGH,LOW,CLOSE\n01/02/1990,17.24,17.24,17.24,17.24\n")
    assert df["VIX"].iloc[0] == 17.24 and df.index[0] == pd.Timestamp("1990-01-02")


def test_yahoo_multiindex():
    cols = pd.MultiIndex.from_product([["Open", "High", "Low", "Close", "Volume"], ["^GSPC"]])
    raw = pd.DataFrame([[1, 2, 0.5, 1.5, 10]], columns=cols,
                       index=pd.DatetimeIndex(["2020-01-02"]))
    out = yahoo.normalize_ohlc(raw)
    assert list(out.columns) == ["open", "high", "low", "close"]

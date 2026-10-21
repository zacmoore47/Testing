"""Damodaran implied ERP, re-expressed as an excess over the 3-month T-bill.

Damodaran's implied ERP (histimpl.xls; see data/damodaran.py) is measured over the 10-year T-bond
and published once per year-end (an annual step function here — a known coarseness). To express
it over the bill we add the current term spread:
    ERP_bill,t = ERP_T10,Y + (DGS10_t − BEY(DTB3)_t)
where Y is the latest year-end whose estimate was public on date t. Adding the *daily* term spread
to an annual ERP is our assumption (documented in the README), not Damodaran's method.
"""

from __future__ import annotations

import pandas as pd


def erp_damodaran_daily(dam: pd.DataFrame, index: pd.DatetimeIndex, lag_days: int = 5
                        ) -> pd.DataFrame:
    right = pd.DataFrame({"avail": dam.index + pd.Timedelta(days=lag_days),
                          "erp_t10": dam["erp_t10"].to_numpy()}).sort_values("avail")
    left = pd.DataFrame({"date": index})
    merged = pd.merge_asof(left, right, left_on="date", right_on="avail",
                           direction="backward").set_index("date")
    out = pd.DataFrame(index=index)
    out["erp_dam_t10"] = merged["erp_t10"]
    out["dam_staleness_days"] = (out.index - merged["avail"]).dt.days
    return out


def erp_damodaran_bill(erp_t10: pd.Series, t10_pct: pd.Series, rf_bey: pd.Series) -> pd.Series:
    return (erp_t10 + t10_pct / 100.0 - rf_bey).rename("erp_dam")

"""CAPE-based expected excess return over the 3-month T-bill.

The real expected return on equities is approximated by the cyclically adjusted earnings yield
1/CAPE. Campbell & Shiller (1998, J. Portfolio Management, "Valuation Ratios and the Long-Run
Stock Market Outlook") document that CAPE predicts long-horizon (10y) real returns; treating
1/CAPE as the *level* of expected real return is a common approximation (it holds exactly only if
real earnings growth equals the payout-adjusted retention return — a strong assumption, flagged in
the README). Because 1/CAPE is a *real* yield, the risk-free rate must also be real:
    ERP_bill = 1/CAPE − (BEY(DTB3) − E[π, 1y])
with E[π, 1y] = Cleveland Fed 1-year expected inflation (FRED EXPINF1YR, monthly).

Daily CAPE: Shiller's file is monthly with P = monthly average of daily closes. On day t we take
the latest month m whose data is deemed public (end of month m + `lag_months`) and set
CAPE_t = CAPE_m · close_t / P_m. This ignores CPI changes inside the ≤ (1 + lag) month gap
(a few tenths of a percent in normal times).
"""

from __future__ import annotations

import pandas as pd


def availability_dates(months: pd.DatetimeIndex, lag_months: int) -> pd.DatetimeIndex:
    """Month-start index m → first date the month's observation is treated as known."""
    return months + pd.DateOffset(months=1 + lag_months)


def daily_cape(shiller: pd.DataFrame, close: pd.Series, lag_months: int = 1) -> pd.DataFrame:
    s = shiller.dropna(subset=["CAPE", "P"])
    right = pd.DataFrame({"avail": availability_dates(pd.DatetimeIndex(s.index), lag_months),
                          "month": s.index, "CAPE": s["CAPE"].to_numpy(),
                          "P": s["P"].to_numpy()}).sort_values("avail")
    left = pd.DataFrame({"date": close.index, "close": close.to_numpy()})
    merged = pd.merge_asof(left, right, left_on="date", right_on="avail",
                           direction="backward").set_index("date")
    out = pd.DataFrame(index=close.index)
    out["cape"] = merged["CAPE"] * merged["close"] / merged["P"]
    out["cape_month"] = merged["month"]
    out["cape_staleness_days"] = (out.index - merged["avail"]).dt.days
    return out


def erp_cape(cape: pd.Series, rf_bey: pd.Series, expinf: pd.Series) -> pd.Series:
    """Expected real equity return (1/CAPE) minus the real 3m bill rate. All decimals."""
    return (1.0 / cape - (rf_bey - expinf)).rename("erp_cape")

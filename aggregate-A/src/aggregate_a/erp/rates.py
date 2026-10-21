"""Interest-rate conversions."""

from __future__ import annotations

import pandas as pd


def tbill_discount_to_bey(discount_pct: pd.Series, days_to_maturity: int = 91) -> pd.Series:
    """Convert a T-bill bank-discount rate (%) to a bond-equivalent (investment) yield (decimal).

    For bills maturing in half a year or less: BEY = 365·d / (360 − d·t), with d the discount rate
    (decimal) and t days to maturity. Source: U.S. Treasury / TreasuryDirect description of the
    "investment rate" for bills, and FRED's DTB3 notes, which state DTB3 is on a discount basis.
    A 3-month bill is taken to have t = 91 days.
    """
    d = discount_pct / 100.0
    return 365.0 * d / (360.0 - d * days_to_maturity)

"""Martin (2017) SVIX lower bound on the equity premium.

Martin, I. (2017), "What is the Expected Return on the Market?", Quarterly Journal of Economics
132(1), doi:10.1093/qje/qjw034. The bound states that the expected excess market return is at
least the risk-neutral variance of the market return scaled by the gross risk-free rate; Martin
argues it is approximately tight. Secondary sources describe the scaling as "risk-neutral variance
scaled by the gross risk-free rate"; the exact placement of R_f (multiplying vs dividing) is
UNVERIFIED here. At a 30-day horizon R_f ≈ 1.003, so the choice moves the result by < 0.5%.

Approximation: Martin's SVIX² is not published freely; we use VIX² in its place. VIX² (based on a
log contract) weights the left tail more heavily than SVIX², so VIX² ≥ SVIX² typically and this
overstates the bound — UNVERIFIED magnitude; flagged in the README.
"""

from __future__ import annotations

import pandas as pd


def erp_martin(var_q_ann: pd.Series, rf_bey: pd.Series, h_days: int = 22,
               days_per_year: int = 252) -> pd.Series:
    gross_rf_h = 1.0 + rf_bey * h_days / days_per_year
    return (gross_rf_h * var_q_ann).rename("erp_martin")

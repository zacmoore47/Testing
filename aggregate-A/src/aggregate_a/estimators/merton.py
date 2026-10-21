"""Merton (1969, 1971) myopic portfolio rule, inverted for risk aversion.

For a CRRA investor with constant investment opportunities, the optimal risky share is
w* = (E[R_m] − r_f) / (A·σ²). If the representative investor holds the market (w* = 1),
    A = (E[R_m] − r_f) / σ²
Merton, R. C. (1969), "Lifetime Portfolio Selection under Uncertainty: The Continuous-Time Case",
Review of Economics and Statistics 51(3); Merton (1971), J. Economic Theory 3(4). The same ratio
is the first-order condition of the mean-variance utility U = E[r] − ½·A·σ².

Inputs are annualized decimals. A non-positive ERP gives a non-positive A; we report it rather than
censor it, because it means "this ERP assumption is inconsistent with a risk-averse holder of the
market" — useful diagnostic information.
"""

from __future__ import annotations

import numpy as np
import pandas as pd


def merton_a(erp_ann: pd.Series, var_ann: pd.Series) -> pd.Series:
    var = var_ann.where(var_ann > 0)
    return (erp_ann / var).replace([np.inf, -np.inf], np.nan)

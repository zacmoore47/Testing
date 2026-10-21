"""Catalogue of Layer 1 estimators: id → units, inputs, description. Drives outputs and README."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class EstimatorInfo:
    id: str
    units: str  # "A" (risk-aversion units) | "variance" | "z"
    inputs: tuple[str, ...]
    description: str


ESTIMATORS: dict[str, EstimatorInfo] = {e.id: e for e in [
    EstimatorInfo("merton_cape_vix", "A", ("erp_cape", "var_q"),
                  "Merton A: (1/CAPE − real 3m bill) / (VIX/100)²  [spec 1a]"),
    EstimatorInfo("merton_cape_har", "A", ("erp_cape", "var_p_har"),
                  "Merton A: CAPE ERP / HAR-RV forecast variance  [spec 1b]"),
    EstimatorInfo("merton_cape_garch", "A", ("erp_cape", "var_p_garch"),
                  "Merton A: CAPE ERP / GJR-GARCH forecast variance  [spec 1b alt]"),
    EstimatorInfo("merton_dam_vix", "A", ("erp_dam", "var_q"),
                  "Merton A: Damodaran implied ERP (over bill) / VIX²"),
    EstimatorInfo("merton_dam_har", "A", ("erp_dam", "var_p_har"),
                  "Merton A: Damodaran implied ERP (over bill) / HAR-RV forecast"),
    EstimatorInfo("vr_martin_har", "A", ("erp_martin", "var_p_har"),
                  "Martin (2017) ERP bound (≈ VIX²) / HAR-RV forecast ≈ variance ratio"),
    EstimatorInfo("vr_martin_garch", "A", ("erp_martin", "var_p_garch"),
                  "Martin (2017) ERP bound (≈ VIX²) / GJR-GARCH forecast"),
    EstimatorInfo("vrp_esscher", "A", ("var_q", "var_p_har", "close"),
                  "Power-utility Esscher tilt solving Var_Q(A) = VIX²  [spec 2]"),
    EstimatorInfo("vrp_raw", "variance", ("var_q", "var_p_har"),
                  "Variance risk premium VIX² − HAR forecast (annualized)"),
    EstimatorInfo("vrp_z", "z", ("var_q", "var_p_har"), "Expanding-window z-score of vrp_raw"),
    EstimatorInfo("credit_hy_z", "z", ("hy_oas",),
                  "Expanding z of ICE BofA HY OAS (short FRED history)  [spec 3]"),
    EstimatorInfo("credit_baa_z", "z", ("baa10y",), "Expanding z of Moody's Baa − 10y  [spec 3]"),
]}

A_UNIT = [k for k, v in ESTIMATORS.items() if v.units == "A"]

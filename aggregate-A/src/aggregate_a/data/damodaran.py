"""Aswath Damodaran's historical implied equity risk premium for the S&P 500 (`histimpl.xls`).

Source page: https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/histimpl.html
Download:    https://www.stern.nyu.edu/~adamodar/pc/datasets/histimpl.xls
One row per year-end since 1960. The ERP is measured over the 10-year T-bond rate; we prefer the
"Implied ERP (FCFE)" column and fall back to any column whose header contains "Implied" and "ERP"
or "Premium". Column layout changes between vintages, hence the header search.
"""

from __future__ import annotations

import io

import pandas as pd

from .http import get

URLS = [
    "https://www.stern.nyu.edu/~adamodar/pc/datasets/histimpl.xls",
    "https://pages.stern.nyu.edu/~adamodar/pc/datasets/histimpl.xls",
]


def _as_decimal(s: pd.Series) -> pd.Series:
    s = pd.to_numeric(s, errors="coerce")
    return s / 100.0 if s.dropna().abs().median() > 0.5 else s


def parse_histimpl(content: bytes) -> pd.DataFrame:
    """Return annual DataFrame indexed by year-end date with columns erp_t10, tbond (decimals)."""
    sheets = pd.read_excel(io.BytesIO(content), sheet_name=None, header=None)
    for raw in sheets.values():
        for r in range(min(20, len(raw))):
            cells = [str(c).strip() for c in raw.iloc[r].tolist()]
            if not any(c.lower() == "year" for c in cells):
                continue
            low = [c.lower() for c in cells]
            erp_col = next((i for i, c in enumerate(low) if "implied" in c and "fcfe" in c), None)
            if erp_col is None:
                erp_col = next((i for i, c in enumerate(low)
                                if "implied" in c and ("erp" in c or "premium" in c)), None)
            if erp_col is None:
                continue
            year_col = low.index("year")
            tb_col = next((i for i, c in enumerate(low) if "t.bond" in c or "t-bond" in c
                           or "tbond" in c or "t bond" in c), None)
            body = raw.iloc[r + 1 :]
            years = pd.to_numeric(body.iloc[:, year_col], errors="coerce")
            mask = years.between(1900, 2200)
            out = pd.DataFrame({"erp_t10": _as_decimal(body.loc[mask].iloc[:, erp_col]).to_numpy()},
                               index=pd.DatetimeIndex(
                                   [pd.Timestamp(year=int(y), month=12, day=31)
                                    for y in years[mask]], name="date"))
            if tb_col is not None:
                out["tbond"] = _as_decimal(body.loc[mask].iloc[:, tb_col]).to_numpy()
            out = out.dropna(subset=["erp_t10"])
            if len(out) > 10:
                return out
    raise ValueError("could not locate implied ERP column in Damodaran file")


def fetch_histimpl(timeout: float = 30, retries: int = 3) -> pd.DataFrame:
    last: Exception | None = None
    for url in URLS:
        try:
            return parse_histimpl(get(url, timeout=timeout, retries=retries).content)
        except Exception as exc:  # noqa: BLE001 — try the mirror
            last = exc
    assert last is not None
    raise last

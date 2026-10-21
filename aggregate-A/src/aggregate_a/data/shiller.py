"""Robert Shiller's monthly U.S. stock market data (`ie_data.xls`), source of CAPE.

The file is distributed from https://shillerdata.com (current home) and historically from
http://www.econ.yale.edu/~shiller/data/ie_data.xls. The direct download link on shillerdata.com is
a CDN URL that changes between updates, so we read the landing page and follow the link that
ends in `ie_data.xls`, falling back to the Yale URL.

File layout (sheet "Data"): column 0 is a date coded YYYY.MM where ".1" means October
(e.g. 1871.1 = Oct 1871); a header cell "CAPE" marks the cyclically adjusted P/E column,
P/E10 = real price / 10-year average of real earnings (Campbell & Shiller 1998,
J. Portfolio Management; Shiller, *Irrational Exuberance*).
"""

from __future__ import annotations

import io
import re

import numpy as np
import pandas as pd

from .http import get

LANDING = "https://shillerdata.com/"
YALE_URL = "http://www.econ.yale.edu/~shiller/data/ie_data.xls"


def decode_shiller_date(x: float) -> pd.Timestamp:
    year = int(np.floor(x))
    month = int(round((x - year) * 100))
    if not 1 <= month <= 12:
        raise ValueError(f"bad Shiller date code {x}")
    return pd.Timestamp(year=year, month=month, day=1)


def parse_ie_data(content: bytes) -> pd.DataFrame:
    """Return monthly DataFrame with columns P (nominal price) and CAPE, indexed by month start."""
    raw = pd.read_excel(io.BytesIO(content), sheet_name="Data", header=None)
    header_row = cape_col = p_col = None
    for r in range(min(15, len(raw))):
        cells = [str(c).strip() for c in raw.iloc[r].tolist()]
        if "CAPE" in cells:
            header_row, cape_col = r, cells.index("CAPE")
            p_col = cells.index("P") if "P" in cells else 1
            break
    if header_row is None:
        raise ValueError("could not locate 'CAPE' header in Shiller file")
    body = raw.iloc[header_row + 1 :, [0, p_col, cape_col]]
    body.columns = ["code", "P", "CAPE"]
    body = body[pd.to_numeric(body["code"], errors="coerce").notna()]
    out = pd.DataFrame({
        "P": pd.to_numeric(body["P"], errors="coerce").to_numpy(),
        "CAPE": pd.to_numeric(body["CAPE"], errors="coerce").to_numpy(),
    }, index=pd.DatetimeIndex([decode_shiller_date(float(c)) for c in body["code"]], name="date"))
    return out.dropna(subset=["CAPE"])


def find_download_link(html: str) -> str | None:
    m = re.search(r'href="([^"]*ie_data\.xls[^"]*)"', html)
    return m.group(1) if m else None


def fetch_ie_data(timeout: float = 30, retries: int = 3, url: str | None = None) -> pd.DataFrame:
    if not url:
        try:
            url = find_download_link(get(LANDING, timeout=timeout, retries=retries).text)
        except Exception:  # noqa: BLE001 — landing page unreachable; try Yale mirror
            url = None
    return parse_ie_data(get(url or YALE_URL, timeout=timeout, retries=retries).content)

"""
holdings.py - your real portfolio: load, save and value holdings at current prices.

A holdings file is a CSV in portfolios/my/ with columns:
    ticker         Yahoo Finance symbol (e.g. VTI), or CASH for uninvested cash
    shares         number of shares you own (for CASH: the dollar amount)
    invested_usd   total dollars you paid for this holding (0 if unknown)
    target_weight  the % of the portfolio you are aiming for (rescaled to 100)
"""
from __future__ import annotations

import dataclasses
import logging
from datetime import date, timedelta
from pathlib import Path

import pandas as pd

import panic_detector as pdx

log = logging.getLogger("panic_detector")

COLUMNS = ["ticker", "shares", "invested_usd", "target_weight"]
CASH = "CASH"
DRIFT_BAND = 5.0  # flag holdings more than this many percentage points away from target


def empty_holdings() -> pd.DataFrame:
    return pd.DataFrame({"ticker": pd.Series(dtype=str), "shares": pd.Series(dtype=float),
                         "invested_usd": pd.Series(dtype=float),
                         "target_weight": pd.Series(dtype=float)})


def clean_holdings(df: pd.DataFrame) -> pd.DataFrame:
    """Standardise columns, upper-case tickers, drop blank rows, coerce numbers (blank = 0)."""
    df = df.copy()
    for c in COLUMNS:
        if c not in df.columns:
            df[c] = "" if c == "ticker" else 0.0
    df = df[COLUMNS]
    df["ticker"] = df["ticker"].fillna("").astype(str).str.strip().str.upper()
    df = df[df["ticker"] != ""]
    for c in COLUMNS[1:]:
        df[c] = pd.to_numeric(df[c], errors="coerce").fillna(0.0)
    return df.groupby("ticker", sort=False, as_index=False).sum()


def load_holdings(path: Path) -> pd.DataFrame:
    if not path.exists():
        return empty_holdings()
    return clean_holdings(pd.read_csv(path, comment="#", skipinitialspace=True))


def save_holdings(df: pd.DataFrame, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w") as f:
        f.write("# Holdings saved from Portfolio Lab. CASH row: 'shares' = dollar amount.\n")
        clean_holdings(df).to_csv(f, index=False)


def latest_prices(tickers: list[str], cfg: pdx.Config, synthetic: bool = False) -> pd.DataFrame:
    """Daily closes for roughly the last two weeks (always re-downloaded, never cached stale)."""
    if synthetic:
        syn = pdx.Config(universe={"H": tickers}, start=str(date.today() - timedelta(days=400)),
                         seed=cfg.seed, market_ticker=cfg.market_ticker)
        prices, _ = pdx.generate_synthetic_prices(syn)
        return prices[tickers].iloc[-10:]
    recent = dataclasses.replace(cfg, start=str(date.today() - timedelta(days=20)), refresh=True)
    prices = pdx.download_prices(recent, tickers=tickers, cache_name="prices_cache_holdings.csv")
    return prices[[t for t in tickers if t in prices.columns]].dropna(how="all")


def value_holdings(df: pd.DataFrame, cfg: pdx.Config,
                   synthetic: bool = False) -> tuple[pd.DataFrame, dict]:
    """Value each holding at the latest close and compare with what you paid and your target.

    Returns:
        (one row per holding, totals dict with value, invested, gain, day change, as_of,
         missing tickers and holdings outside the drift band)
    """
    df = clean_holdings(df)
    stocks = df[(df["ticker"] != CASH) & (df["shares"] != 0)]
    tickers = list(stocks["ticker"])
    prices = latest_prices(tickers, cfg, synthetic) if tickers else pd.DataFrame()
    last = prices.ffill().iloc[-1] if not prices.empty else pd.Series(dtype=float)
    prev = prices.ffill().iloc[-2] if len(prices) > 1 else last
    as_of = prices.index[-1].date() if not prices.empty else date.today()

    rows, missing = [], []
    for _, h in df.iterrows():
        t = h["ticker"]
        if t == CASH:
            price, prev_price = 1.0, 1.0
        elif t in last.index and pd.notna(last[t]):
            price, prev_price = float(last[t]), float(prev.get(t, last[t]))
        else:
            if h["shares"] != 0:
                missing.append(t)
            price, prev_price = float("nan"), float("nan")
        value = h["shares"] * price
        rows.append({"ticker": t, "shares": h["shares"], "price": price, "value": value,
                     "invested_usd": h["invested_usd"],
                     "gain_usd": value - h["invested_usd"] if h["invested_usd"] else float("nan"),
                     "gain_%": 100 * (value / h["invested_usd"] - 1) if h["invested_usd"] else float("nan"),
                     "day_change_usd": h["shares"] * (price - prev_price),
                     "target_weight": h["target_weight"]})
    table = pd.DataFrame(rows)
    total = table["value"].sum(skipna=True)
    table["actual_%"] = 100 * table["value"] / total if total else float("nan")
    tsum = table["target_weight"].sum()
    table["target_%"] = 100 * table["target_weight"] / tsum if tsum else float("nan")
    table["drift_pts"] = table["actual_%"] - table["target_%"]
    table["rebalance_flag"] = table["drift_pts"].abs() > DRIFT_BAND
    table = table.drop(columns="target_weight")

    invested = table["invested_usd"].sum()
    day = table["day_change_usd"].sum(skipna=True)
    totals = {
        "as_of": as_of, "value": total, "invested": invested,
        "gain": total - invested if invested else float("nan"),
        "gain_%": 100 * (total / invested - 1) if invested else float("nan"),
        "day_change": day, "day_change_%": 100 * day / (total - day) if total - day else float("nan"),
        "missing": missing,
        "off_target": list(table.loc[table["rebalance_flag"], "ticker"]),
    }
    return table, totals


def weights_from_holdings(table: pd.DataFrame) -> pd.Series:
    """Current-value weights of the invested holdings (cash excluded: it has no price history)."""
    inv = table[(table["ticker"] != CASH) & (table["value"] > 0)]
    return pd.Series(inv["value"].to_numpy(), index=inv["ticker"]) / inv["value"].sum()

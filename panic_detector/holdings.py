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

import numpy as np
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
        df[c] = pd.to_numeric(df[c], errors="coerce").fillna(0.0).astype(float)
    return df.groupby("ticker", sort=False, as_index=False).sum()


def load_holdings(path: Path) -> pd.DataFrame:
    if not path.exists():
        return empty_holdings()
    return clean_holdings(pd.read_csv(path, comment="#", skipinitialspace=True))


def save_holdings(df: pd.DataFrame, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w") as f:
        f.write("# Holdings saved from Portfolio Lab. CASH row: 'shares' = dollar amount.\n")
        out = clean_holdings(df)
        out["invested_usd"] = out["invested_usd"].round(2)
        out["shares"] = out["shares"].round(6)
        out.to_csv(f, index=False)


def latest_prices(tickers: list[str], cfg: pdx.Config, synthetic: bool = False) -> pd.DataFrame:
    """Daily closes for roughly the last two weeks (always re-downloaded, never cached stale)."""
    if synthetic:
        syn = pdx.Config(universe={"H": tickers}, start="2019-01-01",  # same as report history
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
    # Price every holding you own AND every fund you are aiming for (needed to buy into it).
    stocks = df[(df["ticker"] != CASH) & ((df["shares"] != 0) | (df["target_weight"] > 0))]
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
            if h["shares"] != 0 or h["target_weight"] > 0:
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
    # Cash with no target (0%) is treated as a buffer, not as part of the target mix.
    cash_buffer = (table["ticker"] == CASH) & (table["target_weight"] == 0)
    table["rebalance_flag"] = (table["drift_pts"].abs() > DRIFT_BAND) & ~cash_buffer
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
    table.attrs["as_of"] = str(as_of)
    return table, totals


def weights_from_holdings(table: pd.DataFrame) -> pd.Series:
    """Current-value weights of the invested holdings (cash excluded: it has no price history)."""
    inv = table[(table["ticker"] != CASH) & (table["value"] > 0)]
    return pd.Series(inv["value"].to_numpy(), index=inv["ticker"]) / inv["value"].sum()


# ---------------------------------------------------------------------------------------
# Rebalancing
# ---------------------------------------------------------------------------------------


def _water_fill(values: np.ndarray, targets: np.ndarray, money: float,
                total_after: float) -> np.ndarray:
    """Buy-only allocation that minimises the largest shortfall in percentage points.

    ``targets`` are fractions of the whole portfolio after the purchase (``total_after``).
    Finds the shortfall d with sum(max(0, (target_i - d) * total_after - value_i)) == money:
    every fund that gets money ends up exactly d below its target, and no fund is left
    further below target than that. Overweight funds are never bought.
    """
    if money <= 0 or targets.sum() <= 0 or total_after <= 0:
        return np.zeros_like(values)

    def spend(d: float) -> float:
        return float(np.maximum(0.0, (targets - d) * total_after - values).sum())

    lo, hi = -1.0, 1.0  # spend(lo) is large, spend(hi) == 0
    for _ in range(200):
        mid = (lo + hi) / 2
        lo, hi = (mid, hi) if spend(mid) > money else (lo, mid)
    return np.maximum(0.0, (targets - hi) * total_after - values)


def _settle_whole_shares(trade_sh: np.ndarray, prices: np.ndarray, values: np.ndarray,
                         tgt: np.ndarray, money: float, cash_total: float) -> np.ndarray:
    """After rounding to whole shares: never overspend, then spend what is left sensibly.

    1. While the plan spends more than the money plus sale proceeds, remove one share from
       the purchase that ends up most overweight.
    2. While money remains, buy one more share of the fund furthest below target that the
       remaining money can afford.
    """
    trade_sh = trade_sh.copy()

    def left() -> float:
        return money - float((trade_sh * prices).sum())

    def gap() -> np.ndarray:  # target minus weight after trades, in fractions
        after = values + trade_sh * prices
        total = after.sum() + max(left(), 0.0) + (cash_total - money)
        return tgt - after / total if total > 0 else tgt

    for _ in range(10_000):
        if left() >= -1e-9:
            break
        buying = np.where(trade_sh > 0)[0]
        if not len(buying):
            break
        i = buying[np.argmin(gap()[buying])]
        trade_sh[i] -= 1
    for _ in range(10_000):
        g = gap()
        worst_now = float(np.abs(g).max()) if len(g) else 0.0
        bought = False
        for i in np.argsort(-g):  # most underweight first
            if tgt[i] <= 0 or g[i] <= 0 or prices[i] > left() + 1e-9:
                continue
            trade_sh[i] += 1
            g2 = gap()
            # keep the extra share only if it brings this fund closer to target and does
            # not make the worst drift of the portfolio any worse
            if abs(g2[i]) < abs(g[i]) and float(np.abs(g2).max()) <= worst_now + 1e-12:
                bought = True
                break
            trade_sh[i] -= 1
        if not bought:
            break
    return trade_sh


def rebalance_plan(table: pd.DataFrame, new_money: float = 0.0, use_cash: bool = False,
                   mode: str = "buy_only", fractional: bool = False) -> tuple[pd.DataFrame, dict]:
    """Trades that move the portfolio towards its target mix.

    Args:
        table: output of value_holdings (needs ticker, shares, price, value, target_%)
        new_money: dollars you are adding now
        use_cash: also invest the balance of the CASH row
        mode: "buy_only" (never sells; avoids realising gains) or "full" (buys and sells)
        fractional: allow fractional shares; otherwise buys are rounded DOWN to whole shares
            so the plan never spends more than you have

    Returns:
        (one row per fund with current / trade / after columns, summary dict)
    """
    t = table[table["ticker"] != CASH].copy()
    t = t[(t["shares"] != 0) | (t["target_%"].fillna(0) > 0)]
    t = t[t["price"].notna() & (t["price"] > 0)]
    cash_bal = float(table.loc[table["ticker"] == CASH, "value"].sum())
    cash_target = float(table.loc[table["ticker"] == CASH, "target_%"].fillna(0).sum())
    money = float(new_money) + (cash_bal if use_cash else 0.0)
    kept_cash = 0.0 if use_cash else cash_bal

    # Targets for the invested part (a cash target, if any, is held back as cash).
    raw = t["target_%"].fillna(0.0).to_numpy()
    tgt = raw / raw.sum() if raw.sum() > 0 else np.zeros_like(raw)
    invest_share = 1 - cash_target / 100 if use_cash and cash_target > 0 else 1.0
    values = t["value"].fillna(0.0).to_numpy()
    prices = t["price"].to_numpy()
    shares = t["shares"].to_numpy()

    if mode == "full":
        total = values.sum() + money
        trade_usd = tgt * total * invest_share - values
    else:
        trade_usd = _water_fill(values, tgt * invest_share, money * invest_share,
                                values.sum() + kept_cash + money)

    trade_sh = trade_usd / prices
    if not fractional:
        # Whole shares: buys round down (never overspend), sells round down (sell no more
        # than needed); a full exit of a 0%-target holding sells everything.
        trade_sh = np.where(trade_sh > 0, np.floor(trade_sh + 1e-9), np.ceil(trade_sh - 1e-9))
        exit_all = (tgt == 0) & (mode == "full")
        trade_sh = np.where(exit_all, -shares, trade_sh)
    trade_sh = np.maximum(trade_sh, -shares)  # cannot sell more than you own
    if not fractional:
        trade_sh = _settle_whole_shares(trade_sh, prices, values, tgt * invest_share, money,
                                        kept_cash + money)
    trade_sh = trade_sh + 0.0  # turn -0.0 into 0.0
    trade_usd = trade_sh * prices
    buys, sells = trade_usd[trade_usd > 0].sum(), -trade_usd[trade_usd < 0].sum()
    leftover = money + sells - buys
    new_values = values + trade_usd
    end_cash = kept_cash + leftover
    end_total = new_values.sum() + end_cash
    now_total = values.sum() + cash_bal

    plan = pd.DataFrame({
        "ticker": t["ticker"].to_numpy(), "price": prices, "shares_now": shares,
        "value_now": values, "weight_now_%": 100 * values / now_total if now_total else np.nan,
        "target_%": 100 * tgt * invest_share,
        "action": np.where(trade_sh > 1e-9, "BUY", np.where(trade_sh < -1e-9, "SELL", "—")),
        "trade_shares": trade_sh, "trade_usd": trade_usd, "shares_after": shares + trade_sh,
        "value_after": new_values,
        "weight_after_%": 100 * new_values / end_total if end_total else np.nan,
    })
    plan["drift_now_pts"] = plan["weight_now_%"] - plan["target_%"]
    plan["drift_after_pts"] = plan["weight_after_%"] - plan["target_%"]
    summary = {
        "money_available": money, "spent_on_buys": buys, "sell_proceeds": sells,
        "cash_left_over": leftover, "cash_after": end_cash, "n_trades": int((trade_sh != 0).sum()),
        "max_drift_now": float(plan["drift_now_pts"].abs().max()) if len(plan) else 0.0,
        "max_drift_after": float(plan["drift_after_pts"].abs().max()) if len(plan) else 0.0,
        "mode": mode, "use_cash": use_cash, "new_money": float(new_money),
    }
    return plan, summary


def apply_plan(holdings: pd.DataFrame, plan: pd.DataFrame, summary: dict) -> pd.DataFrame:
    """Holdings after the plan's trades were placed: shares, cost basis and CASH updated.

    Buys add their cost to the cost basis; sells reduce it in proportion to the shares sold.
    """
    h = clean_holdings(holdings).set_index("ticker")
    for _, r in plan.iterrows():
        tk, dsh = r["ticker"], float(r["trade_shares"])
        if dsh == 0:
            continue
        if tk not in h.index:
            h.loc[tk] = {"shares": 0.0, "invested_usd": 0.0, "target_weight": 0.0}
        old = float(h.at[tk, "shares"])
        if dsh > 0:
            h.at[tk, "invested_usd"] += float(r["trade_usd"])
        elif old > 0:
            h.at[tk, "invested_usd"] *= max(0.0, 1 + dsh / old)
        h.at[tk, "shares"] = old + dsh
    if summary["cash_after"] > 0.005 or CASH in h.index:
        if CASH not in h.index:
            h.loc[CASH] = {"shares": 0.0, "invested_usd": 0.0, "target_weight": 0.0}
        h.at[CASH, "shares"] = round(summary["cash_after"], 2)
        h.at[CASH, "invested_usd"] = round(summary["cash_after"], 2)
    return clean_holdings(h.reset_index())

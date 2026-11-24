"""
hedges.py - which assets historically offset THIS portfolio's losses?

For each candidate (a list of common hedge ETFs plus any tickers you add), measured on
the period both histories overlap:
    tail return     its average weekly return during the portfolio's worst 5% of weeks
                    (positive = it tended to rise exactly when you were losing most)
    correlation     weekly correlation with the portfolio
    crises up       in the named crises where YOUR portfolio lost money, how often it rose
    big crises up   the same, for crises where your portfolio lost more than 15%
    blend effect    what holding X% of it (the rest pro rata in your portfolio, rebalanced)
                    would have done to the worst drop, volatility and growth per year

Hedges are regime-dependent: long Treasuries protected in 2008 and 2020 but fell with
stocks in 2022. Read the crisis-by-crisis table, not just one number. Past behaviour is
not a guarantee; this is analysis, not a recommendation.
"""
from __future__ import annotations

import logging
import math

import numpy as np
import pandas as pd

import history as hs
import panic_detector as pdx

log = logging.getLogger("panic_detector")

HEDGE_UNIVERSE: dict[str, str] = {
    "TLT": "Long-term US Treasuries",
    "IEF": "7-10 year US Treasuries",
    "SHY": "1-3 year Treasuries (near cash)",
    "TIP": "Inflation-protected Treasuries",
    "GLD": "Gold",
    "SLV": "Silver",
    "DBC": "Broad commodities",
    "UUP": "US dollar index",
    "FXY": "Japanese yen",
    "XLU": "Utilities sector",
    "XLP": "Consumer staples sector",
    "XLV": "Health care sector",
    "BTAL": "Anti-beta (long low-vol, short high-vol stocks)",
    "SH": "Inverse S&P 500 (-1x, resets daily)",
    "DBMF": "Managed futures ETF (2019+)",
    "KMLM": "Managed futures ETF (2020+)",
    "CTA": "Managed futures ETF (2022+)",
    "AQMIX": "AQR Managed Futures fund (2010+)",
    "TREND": "Trend-following model (built here, see note)",
}
MODEL_TICKERS = {"TREND"}  # computed here, not downloaded
TREND_ASSETS = ["SPY", "TLT", "GLD", "DBC"]
TREND_FEE = 0.85  # %/yr, roughly what managed-futures ETFs charge
MIN_DD_GAIN = 1.0  # points of worst-drop improvement needed to count as helping (noise floor)
BIG_CRISIS = -15.0  # a "big crisis" = the portfolio lost more than 15% (start to market trough)
NOTES = {
    "SH": "Inverse funds lose value over time in rising markets and with daily resets; a "
          "short-term tool, not a buy-and-hold hedge.",
    "UUP": "Currency hedge: helps when the dollar rises in a panic; no long-run return.",
    "FXY": "Currency hedge: the yen often rises in panics; no long-run return.",
    "TREND": "Model, not a fund: each month long or short stocks, Treasuries, gold and "
             "commodities by their 12-month trend, risk-balanced, scaled to ~10% volatility, "
             "minus 0.85%/yr. Excludes the cash interest real futures funds earn. A stand-in "
             "for managed futures before the ETFs existed.",
    "AQMIX": "Real mutual fund (minimums and fees apply); used for its longer track record.",
}


def trend_model(prices: pd.DataFrame, vol_target: float = 0.10, lookback: int = 12) -> pd.Series:
    """Simple time-series momentum strategy, as a price index (no look-ahead).

    At each month end, each asset's signal is +1 if it rose over the previous ``lookback``
    months, else -1. The signal applies from the next trading day. Assets are weighted by
    inverse 60-day volatility, the total is scaled to ``vol_target`` using the previous 60
    days' realised volatility (capped at 3x), and TREND_FEE is deducted.
    """
    px = prices[[a for a in TREND_ASSETS if a in prices.columns]].dropna(how="all")
    rets = px.pct_change(fill_method=None)
    month_end = px.resample("ME").last()
    signal = np.sign(month_end.pct_change(lookback, fill_method=None))
    sig = signal.reindex(rets.index, method="ffill").shift(1)  # known only after the close
    vol = rets.rolling(60).std().shift(1)
    inv = (1 / vol).where(sig.notna())
    w = inv.div(inv.sum(axis=1), axis=0)
    raw = (w * sig * rets).sum(axis=1, min_count=1)
    realised = raw.rolling(60).std().shift(1) * math.sqrt(252)
    strat = (raw * (vol_target / realised).clip(upper=3)).dropna()
    strat = strat - TREND_FEE / 100 / 252
    return (1 + strat).cumprod() * 100


def hedge_frontier(pr: pd.Series, cr: pd.Series, max_w: float = 0.5,
                   step: float = 0.01) -> pd.DataFrame:
    """Portfolio measures for every hedge weight from 0 to ``max_w`` (rebalanced daily)."""
    rows = []
    for a in np.arange(0, max_w + 1e-9, step):
        b = (1 - a) * pr + a * cr
        v = (1 + b).cumprod()
        wk = (1 + b).resample("W-FRI").prod() - 1
        cut = wk.quantile(0.05)
        rows.append({"weight_%": 100 * a, "vol_%": 100 * b.std() * math.sqrt(252),
                     "cvar_wk_%": 100 * wk[wk <= cut].mean(), "maxdd_%": 100 * _mdd(v),
                     "cagr_%": 100 * _cagr(v)})
    return pd.DataFrame(rows)


def min_variance_weight(pr: pd.Series, cr: pd.Series, max_w: float = 0.5) -> float:
    """Weight a minimising the variance of (1-a)*portfolio + a*hedge (weekly returns)."""
    wp = (1 + pr).resample("W-FRI").prod() - 1
    wc = (1 + cr).resample("W-FRI").prod() - 1
    vp, vc, cv = wp.var(), wc.var(), wp.cov(wc)
    denom = vp + vc - 2 * cv
    return float(np.clip((vp - cv) / denom, 0, max_w)) if denom > 0 else 0.0


def rolling_min_variance(pr: pd.Series, cr: pd.Series, years: int = 3) -> pd.Series:
    """Minimum-variance hedge weight re-estimated on a rolling window, monthly."""
    wp = (1 + pr).resample("W-FRI").prod() - 1
    wc = (1 + cr).resample("W-FRI").prod() - 1
    n = 52 * years
    vp, vc = wp.rolling(n).var(), wc.rolling(n).var()
    cv = wp.rolling(n).cov(wc)
    a = ((vp - cv) / (vp + vc - 2 * cv)).clip(0, 1)
    return a.dropna().resample("ME").last()


def _cagr(v: pd.Series) -> float:
    years = (v.index[-1] - v.index[0]).days / 365.25
    return float(v.iloc[-1] / v.iloc[0]) ** (1 / years) - 1 if years > 0 else float("nan")


def _mdd(v: pd.Series) -> float:
    return float((v / v.cummax() - 1).min())


def analyse(weights: pd.Series, cfg: pdx.Config, add_pct: float = 10.0,
            extra: list[str] | None = None, synthetic: bool = False,
            min_years: float = 3.0) -> dict:
    """Score every candidate hedge against the portfolio. Returns tables for display."""
    own = list(weights.index)
    extra = [t.strip().upper() for t in (extra or []) if t.strip()]
    candidates = [c for c in list(HEDGE_UNIVERSE) + extra if c not in own]
    candidates = list(dict.fromkeys(candidates))
    downloads = [c for c in candidates if c not in MODEL_TICKERS] + TREND_ASSETS
    prices, notes = hs.long_prices(own + downloads, cfg, "prices_cache_hedges.csv", synthetic)
    if "TREND" in candidates and all(a in prices.columns for a in TREND_ASSETS[:3]):
        prices = prices.assign(TREND=trend_model(prices))
    port, used = hs.portfolio_values(prices, weights, cfg)
    port_r = port.pct_change().dropna()
    a = add_pct / 100

    rows, crisis_rows, skipped, series = [], [], [], {}
    for c in candidates:
        if c not in prices.columns or prices[c].dropna().empty:
            skipped.append(f"{c} (no data)")
            continue
        s = prices[c].dropna()
        start = max(s.index[0], port_r.index[0])
        cr = s.pct_change().reindex(port_r.index).loc[start:]
        pr = port_r.loc[start:]
        ok = cr.notna()
        cr, pr = cr[ok], pr[ok]
        years = (pr.index[-1] - pr.index[0]).days / 365.25 if len(pr) else 0
        if years < min_years:
            skipped.append(f"{c} (only {years:.1f} years of history)")
            continue
        wk_p = (1 + pr).resample("W-FRI").prod() - 1
        wk_c = (1 + cr).resample("W-FRI").prod() - 1
        worst = wk_p <= wk_p.quantile(0.05)
        v_port = (1 + pr).cumprod()
        v_c = (1 + cr).cumprod()
        v_blend = (1 + (1 - a) * pr + a * cr).cumprod()

        crisis_rets = {}  # candidate return in crises where the PORTFOLIO lost money
        big_rets = {}  # ... and in crises where it lost more than 15%
        for name, (cs, ce) in pdx.CRISES.items():
            cs, ce = pd.Timestamp(cs), pd.Timestamp(ce)
            if cs < pr.index[0] or ce > pr.index[-1]:
                continue
            seg_c = (1 + cr.loc[cs:ce]).prod() - 1
            seg_p = (1 + pr.loc[cs:ce]).prod() - 1
            seg_b = (1 + ((1 - a) * pr + a * cr).loc[cs:ce]).prod() - 1
            if seg_p < 0:
                crisis_rets[name] = seg_c
            if 100 * seg_p <= BIG_CRISIS:
                big_rets[name] = seg_c
            crisis_rows.append({"ticker": c, "crisis": name, "ret": 100 * seg_c,
                                "portfolio": 100 * seg_p, "blend": 100 * seg_b})
        series[c] = (pr, cr)
        front = hedge_frontier(pr, cr)
        w_mv = min_variance_weight(pr, cr)
        best = front.loc[front["cvar_wk_%"].idxmax()]  # least bad average worst week
        n_cr = len(crisis_rets)
        up = sum(1 for x in crisis_rets.values() if x > 0)
        dd_gain = 100 * (_mdd(v_blend) - _mdd(v_port))
        tail = 100 * wk_c[worst].mean()
        n_big = len(big_rets)
        big_up = sum(1 for x in big_rets.values() if x > 0)
        # Hedge: cut the worst drop AND either (a) rose in your worst weeks and in most
        # crises where you lost money, or (b) rose in at least 2/3 of your BIG crises
        # (lost > 15%), with at least two of them in its history. (b) recognises hedges
        # like trend-following that lose in short, sharp sell-offs but pay off in the long,
        # deep crises that matter most.
        broad = tail > 0 and (n_cr == 0 or up / n_cr >= 0.6)
        big = n_big >= 2 and big_up / n_big >= 2 / 3
        if dd_gain >= MIN_DD_GAIN and (broad or big):
            verdict = "Hedge"
        elif dd_gain >= MIN_DD_GAIN:
            verdict = "Diversifier"  # softened the worst drop without rising in sell-offs
        else:
            verdict = "No help"
        rows.append({
            "ticker": c, "what": HEDGE_UNIVERSE.get(c, "Your ticker"), "since": pr.index[0].date(),
            "verdict": verdict,
            "tail_ret_%": tail, "port_tail_%": 100 * wk_p[worst].mean(),
            "corr": float(wk_c.corr(wk_p)),
            "crises_up": f"{up}/{n_cr}" if n_cr else "n/a",
            "crises_up_share": up / n_cr if n_cr else np.nan,
            "big_crises_up": f"{big_up}/{n_big}" if n_big else "n/a",
            "cagr_%": 100 * _cagr(v_c),
            "maxdd_change_pts": dd_gain,
            "vol_change_pts": 100 * math.sqrt(252) * (((1 - a) * pr + a * cr).std() - pr.std()),
            "cagr_change_pts": 100 * (_cagr(v_blend) - _cagr(v_port)),
            "minvar_w_%": 100 * w_mv, "mincvar_w_%": float(best["weight_%"]),
            "mincvar_dd_change_pts": float(best["maxdd_%"] - front["maxdd_%"].iloc[0]),
            "mincvar_cagr_change_pts": float(best["cagr_%"] - front["cagr_%"].iloc[0]),
            "note": NOTES.get(c, ""),
        })
    table = pd.DataFrame(rows)
    if not table.empty:
        order = {"Hedge": 0, "Diversifier": 1, "No help": 2}
        table = table.sort_values(["verdict", "maxdd_change_pts"],
                                  key=lambda s: s.map(order) if s.name == "verdict" else -s)
    log.info("Hedge analysis: %d candidates scored, %d skipped (%s)", len(table), len(skipped),
             ", ".join(skipped) or "none")
    return {"table": table.reset_index(drop=True), "crises": pd.DataFrame(crisis_rows),
            "skipped": skipped, "proxy_lines": notes, "weights": used, "add_pct": add_pct,
            "series": series,
            "port_maxdd_%": 100 * _mdd((1 + port_r).cumprod()), "port_start": port_r.index[0],
            "synthetic": synthetic}

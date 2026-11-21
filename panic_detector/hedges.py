"""
hedges.py - which assets historically offset THIS portfolio's losses?

For each candidate (a list of common hedge ETFs plus any tickers you add), measured on
the period both histories overlap:
    tail return     its average weekly return during the portfolio's worst 5% of weeks
                    (positive = it tended to rise exactly when you were losing most)
    correlation     weekly correlation with the portfolio
    crises up       in the named crises where YOUR portfolio lost money, how often it rose
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
}
MIN_DD_GAIN = 1.0  # points of worst-drop improvement needed to count as helping (noise floor)
NOTES = {
    "SH": "Inverse funds lose value over time in rising markets and with daily resets; a "
          "short-term tool, not a buy-and-hold hedge.",
    "UUP": "Currency hedge: helps when the dollar rises in a panic; no long-run return.",
    "FXY": "Currency hedge: the yen often rises in panics; no long-run return.",
}


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
    prices, notes = hs.long_prices(own + candidates, cfg, "prices_cache_hedges.csv", synthetic)
    port, used = hs.portfolio_values(prices, weights, cfg)
    port_r = port.pct_change().dropna()
    a = add_pct / 100

    rows, crisis_rows, skipped = [], [], []
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
        for name, (cs, ce) in pdx.CRISES.items():
            cs, ce = pd.Timestamp(cs), pd.Timestamp(ce)
            if cs < pr.index[0] or ce > pr.index[-1]:
                continue
            seg_c = (1 + cr.loc[cs:ce]).prod() - 1
            seg_p = (1 + pr.loc[cs:ce]).prod() - 1
            seg_b = (1 + ((1 - a) * pr + a * cr).loc[cs:ce]).prod() - 1
            if seg_p < 0:
                crisis_rets[name] = seg_c
            crisis_rows.append({"ticker": c, "crisis": name, "ret": 100 * seg_c,
                                "portfolio": 100 * seg_p, "blend": 100 * seg_b})
        n_cr = len(crisis_rets)
        up = sum(1 for x in crisis_rets.values() if x > 0)
        dd_gain = 100 * (_mdd(v_blend) - _mdd(v_port))
        tail = 100 * wk_c[worst].mean()
        # Hedge: rose in your worst weeks, cut the worst drop, and (where history has
        # crises in which you lost money) rose in most of them.
        if tail > 0 and dd_gain >= MIN_DD_GAIN and (n_cr == 0 or up / n_cr >= 0.6):
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
            "cagr_%": 100 * _cagr(v_c),
            "maxdd_change_pts": dd_gain,
            "vol_change_pts": 100 * math.sqrt(252) * (((1 - a) * pr + a * cr).std() - pr.std()),
            "cagr_change_pts": 100 * (_cagr(v_blend) - _cagr(v_port)),
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
            "port_maxdd_%": 100 * _mdd((1 + port_r).cumprod()), "port_start": port_r.index[0],
            "synthetic": synthetic}

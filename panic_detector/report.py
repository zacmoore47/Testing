"""
report.py - the daily report for a portfolio you actually hold (portfolio app track, S3).

One self-contained HTML page per day, saved to outputs/reports/:
    Your money      value, change today, gain vs invested, value over the past year
    Your mix        actual vs target %, rebalance flags
    Market regime   calm / elevated / stressed from the panic detector (correlation) and
                    market volatility, with the Phase 1 caveat: it measures risk, not returns
    Diversification independent bets today and with COVID-crash correlations
    What changed    alerts only when something happened since the last report
Personal history and state are kept next to the holdings file in portfolios/my/ (git-ignored).

Usage (from the panic_detector folder):
    python panic_detector.py --report portfolios/my/my_portfolio.csv
    python panic_detector.py --report portfolios/my/my_portfolio.csv --open
"""
from __future__ import annotations

import base64
import dataclasses
import html
import io
import json
import logging
import math
from datetime import date, timedelta
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

import holdings as hd
import panic_detector as pdx

log = logging.getLogger("panic_detector")

BIG_DAY_MOVE = 2.0          # alert when the portfolio moves more than this % in a day
DRAWDOWN_LEVELS = (10, 20, 30)  # alert when the drop from the 1-year high crosses these %
COVID_TROUGH = "2020-03-23"
REGIME_TEXT = {
    "calm": "Calm: stocks are moving fairly independently and volatility is normal.",
    "elevated": "Elevated: correlation or volatility is above its usual range. Worth "
                "watching, not a reason to act on its own.",
    "stressed": "Stressed: stocks are moving together and/or volatility is unusually high, "
                "as in past sell-offs. Expect bigger daily swings than usual.",
}
CAVEAT = ("The regime describes current risk. In 27 years of testing it did not predict "
          "returns: stressed periods were often followed by rebounds, so it is not a signal "
          "to buy or sell.")


# ---------------------------------------------------------------------------------------
# Pieces of the report
# ---------------------------------------------------------------------------------------


def market_regime(cfg: pdx.Config, synthetic: bool = False) -> dict:
    """Current regime from the 41-stock correlation detector plus market volatility."""
    start = str(date.today() - timedelta(days=5 * 365))
    rcfg = dataclasses.replace(pdx.Config(), start=start, cache_dir=cfg.cache_dir,
                               outdir=cfg.outdir, refresh=not synthetic, make_gif=False)
    if synthetic:
        prices, _ = pdx.generate_synthetic_prices(rcfg)
    else:
        prices = pdx.download_prices(rcfg, cache_name="prices_cache_regime.csv")
    returns, market = pdx.clean_prices(prices, rcfg)
    metrics, _ = pdx.compute_metrics(returns, market, rcfg)
    last = metrics.iloc[-1]
    if bool(last["panic"]) or bool(last["vol_panic"]):
        level = "stressed"
    elif last["avg_corr_z"] > 0.5 or last["vol_z"] > 0.5:
        level = "elevated"
    else:
        level = "calm"
    hist = metrics["avg_corr"]
    metrics = metrics.assign(baseline=pdx.zscore_baseline(hist, rcfg)[0])
    return {"level": level, "date": metrics.index[-1].date(),
            "avg_corr": float(last["avg_corr"]), "avg_corr_z": float(last["avg_corr_z"]),
            "vol": float(last["trailing_vol"]), "vol_z": float(last["vol_z"]),
            "corr_percentile": float(100 * (hist <= last["avg_corr"]).mean()),
            "metrics": metrics.iloc[-104:]}  # about 2 years of weekly windows for the chart


def holdings_history(table: pd.DataFrame, cfg: pdx.Config,
                     synthetic: bool = False) -> tuple[pd.DataFrame, pd.Series]:
    """Daily prices of the holdings since 2019, and the past-year value of TODAY's shares."""
    inv = table[(table["ticker"] != hd.CASH) & (table["shares"] != 0)]
    tickers = list(inv["ticker"])
    cash = float(table.loc[table["ticker"] == hd.CASH, "value"].sum())
    hcfg = dataclasses.replace(cfg, start="2019-01-01", refresh=not synthetic)
    if not tickers:
        return pd.DataFrame(), pd.Series(dtype=float)
    if synthetic:
        syn = pdx.Config(universe={"H": tickers}, start="2019-01-01", seed=cfg.seed)
        prices, _ = pdx.generate_synthetic_prices(syn)
    else:
        prices = pdx.download_prices(hcfg, tickers=tickers, cache_name="prices_cache_report.csv")
    px = prices[[t for t in tickers if t in prices.columns]].ffill()
    shares = inv.set_index("ticker")["shares"].reindex(px.columns)
    value = (px * shares).sum(axis=1, min_count=1).dropna() + cash
    return prices, value.iloc[-252:]


def diversification(prices: pd.DataFrame, table: pd.DataFrame, cfg: pdx.Config) -> dict | None:
    """Independent bets and volatility today vs with COVID-crash correlations."""
    weights = hd.weights_from_holdings(table)
    if len(weights) < 2 or prices.empty:
        return None
    px, w = pdx.prepare_portfolio_prices(prices, weights, cfg)
    if px.index[0] > pd.Timestamp(COVID_TROUGH):
        return None
    scen, hold, _ = pdx.portfolio_stress(px, w, cfg, crisis_date=COVID_TROUGH)
    return {"bets_today": float(scen["independent_bets"].iloc[0]),
            "bets_crisis": float(scen["independent_bets"].iloc[1]),
            "vol_today": float(scen["portfolio_vol_%"].iloc[0]),
            "vol_crisis": float(scen["portfolio_vol_%"].iloc[1]),
            "top": hold.index[0], "top_money": float(hold["weight_%"].iloc[0]),
            "top_risk": float(hold["risk_share_today_%"].iloc[0])}


def update_history(path: Path, totals: dict) -> pd.DataFrame:
    """Add/replace today's row in the personal value log next to the holdings file."""
    hist_path = path.with_name(path.stem + "_history.csv")
    row = pd.DataFrame([{"date": str(totals["as_of"]), "value": round(totals["value"], 2),
                         "invested": round(totals["invested"], 2),
                         "day_change": round(totals["day_change"], 2)}])
    if hist_path.exists():
        old = pd.read_csv(hist_path, dtype={"date": str})
        row = pd.concat([old[old["date"] != row["date"].iloc[0]], row])
    row = row.sort_values("date")
    row.to_csv(hist_path, index=False)
    return row


def find_alerts(totals: dict, regime: dict | None, value_1y: pd.Series,
                state_path: Path) -> tuple[list[str], dict]:
    """Things worth your attention since the last report. Saves the new state."""
    prev = json.loads(state_path.read_text()) if state_path.exists() else {}
    alerts: list[str] = []
    if totals["missing"]:
        alerts.append("No price found for " + ", ".join(totals["missing"]) +
                      ": check the ticker symbols.")
    if pd.notna(totals["day_change_%"]) and abs(totals["day_change_%"]) >= BIG_DAY_MOVE:
        alerts.append(f"Big day: your portfolio moved {totals['day_change_%']:+.1f}% "
                      f"({_money(totals['day_change'], True)}).")
    if regime and prev.get("regime") and prev["regime"] != regime["level"]:
        alerts.append(f"Market regime changed from {prev['regime']} to {regime['level']}.")
    new_off = sorted(set(totals["off_target"]) - set(prev.get("off_target", [])))
    if new_off:
        alerts.append(f"Now more than {hd.DRIFT_BAND:.0f} points from target: "
                      + ", ".join(new_off) + ". Consider rebalancing.")
    back_on = sorted(set(prev.get("off_target", [])) - set(totals["off_target"]))
    if back_on:
        alerts.append("Back within target range: " + ", ".join(back_on) + ".")
    dd = 0.0
    if not value_1y.empty:
        dd = 100 * (value_1y.iloc[-1] / value_1y.max() - 1)
        level = max([lv for lv in DRAWDOWN_LEVELS if -dd >= lv], default=0)
        if level > prev.get("drawdown_level", 0):
            alerts.append(f"Your current holdings are {abs(dd):.0f}% below their 1-year high.")
    else:
        level = 0
    state = {"date": str(totals["as_of"]), "regime": regime["level"] if regime else None,
             "off_target": totals["off_target"], "drawdown_level": level,
             "value": totals["value"]}
    state_path.write_text(json.dumps(state, indent=1))
    return alerts, {"drawdown_%": dd, "first_report": not prev}


# ---------------------------------------------------------------------------------------
# HTML rendering
# ---------------------------------------------------------------------------------------


def _png(fig: plt.Figure) -> str:
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=120, bbox_inches="tight")
    plt.close(fig)
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


def chart_value(value_1y: pd.Series, logged: pd.DataFrame) -> str | None:
    if value_1y.empty:
        return None
    fig, ax = plt.subplots(figsize=(8, 3))
    pdx._style_axis(ax)
    ax.plot(value_1y.index, value_1y, color="#2a78d6", linewidth=1.8,
            label="Today's holdings over the past year")
    if len(logged) > 0:
        d = pd.to_datetime(logged["date"])
        ax.plot(d, logged["value"], "o", color="#eb6834", markersize=5,
                label="Your logged daily values")
    from matplotlib.ticker import FuncFormatter
    ax.yaxis.set_major_formatter(FuncFormatter(lambda v, _: f"${v:,.0f}"))
    ax.tick_params(labelsize=8)
    ax.legend(frameon=False, fontsize=8, loc="best")
    return _png(fig)


def chart_mix(table: pd.DataFrame) -> str | None:
    t = table[table["value"].fillna(0) > 0].sort_values("actual_%")
    if t.empty:
        return None
    fig, ax = plt.subplots(figsize=(8, 0.42 * len(t) + 1))
    pdx._style_axis(ax)
    y = np.arange(len(t))
    ax.barh(y + 0.2, t["actual_%"], height=0.38, color="#2a78d6", label="Actual")
    ax.barh(y - 0.2, t["target_%"].fillna(0), height=0.38, color="#9ec5f4", label="Target")
    ax.set_yticks(y)
    ax.set_yticklabels(t["ticker"])
    ax.grid(axis="y", visible=False)
    ax.set_xlabel("% of portfolio", color=pdx.INK, fontsize=8)
    ax.tick_params(labelsize=8)
    ax.legend(frameon=False, fontsize=8, loc="lower right")
    return _png(fig)


def chart_regime(regime: dict) -> str:
    m = regime["metrics"]
    base_mean = m["baseline"]
    fig, ax = plt.subplots(figsize=(8, 2.6))
    pdx._style_axis(ax)
    ax.plot(m.index, m["avg_corr"], color="#2a78d6", linewidth=1.8, label="Average correlation")
    ax.plot(m.index, base_mean, color=pdx.INK_MUTED, linestyle="--", linewidth=1,
            label="Normal level (past 2 years)")
    for s, e in pdx._runs(m["panic"] | m["vol_panic"]):
        ax.axvspan(s, e, color=pdx.PANIC_SHADE, alpha=0.12, linewidth=0)
    ax.set_ylabel("Avg ρ", color=pdx.INK, fontsize=8)
    ax.tick_params(labelsize=8)
    ax.legend(frameon=False, fontsize=8, loc="best")
    return _png(fig)


CSS = """
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&display=swap');
:root { --ink:#1a1a1a; --muted:#6b6b6b; --bg:#fbfbfa; --card:#ffffff; --line:#e3e3df;
        --pos:#0f7b3f; --neg:#c62f2e; --warn:#a86b00; --accent:#2a78d6; }
body { font-family: 'IBM Plex Mono', SFMono-Regular, Menlo, monospace; color: var(--ink); font-size: 14px;
       background: var(--bg); max-width: 920px; margin: 0 auto; padding: 28px 16px 48px;
       line-height: 1.45; }
.eyebrow, .k, th, .note, .sub, h2 { font-family: 'IBM Plex Mono', monospace; }
.eyebrow { text-transform: uppercase; letter-spacing: .14em; font-size: 11px; color: var(--accent); }
h1 { font-size: 22px; font-weight: 500; margin: 4px 0 2px; letter-spacing: -0.01em; }
.sub { color: var(--muted); font-size: 12px; margin: 0 0 18px; letter-spacing: .03em; }
h2 { font-size: 11px; font-weight: 500; text-transform: uppercase; letter-spacing: .12em;
     color: var(--muted); border-bottom: 1px solid var(--line); padding-bottom: 6px; margin: 30px 0 12px; }
.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 10px; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 3px; padding: 10px 14px; }
.card .k { color: var(--muted); font-size: 10.5px; text-transform: uppercase; letter-spacing: .08em; }
.card .v { font-family: 'IBM Plex Mono', monospace; font-size: 21px; font-weight: 500; margin-top: 2px; }
.card .d { font-family: 'IBM Plex Mono', monospace; font-size: 12px; color: var(--muted); }
.pos { color: var(--pos) !important; } .neg { color: var(--neg) !important; }
.alerts { border-left: 2px solid var(--warn); background: #fff8ec; padding: 10px 14px; font-size: 14px; }
.ok { border-left-color: var(--pos); background: #f0f7f2; }
.alerts ul { margin: 4px 0; padding-left: 18px; }
.badge { display: inline-block; padding: 1px 8px; border-radius: 2px; font-family: 'IBM Plex Mono', monospace;
         font-size: 12px; font-weight: 500; letter-spacing: .08em; color: #fff; margin-right: 6px; }
.calm { background: var(--pos); } .elevated { background: var(--warn); } .stressed { background: var(--neg); }
table { border-collapse: collapse; width: 100%; font-size: 13px; background: var(--card);
        border: 1px solid var(--line); }
th, td { text-align: right; padding: 6px 10px; border-bottom: 1px solid var(--line); }
td { font-family: 'IBM Plex Mono', monospace; }
th:first-child, td:first-child { text-align: left; }
th { color: var(--muted); font-weight: 500; font-size: 10.5px; text-transform: uppercase; letter-spacing: .08em; }
.tag { font-size: 10.5px; color: var(--warn); letter-spacing: .06em; }
img { max-width: 100%; height: auto; margin-top: 10px; }
.note { color: var(--muted); font-size: 11.5px; border-left: 2px solid var(--line); padding-left: 10px; }
"""


def _cls(x: float) -> str:
    return "pos" if pd.notna(x) and x >= 0 else "neg"


def _money(x: float, signed: bool = False) -> str:
    if pd.isna(x):
        return "n/a"
    sign = "+" if signed and x >= 0 else ("-" if x < 0 else "")
    return f"{sign}${abs(x):,.0f}"


def _pct(x: float, signed: bool = True) -> str:
    return "n/a" if pd.isna(x) else (f"{x:+.1f}%" if signed else f"{x:.1f}%")


def render_html(name: str, table: pd.DataFrame, totals: dict, regime: dict | None,
                div: dict | None, alerts: list[str], extra: dict, charts: dict) -> str:
    e = html.escape
    parts = [f"<!doctype html><html lang='en'><head><meta charset='utf-8'>"
             f"<meta name='viewport' content='width=device-width, initial-scale=1'>"
             f"<title>Daily report</title><style>{CSS}</style></head><body>",
             "<div class='eyebrow'>Portfolio Lab · daily report</div>",
             f"<h1>{e(name.title())}</h1>",
             f"<p class='sub'>CLOSE {totals['as_of']} · GENERATED {date.today()}</p>"]
    # What changed
    if alerts:
        parts.append("<div class='alerts'><b>Alerts</b><ul>" +
                     "".join(f"<li>{e(a)}</li>" for a in alerts) + "</ul></div>")
    else:
        msg = ("First report: from tomorrow this box lists only what changed."
               if extra["first_report"] else "All normal: nothing needs your attention today.")
        parts.append(f"<div class='alerts ok'>{e(msg)}</div>")
    # Your money
    parts.append("<h2>Position</h2><div class='cards'>")
    parts.append(f"<div class='card'><div class='k'>Total value</div><div class='v'>"
                 f"{_money(totals['value'])}</div><div class='d {_cls(totals['day_change'])}'>"
                 f"{_money(totals['day_change'], True)} ({_pct(totals['day_change_%'])}) today"
                 f"</div></div>")
    parts.append(f"<div class='card'><div class='k'>Invested</div><div class='v'>"
                 f"{_money(totals['invested'])}</div></div>")
    parts.append(f"<div class='card'><div class='k'>Gain / loss</div><div class='v "
                 f"{_cls(totals['gain'])}'>{_money(totals['gain'], True)}</div><div class='d "
                 f"{_cls(totals['gain'])}'>{_pct(totals['gain_%'])}</div></div>")
    parts.append(f"<div class='card'><div class='k'>From 1-year high</div><div class='v "
                 f"{_cls(extra['drawdown_%'])}'>{_pct(extra['drawdown_%'])}</div>"
                 f"<div class='d'>today's holdings</div></div></div>")
    if charts.get("value"):
        parts.append(f"<img src='{charts['value']}' alt='Value over the past year'>"
                     "<p class='note'>The line assumes you held today's shares all year; the "
                     "dots are the values logged by each daily report.</p>")
    # Your mix
    parts.append("<h2>Allocation</h2><table><tr><th>Ticker</th><th>Value</th><th>1D</th>"
                 "<th>P&amp;L</th><th>Weight</th><th>Target</th><th>Drift</th></tr>")
    for _, r in table.iterrows():
        flag = " <span class='tag'>REBALANCE</span>" if r["rebalance_flag"] else ""
        drift = "n/a" if pd.isna(r["drift_pts"]) else f"{r['drift_pts']:+.1f}{flag}"
        parts.append(f"<tr><td>{e(r['ticker'])}</td><td>{_money(r['value'])}</td>"
                     f"<td class='{_cls(r['day_change_usd'])}'>{_money(r['day_change_usd'], True)}</td>"
                     f"<td class='{_cls(r['gain_%'])}'>{_pct(r['gain_%'])}</td>"
                     f"<td>{_pct(r['actual_%'], False)}</td><td>{_pct(r['target_%'], False)}</td>"
                     f"<td>{drift}</td></tr>")
    parts.append("</table>")
    if charts.get("mix"):
        parts.append(f"<img src='{charts['mix']}' alt='Actual vs target mix'>")
    parts.append(f"<p class='note'>REBALANCE = more than {hd.DRIFT_BAND:.0f} percentage "
                 "points from target. Drift in percentage points.</p>")
    # Market regime
    parts.append("<h2>Market regime</h2>")
    if regime:
        parts.append(f"<p><span class='badge {regime['level']}'>{regime['level'].upper()}</span>"
                     f"{e(REGIME_TEXT[regime['level']])}</p>")
        parts.append("<div class='cards'>"
                     f"<div class='card'><div class='k'>Average correlation (41 large caps)</div>"
                     f"<div class='v'>{regime['avg_corr']:.2f}</div><div class='d'>z = "
                     f"{regime['avg_corr_z']:+.1f} vs the past 2 years · higher than "
                     f"{regime['corr_percentile']:.0f}% of the last 5 years</div></div>"
                     f"<div class='card'><div class='k'>Market volatility (S&amp;P 500, 90 days)</div>"
                     f"<div class='v'>{100 * regime['vol']:.1f}%</div><div class='d'>z = "
                     f"{regime['vol_z']:+.1f} vs the past 2 years</div></div></div>")
        parts.append(f"<img src='{charts['regime']}' alt='Average correlation, past 2 years'>")
        parts.append(f"<p class='note'>{e(CAVEAT)}</p>")
    else:
        parts.append("<p class='note'>Market regime unavailable today (download failed).</p>")
    # Diversification
    parts.append("<h2>Diversification</h2>")
    if div:
        rise = 100 * (div["vol_crisis"] / div["vol_today"] - 1)
        parts.append("<div class='cards'>"
                     f"<div class='card'><div class='k'>Independent bets today</div><div class='v'>"
                     f"{div['bets_today']:.1f}</div><div class='d'>{div['bets_crisis']:.1f} with "
                     f"COVID-crash correlations</div></div>"
                     f"<div class='card'><div class='k'>Volatility today</div><div class='v'>"
                     f"{div['vol_today']:.1f}%</div><div class='d'>{div['vol_crisis']:.1f}% "
                     f"({rise:+.0f}%) if correlations jumped to crisis levels</div></div>"
                     f"<div class='card'><div class='k'>Biggest source of risk</div><div class='v'>"
                     f"{e(div['top'])}</div><div class='d'>{div['top_money']:.0f}% of the money, "
                     f"{div['top_risk']:.0f}% of the risk</div></div></div>")
    else:
        parts.append("<p class='note'>Needs at least 2 invested holdings with price history "
                     "back to 2020.</p>")
    parts.append("<p class='note'>Not financial advice. Figures are based on past prices, "
                 "before fees and taxes. Cash is excluded from the diversification figures.</p>")
    parts.append("</body></html>")
    return "\n".join(parts)


# ---------------------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------------------


def run_report(cfg: pdx.Config, holdings_path: Path, synthetic: bool = False,
               open_browser: bool = False) -> dict:
    """Build today's report for a holdings file; returns paths, totals, alerts and regime."""
    df = hd.load_holdings(holdings_path)
    if df.empty:
        raise ValueError(f"{holdings_path} has no holdings")
    name = holdings_path.stem.replace("_", " ")
    log.info("Building daily report for %s", name)
    table, totals = hd.value_holdings(df, cfg, synthetic)
    try:
        regime = market_regime(cfg, synthetic)
    except Exception as exc:  # the report should still work without the regime section
        log.error("Market regime unavailable: %s", exc)
        regime = None
    prices, value_1y = holdings_history(table, cfg, synthetic)
    try:
        div = diversification(prices, table, cfg)
    except Exception as exc:
        log.error("Diversification unavailable: %s", exc)
        div = None
    logged = update_history(holdings_path, totals)
    alerts, extra = find_alerts(totals, regime, value_1y,
                                holdings_path.with_name(holdings_path.stem + "_state.json"))
    charts = {"value": chart_value(value_1y, logged), "mix": chart_mix(table),
              "regime": chart_regime(regime) if regime else None}
    page = render_html(name, table, totals, regime, div, alerts, extra, charts)
    outdir = cfg.outdir / "reports"
    outdir.mkdir(parents=True, exist_ok=True)
    out = outdir / f"{holdings_path.stem}_{totals['as_of']}.html"
    out.write_text(page)
    latest = outdir / f"{holdings_path.stem}_latest.html"
    latest.write_text(page)
    log.info("Report: value %s, today %s, regime %s, %d alert(s)", _money(totals["value"]),
             _pct(totals["day_change_%"]), regime["level"] if regime else "n/a", len(alerts))
    for a in alerts:
        log.info("  ALERT: %s", a)
    log.info("Saved %s (and %s)", out, latest.name)
    if open_browser:
        import webbrowser
        webbrowser.open(latest.resolve().as_uri())
    return {"path": out, "latest": latest, "html": page, "totals": totals, "alerts": alerts,
            "regime": regime["level"] if regime else None, "synthetic": synthetic}

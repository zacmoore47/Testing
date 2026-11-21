"""
compare.py - compare candidate portfolios side by side (portfolio app track, Session 1).

Each candidate is a CSV with columns ``ticker,weight`` (see portfolios/candidates/).
All portfolios are measured over the SAME period: the common history of every holding in
every candidate, so no portfolio gets an easier or harder time window than another.

Measures per portfolio:
    growth per year, volatility, return per unit of volatility, worst drop and how long it
    took to recover, worst 12 months, what $10,000 became, independent bets today and in the
    COVID crash, the biggest single source of risk, and the return in each named crisis.

Usage (from the panic_detector folder):
    python panic_detector.py --compare portfolios/candidates

Assumptions: portfolios are rebalanced to their target weights (approximated daily);
prices are dividend-adjusted (total return); fees, taxes and trading costs are ignored.
Before an ETF existed, its history is extended with a look-alike fund (see PROXIES in
panic_detector.py); turn this off with --no-proxies.
"""
from __future__ import annotations

import logging
import math
import textwrap
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from matplotlib.colors import LinearSegmentedColormap, TwoSlopeNorm

import panic_detector as pdx

log = logging.getLogger("panic_detector")

# Fixed categorical order (colour follows the portfolio's position in the list).
SERIES_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300",
                 "#6250d6", "#e34948"]
COVID_TROUGH = "2020-03-23"
HINDSIGHT_NOTE = ("Past performance is not a forecast. This period includes an exceptional run "
                  "for US large-cap tech, so ranking by past growth rewards whatever happened "
                  "to win. Weigh the worst drop and crisis consistency at least as heavily.")


def find_portfolio_files(paths: list[Path]) -> list[Path]:
    """Expand folders into their CSV files (sorted by name); keep explicit files as given."""
    files: list[Path] = []
    for p in paths:
        if p.is_dir():
            files.extend(sorted(p.glob("*.csv")))
        elif p.suffix.lower() == ".csv":
            files.append(p)
        else:
            raise ValueError(f"{p} is not a folder or a .csv file")
    if not files:
        raise ValueError("no portfolio CSV files found")
    return files


def portfolio_name(path: Path) -> str:
    """'3_stocks_bonds_60_40.csv' -> 'stocks bonds 60 40'."""
    stem = path.stem.lstrip("0123456789_- ")
    return stem.replace("_", " ") or path.stem


def value_series(px: pd.DataFrame, weights: pd.Series) -> pd.Series:
    """Daily value of $1 invested, rebalanced to target weights every day."""
    r = px[list(weights.index)].pct_change().iloc[1:]
    port = r.to_numpy() @ weights.to_numpy()
    v = np.concatenate([[1.0], np.cumprod(1.0 + port)])
    return pd.Series(v, index=px.index, name="value")


def long_run_stats(v: pd.Series) -> dict:
    """Growth, risk and drawdown statistics of a value series that starts at 1."""
    years = (v.index[-1] - v.index[0]).days / 365.25
    daily = v.pct_change().dropna()
    cagr = v.iloc[-1] ** (1 / years) - 1 if years > 0 else np.nan
    vol = daily.std() * math.sqrt(252)
    peak = v.cummax()
    dd = v / peak - 1
    trough = dd.idxmin()
    peak_date = v.loc[:trough].idxmax()
    after = v.loc[trough:]
    rec = after[after >= v.loc[peak_date]]
    if rec.empty:
        recovery = "not yet recovered"
        rec_months = np.nan
    else:
        rec_months = (rec.index[0] - peak_date).days / 30.44
        recovery = f"{rec_months:.0f} months"
    return {
        "growth_per_year_%": 100 * cagr,
        "volatility_%": 100 * vol,
        "return_per_risk": cagr / vol if vol > 0 else np.nan,
        "max_drawdown_%": 100 * dd.min(),
        "max_drawdown_period": f"{peak_date:%Y-%m} to {trough:%Y-%m}",
        "peak_to_recovery": recovery,
        "recovery_months": rec_months,
        "worst_12m_%": 100 * v.pct_change(252).min() if len(v) > 252 else np.nan,
        "10k_becomes_$": 10_000 * v.iloc[-1],
    }


def run_compare(cfg: pdx.Config, paths: list[Path], synthetic: bool = False) -> dict:
    """Compare candidate portfolios; writes outputs/compare/.

    Returns a dict: summary, crisis_table, rolling_summary, rolling_windows, start, end,
    proxy_lines, synthetic, and chart paths comparison_png / rolling_png.
    """
    files = find_portfolio_files(paths)
    ports = {portfolio_name(f): pdx.load_portfolio(f, min_holdings=1) for f in files}
    log.info("Comparing %d portfolios: %s", len(ports), ", ".join(ports))
    union = sorted(set().union(*[set(w.index) for w in ports.values()]))
    outdir = cfg.outdir / "compare"
    outdir.mkdir(parents=True, exist_ok=True)

    if not synthetic:
        try:
            extra = pdx.proxy_tickers(union) if cfg.use_proxies else []
            prices = pdx.download_prices(cfg, tickers=union + extra,
                                         cache_name="prices_cache_compare.csv")
        except pdx.DataDownloadError as exc:
            log.error("%s -> falling back to SYNTHETIC data", exc)
            synthetic = True
    if synthetic:
        log.warning("Using SYNTHETIC prices: every number below is illustrative only")
        syn = pdx.Config(universe={"All": union}, start=cfg.start, end=cfg.end, seed=cfg.seed,
                         market_ticker=cfg.market_ticker)
        prices, _ = pdx.generate_synthetic_prices(syn)

    proxy_lines: list[str] = []
    if cfg.use_proxies:
        spliced, notes = pdx.splice_proxies(prices, union)
        spliced[cfg.market_ticker] = prices[cfg.market_ticker]
        prices = spliced
        proxy_lines = pdx.describe_proxies(notes)
        for line in proxy_lines:
            log.info("Longer history via proxy: %s", line)

    # One common period for every portfolio, so the comparison is fair.
    have = [t for t in union if t in prices.columns and prices[t].notna().any()]
    missing = sorted(set(union) - set(have))
    if missing:
        raise ValueError(f"No price data for {', '.join(missing)}: check the ticker symbols")
    first = prices[have + [cfg.market_ticker]].apply(lambda c: c.first_valid_index())
    common_start = first.max()
    log.info("Common history for all portfolios: %s -> %s (limited by %s, first traded %s)",
             common_start.date(), prices.index[-1].date(), first.idxmax(), common_start.date())
    prices = prices.loc[common_start:]

    rows, values, crisis_rows = [], {}, []
    for name, w in ports.items():
        px, w = pdx.prepare_portfolio_prices(prices, w, cfg, min_holdings=1)
        v = value_series(px, w)
        values[name] = v
        stats = long_run_stats(v)
        replay, _ = pdx.crisis_replay(px, w, cfg)
        if len(w) >= 2:
            scen, hold, _ = pdx.portfolio_stress(px, w, cfg, crisis_date=COVID_TROUGH)
            bets_today, bets_covid = scen["independent_bets"].iloc[0], scen["independent_bets"].iloc[1]
            top_t, top_share = hold.index[0], hold["risk_share_today_%"].iloc[0]
        else:
            bets_today = bets_covid = 1.0
            top_t, top_share = w.index[0], 100.0
        rows.append({"portfolio": name, "holdings": len(w), **stats,
                     "bets_today": bets_today, "bets_in_covid": bets_covid,
                     "biggest_risk": f"{top_t} {top_share:.0f}%"})
        for _, r in replay.iterrows():
            crisis_rows.append({"portfolio": name, "crisis": r["crisis"],
                                "return_%": r["portfolio_return_%"],
                                "max_drawdown_%": r["max_drawdown_%"]})

    summary = pd.DataFrame(rows)
    crises = pd.DataFrame(crisis_rows)
    crisis_table = crises.pivot(index="portfolio", columns="crisis", values="return_%")
    crisis_table = crisis_table.reindex(index=list(ports),
                                        columns=list(dict.fromkeys(crises["crisis"])))
    summary = summary.merge(crisis_table.add_prefix("crisis: ").reset_index(), on="portfolio")
    summary["worst_crisis_%"] = crisis_table.min(axis=1).to_numpy()

    summary.to_csv(outdir / "comparison.csv", index=False, float_format="%.2f")
    pd.DataFrame(values).to_csv(outdir / "portfolio_values.csv", float_format="%.5f")
    log.info("Saved %s and %s", outdir / "comparison.csv", outdir / "portfolio_values.csv")
    log_comparison(summary, crisis_table, common_start, prices.index[-1])
    roll_summary, roll_windows = rolling_analysis(values)
    if not roll_summary.empty:
        roll_summary.to_csv(outdir / "rolling_summary.csv", index=False, float_format="%.2f")
        roll_windows.to_csv(outdir / "rolling_windows.csv", index=False, float_format="%.4f")
        log.info("Saved %s and %s", outdir / "rolling_summary.csv", outdir / "rolling_windows.csv")
        log_rolling(roll_summary, roll_windows)
        plot_rolling(roll_summary, roll_windows, list(ports), outdir / "rolling.png")
    result = {"summary": summary, "crisis_table": crisis_table, "rolling_summary": roll_summary,
              "rolling_windows": roll_windows, "start": common_start, "end": prices.index[-1],
              "proxy_lines": proxy_lines, "synthetic": synthetic,
              "values": pd.DataFrame(values), "names": list(ports),
              "comparison_png": outdir / "comparison.png",
              "rolling_png": outdir / "rolling.png" if not roll_summary.empty else None}
    plot_comparison(summary, crisis_table, values, common_start, outdir / "comparison.png",
                    proxy_lines)
    return result


ROLLING_YEARS: tuple[int, ...] = (5, 10)


def rolling_analysis(values: dict[str, pd.Series],
                     years: tuple[int, ...] = ROLLING_YEARS) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Every holding period of N years, started at each month: how robust is each mix?

    For each start month and horizon, each portfolio's annualised return and worst drop
    within that period are computed, and portfolios are ranked by return. Windows overlap
    heavily: 26 years of history contain only about 2-3 non-overlapping 10-year periods, so
    the percentages describe how results varied with the start date, not independent trials.

    Returns:
        (summary per portfolio and horizon, one row per start date / horizon / portfolio)
    """
    vals = pd.DataFrame(values)
    names = list(vals.columns)
    month_starts = vals.groupby(vals.index.to_period("M")).head(1).index
    rows = []
    for yrs in years:
        last_start = vals.index[-1] - pd.DateOffset(years=yrs)
        starts = month_starts[month_starts <= last_start]
        if len(starts) < 2:
            log.info("Rolling %d-year periods: not enough history, skipped", yrs)
            continue
        for st in starts:
            end = vals.index[vals.index.searchsorted(st + pd.DateOffset(years=yrs)) - 1]
            win = vals.loc[st:end]
            span = (win.index[-1] - win.index[0]).days / 365.25
            ann = (win.iloc[-1] / win.iloc[0]) ** (1 / span) - 1
            mdd = (win / win.cummax() - 1).min()
            rank = ann.rank(ascending=False, method="min")
            for n in names:
                rows.append({"years": yrs, "start": st.date(), "end": end.date(), "portfolio": n,
                             "ann_return": ann[n], "max_drawdown": mdd[n], "rank": rank[n]})
    windows = pd.DataFrame(rows)
    if windows.empty:
        return pd.DataFrame(), windows
    g = windows.groupby(["years", "portfolio"], sort=False)
    summary = pd.DataFrame({
        "periods": g.size(),
        "worst_%/yr": 100 * g["ann_return"].min(),
        "bad_10pct_%/yr": 100 * g["ann_return"].quantile(0.10),
        "typical_%/yr": 100 * g["ann_return"].median(),
        "best_%/yr": 100 * g["ann_return"].max(),
        "lost_money_%": 100 * g["ann_return"].apply(lambda x: (x < 0).mean()),
        "worst_drop_inside_%": 100 * g["max_drawdown"].min(),
        "came_first_%": 100 * g["rank"].apply(lambda x: (x == 1).mean()),
        "avg_rank": g["rank"].mean(),
    }).reset_index()
    return summary, windows


def log_rolling(summary: pd.DataFrame, windows: pd.DataFrame) -> None:
    """Print one rolling-period table per horizon."""
    for yrs, tab in summary.groupby("years", sort=False):
        w = windows[windows["years"] == yrs]
        show = tab.drop(columns="years").rename(columns={
            "portfolio": "Portfolio", "periods": "Periods", "worst_%/yr": "Worst",
            "bad_10pct_%/yr": "Bad (10%)", "typical_%/yr": "Typical", "best_%/yr": "Best",
            "lost_money_%": "Lost money", "worst_drop_inside_%": "Worst drop",
            "came_first_%": "Came 1st", "avg_rank": "Avg rank"})
        for c in ("Worst", "Bad (10%)", "Typical", "Best"):
            show[c] = show[c].map(lambda x: f"{x:+.1f}%/yr")
        for c in ("Lost money", "Came 1st"):
            show[c] = show[c].map(lambda x: f"{x:.0f}% of periods")
        show["Worst drop"] = show["Worst drop"].map(lambda x: f"{x:.0f}%")
        show["Avg rank"] = show["Avg rank"].map(lambda x: f"{x:.1f}")
        log.info("ROLLING %d-YEAR PERIODS: one started every month, %s to %s (%d start dates; "
                 "they overlap, so only about %.0f are truly separate):\n%s", yrs,
                 w["start"].min(), w["start"].max(), w["start"].nunique(),
                 max(1, ((pd.Timestamp(w["end"].max()) - pd.Timestamp(w["start"].min())).days
                         / 365.25) / yrs), show.to_string(index=False))
    log.info("How to read: 'Worst' = annual return if you had started at the worst month; "
             "'Bad (10%)' = 1 in 10 start dates did this badly or worse; 'Came 1st' = share "
             "of start dates where this mix had the highest return.")


def plot_rolling(summary: pd.DataFrame, windows: pd.DataFrame, names: list[str],
                 path: Path) -> None:
    """Per horizon: return by start date (left) and range of outcomes (right)."""
    colors = {n: SERIES_COLORS[i % len(SERIES_COLORS)] for i, n in enumerate(names)}
    horizons = list(dict.fromkeys(summary["years"]))
    fig, axes = plt.subplots(len(horizons), 2, figsize=(17, 5.2 * len(horizons)),
                             gridspec_kw={"width_ratios": [1.6, 1]}, squeeze=False)
    for row, yrs in enumerate(horizons):
        ax_l, ax_r = axes[row]
        for ax in (ax_l, ax_r):
            pdx._style_axis(ax)
        w = windows[windows["years"] == yrs]
        for n in names:
            d = w[w["portfolio"] == n]
            ax_l.plot(pd.to_datetime(d["start"]), 100 * d["ann_return"], color=colors[n],
                      linewidth=1.6, label=n)
        ax_l.axhline(0, color=pdx.INK_MUTED, linewidth=0.8)
        ax_l.set_ylabel(f"Return per year over the next {yrs} years (%)", color=pdx.INK)
        ax_l.set_xlabel("Start date of the holding period", color=pdx.INK)
        ax_l.set_title(f"{yrs}-year results depending on when you started", fontsize=11,
                       color=pdx.INK, loc="left")
        if row == 0:
            ax_l.legend(frameon=False, fontsize=9, loc="upper right", ncol=2)

        tab = summary[summary["years"] == yrs].set_index("portfolio").reindex(names)
        y = np.arange(len(names))[::-1]
        for yi, n in zip(y, names):
            r = tab.loc[n]
            ax_r.hlines(yi, r["worst_%/yr"], r["best_%/yr"], color=colors[n], linewidth=2, alpha=0.35)
            ax_r.hlines(yi, r["bad_10pct_%/yr"], r["best_%/yr"], color=colors[n], linewidth=6,
                        alpha=0.5)
            ax_r.plot(r["typical_%/yr"], yi, "o", color=colors[n], markersize=9,
                      markeredgecolor="white")
            ax_r.plot(r["worst_%/yr"], yi, "|", color=pdx.INK, markersize=12)
            ax_r.annotate(f"worst {r['worst_%/yr']:+.1f}%", (r["worst_%/yr"], yi),
                          xytext=(0, -12), textcoords="offset points", ha="center",
                          fontsize=8, color=pdx.INK)
        ax_r.axvline(0, color=pdx.INK_MUTED, linewidth=0.8)
        ax_r.set_yticks(y)
        ax_r.set_yticklabels(names, fontsize=9)
        ax_r.grid(axis="y", visible=False)
        ax_r.set_xlabel("Return per year (%): thin = full range, thick = 10th pct to best, "
                        "dot = typical", color=pdx.INK, fontsize=9)
        ax_r.set_title(f"Range of {yrs}-year outcomes", fontsize=11, color=pdx.INK, loc="left")
    fig.suptitle("Robustness: every holding period, started each month", fontsize=14,
                 color=pdx.INK)
    fig.text(0.5, 0.005, "Periods overlap heavily, so these show how results depended on the "
             "start date, not independent trials. " + HINDSIGHT_NOTE, ha="center", va="bottom",
             fontsize=8.5, color=pdx.INK_MUTED, wrap=True)
    fig.tight_layout(rect=(0, 0.03, 1, 0.96))
    fig.savefig(path, dpi=130)
    plt.close(fig)
    log.info("Saved %s", path)


def log_comparison(summary: pd.DataFrame, crisis_table: pd.DataFrame,
                   start: pd.Timestamp, end: pd.Timestamp) -> None:
    """Print the comparison as two readable tables plus the hindsight note."""
    cols = {"portfolio": "Portfolio", "growth_per_year_%": "Growth/yr", "volatility_%": "Vol",
            "max_drawdown_%": "Worst drop", "peak_to_recovery": "Recovery",
            "worst_12m_%": "Worst 12m", "10k_becomes_$": "$10k ->", "bets_today": "Bets now",
            "bets_in_covid": "Bets COVID", "biggest_risk": "Biggest risk"}
    tab = summary[list(cols)].rename(columns=cols)
    fmt = {"Growth/yr": "{:.1f}%", "Vol": "{:.1f}%", "Worst drop": "{:.1f}%",
           "Worst 12m": "{:.1f}%", "$10k ->": "${:,.0f}", "Bets now": "{:.1f}",
           "Bets COVID": "{:.1f}"}
    for c, f in fmt.items():
        tab[c] = tab[c].map(lambda x, f=f: f.format(x) if pd.notna(x) else "n/a")
    log.info("PORTFOLIO COMPARISON (%s -> %s, rebalanced, before fees and taxes):\n%s",
             start.date(), end.date(), tab.to_string(index=False))
    ct = crisis_table.map(lambda x: f"{x:+.1f}%" if pd.notna(x) else "n/a")
    log.info("RETURN IN EACH CRISIS (start to market bottom):\n%s", ct.to_string())
    log.info("NOTE: %s", HINDSIGHT_NOTE)


def plot_comparison(summary: pd.DataFrame, crisis_table: pd.DataFrame,
                    values: dict[str, pd.Series], start: pd.Timestamp, path: Path,
                    proxy_lines: list[str] | None = None) -> None:
    """2x2 dashboard: growth of $10k, drawdowns, risk/return map, crisis heatmap."""
    names = list(summary["portfolio"])
    colors = {n: SERIES_COLORS[i % len(SERIES_COLORS)] for i, n in enumerate(names)}
    fig, axes = plt.subplots(2, 2, figsize=(17, 12))
    ax_g, ax_d, ax_s, ax_h = axes.ravel()
    for ax in (ax_g, ax_d, ax_s):
        pdx._style_axis(ax)

    for n in names:
        v = values[n]
        ax_g.plot(v.index, 10_000 * v, color=colors[n], linewidth=1.8, label=n)
        dd = 100 * (v / v.cummax() - 1)
        ax_d.plot(dd.index, dd, color=colors[n], linewidth=1.3, label=n)
    ax_g.set_yscale("log")
    # End labels, nudged apart so close finishers do not overlap.
    finals = sorted(((10_000 * values[n].iloc[-1], n) for n in names))
    lo, hi = np.log10(ax_g.get_ylim())
    gap = 0.045 * (hi - lo)
    ys: list[float] = []
    for val, _ in finals:
        y = np.log10(val)
        ys.append(max(y, ys[-1] + gap) if ys else y)
    x_end = max(values[n].index[-1] for n in names)
    for (val, n), y in zip(finals, ys):
        ax_g.annotate(f" ${val:,.0f}", (x_end, 10 ** y), fontsize=8, color=colors[n],
                      va="center", annotation_clip=False)
    ax_g.set_ylabel("Value of $10,000 (log scale)", color=pdx.INK)
    ax_g.set_title("Growth of $10,000", fontsize=11, color=pdx.INK, loc="left")
    ax_g.legend(frameon=False, fontsize=9, loc="upper left")
    ax_d.axhline(0, color=pdx.INK_MUTED, linewidth=0.8)
    ax_d.set_ylabel("% below previous high", color=pdx.INK)
    ax_d.set_title("Drawdowns: how far below its high each portfolio was", fontsize=11,
                   color=pdx.INK, loc="left")

    for _, r in summary.iterrows():
        ax_s.scatter(-r["max_drawdown_%"], r["growth_per_year_%"], s=110, color=colors[r["portfolio"]],
                     edgecolor="white", linewidth=1.5, zorder=3)
        ax_s.annotate(f"  {r['portfolio']}", (-r["max_drawdown_%"], r["growth_per_year_%"]),
                      fontsize=9, color=pdx.INK, va="center")
    ax_s.set_xlabel("Worst drop (%), further right = more painful", color=pdx.INK)
    ax_s.set_ylabel("Growth per year (%)", color=pdx.INK)
    ax_s.set_title("Reward vs pain (up and to the left is better)", fontsize=11,
                   color=pdx.INK, loc="left")
    ax_s.margins(x=0.25, y=0.15)

    vals = crisis_table.to_numpy(dtype=float)
    lim = np.nanmax(np.abs(vals)) if np.isfinite(vals).any() else 1.0
    cmap = LinearSegmentedColormap.from_list("div", ["#e34948", "#f0efec", "#2a78d6"])
    ax_h.imshow(vals, cmap=cmap, norm=TwoSlopeNorm(vmin=-lim, vcenter=0, vmax=lim), aspect="auto")
    for i in range(vals.shape[0]):
        for j in range(vals.shape[1]):
            if np.isfinite(vals[i, j]):
                ax_h.text(j, i, f"{vals[i, j]:+.0f}%", ha="center", va="center", fontsize=9,
                          color=pdx.INK)
    ax_h.set_xticks(range(vals.shape[1]))
    ax_h.set_xticklabels([textwrap.fill(c, 13) for c in crisis_table.columns], fontsize=8)
    ax_h.set_yticks(range(vals.shape[0]))
    ax_h.set_yticklabels(crisis_table.index, fontsize=9)
    ax_h.tick_params(length=0, colors=pdx.INK_MUTED)
    for side in ax_h.spines.values():
        side.set_visible(False)
    ax_h.set_title("Return in each crisis (start to market bottom)", fontsize=11, color=pdx.INK,
                   loc="left")

    fig.suptitle(f"Portfolio comparison since {start:%b %Y} (rebalanced, before fees and taxes)",
                 fontsize=14, color=pdx.INK)
    foot = HINDSIGHT_NOTE
    if proxy_lines:
        foot += "\nEarlier years use look-alike funds before an ETF existed: " + "; ".join(proxy_lines)
    fig.text(0.5, 0.005, foot, ha="center", va="bottom", fontsize=8.5, color=pdx.INK_MUTED,
             wrap=True)
    fig.tight_layout(rect=(0, 0.045 if proxy_lines else 0.03, 1, 0.96))
    fig.savefig(path, dpi=130)
    plt.close(fig)
    log.info("Saved %s", path)

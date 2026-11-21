"""
charts.py - interactive Altair charts for Portfolio Lab, in one consistent visual style.

Every chart: thin marks, a recessive grid, monospaced numbers, colours in a fixed order (the
colour follows the portfolio, never its rank), a legend whenever there are 2+ series, and a
hover tooltip with exact values. Positive = blue, negative = red, neutral midpoint = grey.
"""
from __future__ import annotations

import altair as alt
import numpy as np
import pandas as pd

SANS = "IBM Plex Sans, Helvetica Neue, Helvetica, Arial, sans-serif"
MONO = "IBM Plex Mono, SFMono-Regular, Menlo, Consolas, monospace"
INK = "#1a1a1a"
MUTED = "#6b6b6b"
GRID = "#ececea"
AXIS = "#cfcfcb"
BLUE = "#2a78d6"
LIGHT_BLUE = "#9ec5f4"
RED = "#c62f2e"
NEUTRAL = "#f0efec"
GREY = "#9a9a9a"
SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"]


def style(chart: alt.TopLevelMixin, height: int = 320) -> alt.TopLevelMixin:
    """Apply the shared look (fonts, axes, legend) to a finished chart."""
    return (chart.properties(height=height, width="container")
            .configure(font=SANS, background="transparent", padding={"left": 4, "right": 12,
                                                                      "top": 8, "bottom": 4})
            .configure_view(stroke=None)
            .configure_axis(labelColor=MUTED, titleColor=MUTED, labelFont=MONO, labelFontSize=10,
                            titleFont=SANS, titleFontSize=11, titleFontWeight="normal",
                            gridColor=GRID, domainColor=AXIS, tickColor=AXIS, labelPadding=4)
            .configure_legend(labelColor=INK, labelFont=SANS, labelFontSize=11, orient="bottom",
                              title=None, symbolStrokeWidth=2, columnPadding=16)
            .configure_text(font=MONO))


def _palette(names: list[str]) -> alt.Scale:
    return alt.Scale(domain=names, range=[SERIES[i % len(SERIES)] for i in range(len(names))])


def multi_line(df: pd.DataFrame, x: str, y: str, series: str, names: list[str], y_title: str,
               fmt: str, log: bool = False, zero_line: bool = False, height: int = 320,
               x_fmt: str = "%b %Y") -> alt.TopLevelMixin:
    """Lines per series with a hover crosshair listing every series' value at that date."""
    nearest = alt.selection_point(nearest=True, on="pointerover", fields=[x], empty=False)
    scale = alt.Scale(type="log") if log else alt.Scale(zero=False)
    base = alt.Chart(df).encode(
        x=alt.X(f"{x}:T", title=None, axis=alt.Axis(format="%Y", tickCount=10)),
        y=alt.Y(f"{y}:Q", title=y_title, scale=scale, axis=alt.Axis(format=fmt, tickCount=6)),
        color=alt.Color(f"{series}:N", scale=_palette(names),
                        legend=alt.Legend(title=None, columns=min(len(names), 3))))
    lines = base.mark_line(strokeWidth=1.6)
    points = base.mark_point(filled=True, size=36).encode(
        opacity=alt.condition(nearest, alt.value(1), alt.value(0)))
    rule = (alt.Chart(df).transform_pivot(series, value=y, groupby=[x])
            .mark_rule(color=GREY, strokeWidth=1)
            .encode(x=f"{x}:T", opacity=alt.condition(nearest, alt.value(0.8), alt.value(0)),
                    tooltip=[alt.Tooltip(f"{x}:T", title="Date", format=x_fmt)]
                    + [alt.Tooltip(f"{n}:Q", format=fmt) for n in names])
            .add_params(nearest))
    layers = [lines, points, rule]
    if zero_line:
        layers.insert(0, alt.Chart(pd.DataFrame({"z": [0]})).mark_rule(color=AXIS).encode(y="z:Q"))
    return style(alt.layer(*layers), height)


def growth_chart(values: pd.DataFrame, names: list[str]) -> alt.TopLevelMixin:
    """Value of $10,000 over time (log scale), weekly points."""
    v = 10_000 * values[names].resample("W").last().dropna(how="all")
    df = v.reset_index(names="date").melt("date", var_name="portfolio", value_name="value")
    return multi_line(df, "date", "value", "portfolio", names, "Value of $10,000 (log)", "$,.0f",
                      log=True)


def drawdown_chart(values: pd.DataFrame, names: list[str]) -> alt.TopLevelMixin:
    """Percentage below the running high, weekly points."""
    v = values[names].resample("W").last().dropna(how="all")
    dd = 100 * (v / v.cummax() - 1)
    df = dd.reset_index(names="date").melt("date", var_name="portfolio", value_name="drawdown")
    return multi_line(df, "date", "drawdown", "portfolio", names, "% below previous high", ".0f",
                      zero_line=True, height=260)


def risk_return_scatter(summary: pd.DataFrame, names: list[str]) -> alt.TopLevelMixin:
    """Growth per year vs worst drop, labelled points."""
    df = summary.assign(worst=-summary["max_drawdown_%"])
    base = alt.Chart(df).encode(
        x=alt.X("worst:Q", title="Max drawdown (%)  →  more painful",
                scale=alt.Scale(zero=False, nice=True, padding=24),
                axis=alt.Axis(format=".0f", tickMinStep=1, tickCount=6)),
        y=alt.Y("growth_per_year_%:Q", title="CAGR (%)", scale=alt.Scale(zero=False, padding=16),
                axis=alt.Axis(format=".1f", tickCount=6)),
        color=alt.Color("portfolio:N", scale=_palette(names), legend=None),
        tooltip=[alt.Tooltip("portfolio:N", title="Portfolio"),
                 alt.Tooltip("growth_per_year_%:Q", title="Growth / yr %", format=".1f"),
                 alt.Tooltip("worst:Q", title="Worst drop %", format=".1f"),
                 alt.Tooltip("volatility_%:Q", title="Volatility %", format=".1f")])
    pts = base.mark_point(filled=True, size=110, opacity=1, stroke="white", strokeWidth=1.5)
    labels = base.mark_text(align="left", dx=9, font=SANS, fontSize=11, color=INK).encode(
        text="portfolio:N", color=alt.value(INK))
    return style(alt.layer(pts, labels), 300)


def heatmap(df: pd.DataFrame, row: str, col: str, value: str, row_order: list[str],
            col_order: list[str], height: int | None = None) -> alt.TopLevelMixin:
    """Diverging heatmap of returns (%): red = loss, grey = flat, blue = gain."""
    lim = float(np.nanmax(np.abs(df[value]))) if df[value].notna().any() else 1.0
    base = alt.Chart(df).encode(
        x=alt.X(f"{col}:N", sort=col_order, title=None,
                axis=alt.Axis(orient="top", labelAngle=0, labelFont=SANS, labelLimit=120,
                              labelColor=INK, domain=False, ticks=False)),
        y=alt.Y(f"{row}:N", sort=row_order, title=None,
                axis=alt.Axis(labelFont=SANS, labelColor=INK, labelLimit=260, domain=False,
                              ticks=False)))
    rect = base.mark_rect(stroke="white", strokeWidth=2).encode(
        color=alt.Color(f"{value}:Q", legend=None,
                        scale=alt.Scale(domain=[-lim, 0, lim], range=[RED, NEUTRAL, BLUE],
                                        interpolate="rgb")),
        tooltip=[alt.Tooltip(f"{row}:N"), alt.Tooltip(f"{col}:N"),
                 alt.Tooltip(f"{value}:Q", title="Return %", format="+.1f")])
    text = base.mark_text(fontSize=11, color=INK).encode(text=alt.Text(f"{value}:Q", format="+.0f"))
    return style(alt.layer(rect, text), height or max(160, 34 * len(row_order)))


def rolling_lines(windows: pd.DataFrame, years: int, names: list[str]) -> alt.TopLevelMixin:
    w = windows[windows["years"] == years].assign(
        start=lambda d: pd.to_datetime(d["start"]), ann=lambda d: 100 * d["ann_return"])
    return multi_line(w[["start", "portfolio", "ann"]], "start", "ann", "portfolio", names,
                      f"Return per year over next {years} years (%)", ".1f", zero_line=True,
                      height=300)


def rolling_range(summary: pd.DataFrame, years: int, names: list[str]) -> alt.TopLevelMixin:
    """Range of outcomes: thin = worst..best, thick = 1-in-10 bad..best, dot = typical."""
    t = summary[summary["years"] == years]
    y = alt.Y("portfolio:N", sort=names, title=None, axis=alt.Axis(labelFont=SANS, labelColor=INK))
    color = alt.Color("portfolio:N", scale=_palette(names), legend=None)
    tip = [alt.Tooltip("portfolio:N", title="Portfolio"),
           alt.Tooltip("worst_%/yr:Q", title="Worst %/yr", format="+.1f"),
           alt.Tooltip("bad_10pct_%/yr:Q", title="1 in 10 bad %/yr", format="+.1f"),
           alt.Tooltip("typical_%/yr:Q", title="Typical %/yr", format="+.1f"),
           alt.Tooltip("best_%/yr:Q", title="Best %/yr", format="+.1f")]
    base = alt.Chart(t).encode(y=y, color=color, tooltip=tip)
    thin = base.mark_rule(strokeWidth=2, opacity=0.35).encode(
        x=alt.X("worst_%/yr:Q", title="Return per year (%)", axis=alt.Axis(format=".0f")),
        x2="best_%/yr:Q")
    thick = base.mark_rule(strokeWidth=7, opacity=0.55).encode(x="bad_10pct_%/yr:Q",
                                                               x2="best_%/yr:Q")
    dot = base.mark_point(filled=True, size=90, opacity=1, stroke="white").encode(x="typical_%/yr:Q")
    worst = base.mark_tick(color=INK, thickness=2, size=16).encode(x="worst_%/yr:Q",
                                                                   color=alt.value(INK))
    zero = alt.Chart(pd.DataFrame({"z": [0]})).mark_rule(color=AXIS).encode(x="z:Q")
    return style(alt.layer(zero, thin, thick, dot, worst), 40 * len(names) + 40)


def money_vs_risk(hold: pd.DataFrame) -> alt.TopLevelMixin:
    """Per holding: share of money vs share of risk (today)."""
    order = list(hold.sort_values("risk_share_today_%", ascending=False).index)
    df = pd.DataFrame({"ticker": list(hold.index) * 2,
                       "measure": ["Share of money"] * len(hold) + ["Share of risk"] * len(hold),
                       "value": list(hold["weight_%"]) + list(hold["risk_share_today_%"])})
    ch = alt.Chart(df).mark_bar(height={"band": 0.8}).encode(
        y=alt.Y("ticker:N", sort=order, title=None, axis=alt.Axis(labelFont=SANS, labelColor=INK)),
        yOffset=alt.YOffset("measure:N", sort=["Share of money", "Share of risk"]),
        x=alt.X("value:Q", title="% of portfolio", axis=alt.Axis(format=".0f")),
        color=alt.Color("measure:N", scale=alt.Scale(domain=["Share of money", "Share of risk"],
                                                     range=[LIGHT_BLUE, BLUE])),
        tooltip=[alt.Tooltip("ticker:N"), alt.Tooltip("measure:N"),
                 alt.Tooltip("value:Q", format=".1f")])
    return style(ch, max(180, 30 * len(hold) + 40))


def scenario_bars(scen: pd.DataFrame) -> alt.TopLevelMixin:
    labels = ["Today", "Crisis correlations", "Full crisis repeat", "All corr = 1"]
    df = scen.assign(label=labels[:len(scen)])
    base = alt.Chart(df).encode(
        x=alt.X("label:N", sort=labels, title=None, axis=alt.Axis(labelAngle=0, labelFont=SANS,
                                                                    labelColor=INK)),
        y=alt.Y("portfolio_vol_%:Q", title="Portfolio volatility (%/yr)", axis=alt.Axis(format=".0f")),
        tooltip=[alt.Tooltip("label:N", title="Scenario"),
                 alt.Tooltip("portfolio_vol_%:Q", title="Volatility %", format=".1f"),
                 alt.Tooltip("independent_bets:Q", title="Independent bets", format=".1f"),
                 alt.Tooltip("bad_day_1in20_%:Q", title="1-in-20 day %", format=".1f")])
    bars = base.mark_bar(size=46).encode(color=alt.Color(
        "label:N", legend=None, scale=alt.Scale(domain=labels, range=[BLUE, "#eb6834", RED, GREY])))
    text = base.mark_text(dy=-8, fontSize=11, color=INK).encode(
        text=alt.Text("portfolio_vol_%:Q", format=".1f"))
    return style(alt.layer(bars, text), 280)


def correlation_dumbbell(hold: pd.DataFrame) -> alt.TopLevelMixin:
    """Correlation of each holding with the rest of the portfolio, today vs crisis."""
    order = list(hold.sort_values("corr_to_portfolio_today").index)
    df = hold.reset_index()[["ticker", "corr_to_portfolio_today", "corr_to_portfolio_crisis"]]
    long = df.melt("ticker", var_name="when", value_name="corr").replace(
        {"corr_to_portfolio_today": "Today", "corr_to_portfolio_crisis": "Crisis correlations"})
    y = alt.Y("ticker:N", sort=order, title=None, axis=alt.Axis(labelFont=SANS, labelColor=INK))
    rule = alt.Chart(df).mark_rule(color=GRID, strokeWidth=3).encode(
        y=y, x=alt.X("corr_to_portfolio_today:Q", title="Correlation with the rest of the portfolio",
                     scale=alt.Scale(domain=[-1, 1])), x2="corr_to_portfolio_crisis:Q")
    pts = alt.Chart(long).mark_point(filled=True, size=80, opacity=1, stroke="white").encode(
        y=y, x="corr:Q",
        color=alt.Color("when:N", scale=alt.Scale(domain=["Today", "Crisis correlations"],
                                                  range=[BLUE, RED])),
        tooltip=[alt.Tooltip("ticker:N"), alt.Tooltip("when:N"), alt.Tooltip("corr:Q", format="+.2f")])
    zero = alt.Chart(pd.DataFrame({"z": [0]})).mark_rule(color=AXIS).encode(x="z:Q")
    return style(alt.layer(zero, rule, pts), max(180, 30 * len(hold) + 40))


def replay_bars(replay: pd.DataFrame, market: str = "SPY") -> alt.TopLevelMixin:
    """Portfolio vs market return in each crisis."""
    mk = f"{market}_return_%"
    df = pd.DataFrame({"crisis": list(replay["crisis"]) * 2,
                       "who": ["Your mix"] * len(replay) + [market] * len(replay),
                       "ret": list(replay["portfolio_return_%"]) + list(replay[mk])})
    order = list(replay["crisis"])
    ch = alt.Chart(df).mark_bar(height={"band": 0.8}).encode(
        y=alt.Y("crisis:N", sort=order, title=None,
                axis=alt.Axis(labelFont=SANS, labelColor=INK, labelLimit=260)),
        yOffset=alt.YOffset("who:N", sort=["Your mix", market]),
        x=alt.X("ret:Q", title="Return, crisis start to market trough (%)", axis=alt.Axis(format=".0f")),
        color=alt.Color("who:N", scale=alt.Scale(domain=["Your mix", market], range=[BLUE, GREY])),
        tooltip=[alt.Tooltip("crisis:N"), alt.Tooltip("who:N"), alt.Tooltip("ret:Q", format="+.1f")])
    return style(ch, 44 * len(order) + 50)

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

SANS = "IBM Plex Mono, SFMono-Regular, Menlo, Consolas, monospace"  # one typeface throughout
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
    size = 11 if len(col_order) <= 9 else 9
    text = base.mark_text(fontSize=size, color=INK).encode(text=alt.Text(f"{value}:Q", format="+.0f"))
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


def fan_chart(paths: pd.DataFrame, goal: float | None = None) -> alt.TopLevelMixin:
    """Projection fan: 10-90% and 25-75% bands, median line, amount contributed."""
    p = paths.copy()
    base = alt.Chart(p).encode(x=alt.X("year:Q", title="Years from now",
                                       axis=alt.Axis(format=".0f", tickMinStep=1)))
    outer = base.mark_area(color=BLUE, opacity=0.12).encode(
        y=alt.Y("p10:Q", title="Portfolio value ($)", axis=alt.Axis(format="$,.0f")), y2="p90:Q")
    inner = base.mark_area(color=BLUE, opacity=0.25).encode(y="p25:Q", y2="p75:Q")
    median = base.mark_line(color=BLUE, strokeWidth=2).encode(y="p50:Q")
    contrib = base.mark_line(color=INK, strokeDash=[4, 3], strokeWidth=1.2).encode(y="contributed:Q")
    nearest = alt.selection_point(nearest=True, on="pointerover", fields=["year"], empty=False)
    rule = base.mark_rule(color=GREY).encode(
        opacity=alt.condition(nearest, alt.value(0.8), alt.value(0)),
        tooltip=[alt.Tooltip("year:Q", title="Year", format=".1f"),
                 alt.Tooltip("p95:Q", title="Good (95th)", format="$,.0f"),
                 alt.Tooltip("p75:Q", title="75th", format="$,.0f"),
                 alt.Tooltip("p50:Q", title="Median", format="$,.0f"),
                 alt.Tooltip("p25:Q", title="25th", format="$,.0f"),
                 alt.Tooltip("p5:Q", title="Bad (5th)", format="$,.0f"),
                 alt.Tooltip("contributed:Q", title="Contributed", format="$,.0f")]).add_params(nearest)
    layers = [outer, inner, contrib, median, rule]
    if goal:
        layers.append(alt.Chart(pd.DataFrame({"g": [goal]})).mark_rule(color=RED, strokeDash=[2, 2])
                      .encode(y="g:Q"))
    return style(alt.layer(*layers), 360)


def hedge_scatter(table: pd.DataFrame) -> alt.TopLevelMixin:
    """Protection (worst-drop improvement) vs cost (growth given up) per candidate."""
    verdicts = ["Hedge", "Diversifier", "No help"]
    base = alt.Chart(table).encode(
        x=alt.X("cagr_change_pts:Q", title="Change in growth per year (pts)  ← costs return",
                axis=alt.Axis(format="+.2f", tickCount=6), scale=alt.Scale(padding=24)),
        y=alt.Y("maxdd_change_pts:Q", title="Smaller worst drop (pts)  ↑ more protection",
                axis=alt.Axis(format="+.1f", tickCount=6), scale=alt.Scale(padding=16)),
        color=alt.Color("verdict:N", scale=alt.Scale(domain=verdicts, range=[BLUE, "#eda100", GREY]),
                        legend=alt.Legend(title=None)),
        tooltip=[alt.Tooltip("ticker:N"), alt.Tooltip("what:N", title="What"),
                 alt.Tooltip("verdict:N"), alt.Tooltip("maxdd_change_pts:Q", title="Worst drop Δ pts", format="+.1f"),
                 alt.Tooltip("cagr_change_pts:Q", title="Growth Δ pts/yr", format="+.2f"),
                 alt.Tooltip("tail_ret_%:Q", title="Return in your worst weeks %", format="+.2f")])
    pts = base.mark_point(filled=True, size=90, opacity=1, stroke="white")
    labels = base.mark_text(align="left", dx=8, fontSize=10, color=INK).encode(text="ticker:N",
                                                                                color=alt.value(INK))
    zero_x = alt.Chart(pd.DataFrame({"z": [0]})).mark_rule(color=AXIS).encode(x="z:Q")
    zero_y = alt.Chart(pd.DataFrame({"z": [0]})).mark_rule(color=AXIS).encode(y="z:Q")
    return style(alt.layer(zero_x, zero_y, pts, labels), 340)


def scenario_paths(samples: pd.DataFrame, paths: pd.DataFrame) -> alt.TopLevelMixin:
    """Individual simulated futures (thin lines) with median, 10th/90th and contributed."""
    long = samples.melt("year", var_name="scenario", value_name="value")
    x = alt.X("year:Q", title="Years from now", axis=alt.Axis(format=".0f", tickMinStep=1))
    top = float(paths["p95"].max()) * 1.05  # rare extreme futures run off the top
    lines = alt.Chart(long).mark_line(strokeWidth=0.7, opacity=0.18, color=BLUE, clip=True).encode(
        x=x, y=alt.Y("value:Q", title="Portfolio value ($)", axis=alt.Axis(format="$,.0f"),
                     scale=alt.Scale(domain=[0, top])),
        detail="scenario:N")
    p = paths.melt("year", value_vars=["p10", "p50", "p90", "contributed"], var_name="line",
                   value_name="value").replace({"line": {"p10": "Bad case (10th)", "p50": "Median",
                                                          "p90": "Good case (90th)",
                                                          "contributed": "Contributed"}})
    order = ["Good case (90th)", "Median", "Bad case (10th)", "Contributed"]
    summary = alt.Chart(p).mark_line(strokeWidth=2, clip=True).encode(
        x=x, y="value:Q",
        color=alt.Color("line:N", sort=order, scale=alt.Scale(domain=order,
                        range=["#1baf7a", INK, RED, GREY]), legend=alt.Legend(title=None)),
        strokeDash=alt.StrokeDash("line:N", sort=order, legend=None,
                                  scale=alt.Scale(domain=order, range=[[1, 0], [1, 0], [1, 0], [4, 3]])),
        tooltip=[alt.Tooltip("line:N", title="Line"), alt.Tooltip("year:Q", format=".1f"),
                 alt.Tooltip("value:Q", format="$,.0f")])
    return style(alt.layer(lines, summary), 380)


def median_compare(results: dict[str, dict], names: list[str]) -> alt.TopLevelMixin:
    """Median (solid) and bad case (dashed) for several portfolios on one chart."""
    rows = []
    for n in names:
        p = results[n]["paths"]
        rows.append(pd.DataFrame({"year": p["year"], "portfolio": n, "case": "Median", "value": p["p50"]}))
        rows.append(pd.DataFrame({"year": p["year"], "portfolio": n, "case": "Bad case (10th)",
                                  "value": p["p10"]}))
    df = pd.concat(rows)
    df = df[np.isclose((df["year"] * 12) % 3, 0)]  # quarterly points
    contrib = results[names[0]]["paths"][["year", "contributed"]]
    ch = alt.Chart(df).mark_line(strokeWidth=1.8).encode(
        x=alt.X("year:Q", title="Years from now", axis=alt.Axis(format=".0f", tickMinStep=1)),
        y=alt.Y("value:Q", title="Portfolio value ($)", axis=alt.Axis(format="$,.0f")),
        color=alt.Color("portfolio:N", scale=_palette(names), legend=alt.Legend(title=None)),
        strokeDash=alt.StrokeDash("case:N", scale=alt.Scale(domain=["Median", "Bad case (10th)"],
                                                            range=[[1, 0], [5, 3]]), legend=None),
        tooltip=[alt.Tooltip("portfolio:N"), alt.Tooltip("case:N"),
                 alt.Tooltip("year:Q", format=".1f"), alt.Tooltip("value:Q", format="$,.0f")])
    c = alt.Chart(contrib).mark_line(color=GREY, strokeDash=[2, 2], strokeWidth=1).encode(
        x="year:Q", y="contributed:Q")
    return style(alt.layer(c, ch), 360)


def return_distribution(ann: dict[str, np.ndarray], names: list[str]) -> alt.TopLevelMixin:
    """Spread of annualised returns across all simulated scenarios, per portfolio."""
    df = pd.concat([pd.DataFrame({"portfolio": n, "ret": 100 * np.asarray(ann[n])}) for n in names])
    means = df.groupby("portfolio", as_index=False)["ret"].mean()
    dens = alt.Chart(df).transform_density("ret", groupby=["portfolio"], as_=["ret", "density"],
                                           steps=160).mark_line(strokeWidth=1.8).encode(
        x=alt.X("ret:Q", title="Return per year over the whole period (%)", axis=alt.Axis(format=".0f")),
        y=alt.Y("density:Q", title="Share of scenarios", axis=alt.Axis(labels=False, ticks=False)),
        color=alt.Color("portfolio:N", scale=_palette(names),
                        legend=alt.Legend(title=None, columns=min(len(names), 2))))
    mean_rules = alt.Chart(means).mark_rule(strokeDash=[3, 3], strokeWidth=1.2).encode(
        x="ret:Q", color=alt.Color("portfolio:N", scale=_palette(names), legend=None),
        tooltip=[alt.Tooltip("portfolio:N"), alt.Tooltip("ret:Q", title="Average %/yr", format=".1f")])
    zero = alt.Chart(pd.DataFrame({"z": [0]})).mark_rule(color=AXIS).encode(x="z:Q")
    return style(alt.layer(zero, dens, mean_rules), 300)


def hedge_tradeoff(front: pd.DataFrame, w_mv: float, w_cvar: float) -> tuple:
    """Two charts for weights 0-50%: protection gained (left) and cost (right), vs 0%."""
    base0 = front.iloc[0]
    df = pd.DataFrame({
        "weight": front["weight_%"],
        "Smaller worst drop": front["maxdd_%"] - base0["maxdd_%"],
        "Smaller average worst week": front["cvar_wk_%"] - base0["cvar_wk_%"],
        "Growth per year": front["cagr_%"] - base0["cagr_%"],
        "Volatility": front["vol_%"] - base0["vol_%"],
    })
    marks = pd.DataFrame({"weight": [w_mv, w_cvar], "label": ["min-variance", "min-CVaR"],
                          "ypx": [4, 18]})  # stacked so the labels never overlap

    def panel(cols: list[str], colors: list[str], title: str):
        long = df.melt("weight", value_vars=cols, var_name="measure", value_name="pts")
        lines = alt.Chart(long).mark_line(strokeWidth=2).encode(
            x=alt.X("weight:Q", title="Hedge weight (%)", axis=alt.Axis(format=".0f")),
            y=alt.Y("pts:Q", title=title, axis=alt.Axis(format="+.1f")),
            color=alt.Color("measure:N", scale=alt.Scale(domain=cols, range=colors),
                            legend=alt.Legend(title=None, columns=1)),
            tooltip=[alt.Tooltip("weight:Q", title="Weight %", format=".0f"),
                     alt.Tooltip("measure:N"), alt.Tooltip("pts:Q", format="+.2f")])
        rules = alt.Chart(marks).mark_rule(color=GREY, strokeDash=[3, 3]).encode(
            x="weight:Q", tooltip=[alt.Tooltip("label:N"), alt.Tooltip("weight:Q", format=".0f")])
        labels = alt.Chart(marks).mark_text(align="right", dx=-4, fontSize=10, color=MUTED,
                                            baseline="top").encode(
            x="weight:Q", y=alt.Y("ypx:Q", scale=None), text="label:N")
        zero = alt.Chart(pd.DataFrame({"z": [0]})).mark_rule(color=AXIS).encode(y="z:Q")
        return style(alt.layer(zero, lines, rules, labels), 280)

    return (panel(["Smaller worst drop", "Smaller average worst week"], [BLUE, "#1baf7a"],
                  "Protection gained (pts)"),
            panel(["Growth per year", "Volatility"], [RED, GREY], "Change (pts)"))


def rolling_weight(roll: pd.Series) -> alt.TopLevelMixin:
    df = pd.DataFrame({"date": roll.index, "w": 100 * roll.to_numpy()})
    line = alt.Chart(df).mark_line(color=BLUE, strokeWidth=1.8).encode(
        x=alt.X("date:T", title=None, axis=alt.Axis(format="%Y")),
        y=alt.Y("w:Q", title="Min-variance weight, uncapped (%)", axis=alt.Axis(format=".0f")),
        tooltip=[alt.Tooltip("date:T", format="%b %Y"), alt.Tooltip("w:Q", title="Weight %", format=".0f")])
    mean = alt.Chart(pd.DataFrame({"m": [df["w"].mean()]})).mark_rule(color=GREY, strokeDash=[4, 3]).encode(y="m:Q")
    return style(alt.layer(mean, line), 240)

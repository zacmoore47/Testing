"""
projections.py - what regular investing in a portfolio could grow to (a range, not a promise).

Method: circular block bootstrap of the portfolio's real monthly returns since about 2000. Each
simulated future is stitched together from randomly chosen 12-month stretches of actual
history, so realistic sequences (crashes, recoveries, slow years) are kept together. Many
thousands of such futures give a range of outcomes.

What this can and cannot tell you:
    - It shows how much the outcome can vary, given the ups and downs seen since 2000.
    - It cannot know whether the next 20 years will be better or worse than the last 26.
      That period was strong for US stocks and for bonds (falling interest rates), so an
      optional "return adjustment" lets you make the projection more pessimistic.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass

import numpy as np
import pandas as pd

import history as hs
import panic_detector as pdx

log = logging.getLogger("panic_detector")

PERCENTILES = (5, 10, 25, 50, 75, 90, 95)
N_SAMPLES = 100  # individual scenarios kept for drawing


@dataclass
class Plan:
    initial: float = 10_000.0          # dollars invested today
    monthly: float = 500.0             # dollars added at the end of every month
    years: int = 20
    fee_pct: float = 0.05              # annual fund fees, % (e.g. 0.05 = 0.05%)
    adjust_pct: float = 0.0            # subtract this many % per year from returns (pessimism)
    inflation_pct: float = 2.5         # used only when real=True
    real: bool = True                  # show results in today's dollars
    goal: float | None = None          # optional target amount
    sims: int = 5000
    block: int = 12                    # months per bootstrap block
    seed: int = 7


def simulate(monthly_rets: pd.Series, plan: Plan) -> dict:
    """Run the block bootstrap. Returns percentile paths and summary statistics."""
    r = monthly_rets.to_numpy(dtype=float)
    n, months = len(r), plan.years * 12
    if n < plan.block * 3:
        raise ValueError(f"only {n} months of history; need at least {plan.block * 3}")
    rng = np.random.default_rng(plan.seed)
    n_blocks = -(-months // plan.block)
    # Circular block bootstrap: blocks may wrap from the end of history to the start, so
    # every month is equally likely to be drawn (no bias against the first/last months).
    starts = rng.integers(0, n, size=(plan.sims, n_blocks))
    idx = ((starts[:, :, None] + np.arange(plan.block)[None, None, :]) % n).reshape(plan.sims, -1)
    sim = r[idx[:, :months]]

    # Costs and optional pessimism, applied every month.
    sim = (1 + sim) * (1 - plan.fee_pct / 100) ** (1 / 12) - 1 - plan.adjust_pct / 100 / 12
    deflator = (1 + plan.inflation_pct / 100) ** (np.arange(1, months + 1) / 12) if plan.real \
        else np.ones(months)

    wealth = np.empty((plan.sims, months))
    w = np.full(plan.sims, float(plan.initial))
    for t in range(months):
        w = w * (1 + sim[:, t]) + plan.monthly
        wealth[:, t] = w
    wealth = wealth / deflator
    contributed = (plan.initial + plan.monthly * np.arange(1, months + 1))
    contributed_real = contributed / deflator

    index = np.cumprod(1 + sim, axis=1)  # growth of $1, ignoring contributions
    mdd = hs.max_drawdown(np.concatenate([np.ones((plan.sims, 1)), index], axis=1))

    pct = np.percentile(wealth, PERCENTILES, axis=0)
    paths = pd.DataFrame({f"p{p}": pct[i] for i, p in enumerate(PERCENTILES)})
    paths.insert(0, "year", np.arange(1, months + 1) / 12)
    paths["contributed"] = contributed_real
    final = wealth[:, -1]
    ann = (index[:, -1]) ** (12 / months) - 1  # annualised return of each path
    summary = {
        "final": {p: float(np.percentile(final, p)) for p in PERCENTILES},
        "contributed": float(contributed_real[-1]),
        "contributed_nominal": float(contributed[-1]),
        "p_below_contributed": float((final < contributed_real[-1]).mean()),
        "p_goal": float((final >= plan.goal).mean()) if plan.goal else None,
        "ann_return": {p: float(np.percentile(ann, p)) for p in PERCENTILES},
        "max_drawdown_median": float(np.median(mdd)),
        "max_drawdown_p10": float(np.percentile(mdd, 10)),
        "history_months": n, "history_start": monthly_rets.index[0], "history_end": monthly_rets.index[-1],
        "hist_ann_return": float((1 + r).prod() ** (12 / n) - 1),
        "ann_return_mean": float(ann.mean()),
        "final_mean": float(final.mean()),
    }
    # A random sample of individual scenarios to draw (quarterly points keep charts light).
    pick = np.random.default_rng(plan.seed + 1).choice(plan.sims, size=min(N_SAMPLES, plan.sims),
                                                       replace=False)
    q = np.arange(2, months, 3)
    samples = pd.DataFrame(wealth[np.ix_(pick, q)].T, columns=[f"s{i}" for i in range(len(pick))])
    samples.insert(0, "year", (q + 1) / 12)
    return {"paths": paths, "summary": summary, "plan": plan, "samples": samples,
            "ann": ann, "final": final}


def milestones(paths: pd.DataFrame, years: tuple[int, ...] = (5, 10, 15, 20, 30, 40)) -> pd.DataFrame:
    rows = []
    for y in years:
        row = paths[np.isclose(paths["year"], y)]
        if not row.empty:
            rows.append(row.iloc[0])
    return pd.DataFrame(rows).reset_index(drop=True)


def project(weights: pd.Series, plan: Plan, cfg: pdx.Config, synthetic: bool = False) -> dict:
    """Projection for one portfolio (weights by ticker)."""
    prices, notes = hs.long_prices(list(weights.index), cfg, "prices_cache_projection.csv",
                                   synthetic)
    values, used = hs.portfolio_values(prices, weights, cfg)
    rets = hs.monthly_returns(values)
    out = simulate(rets, plan)
    out.update({"proxy_lines": notes, "weights": used, "synthetic": synthetic})
    log.info("Projection: %d sims x %d years from %d months of history (%s to %s); median "
             "final %.0f, 10th pct %.0f", plan.sims, plan.years, len(rets),
             rets.index[0].date(), rets.index[-1].date(), out["summary"]["final"][50],
             out["summary"]["final"][10])
    return out


def project_many(portfolios: dict[str, pd.Series], plan: Plan, cfg: pdx.Config,
                 synthetic: bool = False) -> dict:
    """Same plan for several portfolios, through the SAME simulated scenarios.

    Monthly returns are aligned on the months every portfolio has, and every portfolio uses
    the same random draw of historical 12-month stretches, so differences between results
    come from the mixes themselves, not from luck in the draw.
    """
    tickers = sorted({t for w in portfolios.values() for t in w.index})
    prices, notes = hs.long_prices(tickers, cfg, "prices_cache_projection.csv", synthetic)
    rets, used = {}, {}
    for name, w in portfolios.items():
        values, used[name] = hs.portfolio_values(prices, w, cfg)
        rets[name] = hs.monthly_returns(values)
    aligned = pd.DataFrame(rets).dropna()
    if len(aligned) < plan.block * 3:
        raise ValueError("the portfolios share too little common history to compare")
    results = {name: simulate(aligned[name], plan) for name in portfolios}
    for name, res in results.items():
        res["weights"] = used[name]
    log.info("Projection of %d portfolios through the same %d scenarios (%s to %s)",
             len(portfolios), plan.sims, aligned.index[0].date(), aligned.index[-1].date())
    return {"results": results, "plan": plan, "proxy_lines": notes, "synthetic": synthetic,
            "start": aligned.index[0], "end": aligned.index[-1], "months": len(aligned)}


def comparison_table(many: dict) -> pd.DataFrame:
    rows = []
    for name, res in many["results"].items():
        s = res["summary"]
        rows.append({"portfolio": name, "mean_ret": 100 * s["ann_return_mean"],
                     "median_ret": 100 * s["ann_return"][50], "bad_ret": 100 * s["ann_return"][10],
                     "good_ret": 100 * s["ann_return"][90], "final_mean": s["final_mean"],
                     "final_median": s["final"][50], "final_bad": s["final"][10],
                     "final_good": s["final"][90], "p_below": 100 * s["p_below_contributed"],
                     "p_goal": None if s["p_goal"] is None else 100 * s["p_goal"],
                     "mdd_median": 100 * s["max_drawdown_median"],
                     "contributed": s["contributed"]})
    return pd.DataFrame(rows)

"""Fetch everything, compute all Layer 1 estimators from 2000 to today, write outputs.

Usage: python scripts/backfill.py [--offline]
  --offline  use only cached data in data/raw (no network)
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import pandas as pd  # noqa: E402

from aggregate_a.config import load_config  # noqa: E402
from aggregate_a.estimators.registry import A_UNIT, ESTIMATORS  # noqa: E402
from aggregate_a.log import HEALTH, setup_logging  # noqa: E402
from aggregate_a.pipeline import build_inputs, compute_estimators, fetch_all  # noqa: E402
from aggregate_a.report.charts import layer1_chart  # noqa: E402
from aggregate_a.validate.disagreement import disagreement_flags  # noqa: E402
from aggregate_a.validate.sanity import range_summary  # noqa: E402

INPUT_COLS = ["close", "vix", "vix_source", "var_q", "var_p_har", "var_p_garch", "rf_bey", "t10",
              "expinf", "cape", "cape_staleness_days", "erp_cape", "erp_dam", "dam_staleness_days",
              "erp_martin", "hy_oas", "baa10y"]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--offline", action="store_true")
    args = ap.parse_args()
    setup_logging()
    cfg = load_config()
    out_dir = cfg.path("outputs")

    raw = fetch_all(cfg, offline=args.offline)
    x = build_inputs(raw, cfg)
    est = compute_estimators(x, cfg)
    dc = cfg["disagreement"]
    dis = disagreement_flags(est, A_UNIT, dc["change_window_days"], dc["min_abs_log_change"],
                             dc["dispersion_quantile"])
    start = pd.Timestamp(cfg["sample"]["output_start"])
    table = x[[c for c in INPUT_COLS if c in x]].join(est).join(dis).loc[start:]
    table.index.name = "date"
    out_dir.mkdir(parents=True, exist_ok=True)
    table.to_csv(out_dir / "layer1_daily.csv", float_format="%.6g")

    sc = cfg["sanity"]
    rs = range_summary(table, A_UNIT, sc["a_min"], sc["a_max"])
    summary = table[list(ESTIMATORS)].describe(percentiles=[0.05, 0.5, 0.95]).T
    summary["first"] = [table[c].first_valid_index() for c in summary.index]
    latest = table[list(ESTIMATORS)].ffill().iloc[-1]
    summary["latest"] = latest
    summary = summary.join(rs)
    summary.to_csv(out_dir / "layer1_summary.csv", float_format="%.4g")
    layer1_chart(table, cfg["crises"]["fear"], out_dir / "layer1_estimators.png",
                 f"aggregate-A Layer 1 estimators, {table.index[0].date()} to "
                 f"{table.index[-1].date()}")
    HEALTH.write(out_dir / "run_log.jsonl")

    with pd.option_context("display.width", 200, "display.max_columns", 20):
        print(summary[["count", "mean", "5%", "50%", "95%", "latest", "share_below",
                       "share_above"]].round(3))
    print(json.dumps({"failed_sources": HEALTH.failed(),
                      "last_date": str(table.index[-1].date())}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

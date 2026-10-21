"""Layer 1 pipeline: fetch → align → estimate. Missing sources produce NaN columns, never filler."""

from __future__ import annotations

from functools import partial

import numpy as np
import pandas as pd

from .cache import cached_fetch
from .config import Config
from .data import cboe, damodaran, fred, shiller, yahoo
from .erp.cape import daily_cape, erp_cape
from .erp.damodaran import erp_damodaran_bill, erp_damodaran_daily
from .erp.martin import erp_martin
from .erp.rates import tbill_discount_to_bey
from .estimators.credit import credit_z
from .estimators.merton import merton_a
from .estimators.registry import ESTIMATORS
from .estimators.vrp import expanding_z, vrp_esscher
from .log import logger
from .vol.garch import garch_forecast
from .vol.har import har_forecast
from .vol.rv import daily_variance

# Daily FRED series may miss a few days relative to NYSE (holidays differ); never bridge > 5 days.
DAILY_FFILL_LIMIT = 5
# Monthly series (expected inflation) are carried until the next print; bridge at most ~2 months.
MONTHLY_FFILL_DAYS = 70


def fetch_all(cfg: Config, offline: bool = False) -> dict[str, pd.DataFrame | None]:
    cache_dir = cfg.path("raw_cache")
    age = cfg["fetch"]["max_cache_age_hours"]
    timeout, retries = cfg["fetch"]["timeout_seconds"], cfg["fetch"]["retries"]
    start = cfg["sample"]["history_start"]
    key = cfg.secret("FRED_API_KEY")
    raw: dict[str, pd.DataFrame | None] = {}
    for name, sid in cfg["fred_series"].items():
        raw[name] = cached_fetch(f"fred_{sid}", partial(fred.fetch_series, sid, start, key,
                                                        timeout, retries), cache_dir, age, offline)
    raw["gspc"] = cached_fetch("yahoo_GSPC", lambda: yahoo.fetch_gspc(start), cache_dir, age,
                               offline)
    raw["vix_cboe"] = cached_fetch("cboe_VIX", lambda: cboe.fetch_vix(timeout, retries),
                                   cache_dir, age, offline)
    raw["shiller"] = cached_fetch("shiller_ie_data",
                                  lambda: shiller.fetch_ie_data(timeout, retries),
                                  cache_dir, age, offline)
    raw["damodaran"] = cached_fetch("damodaran_histimpl",
                                    lambda: damodaran.fetch_histimpl(timeout, retries),
                                    cache_dir, age, offline)
    return raw


def _col(raw: dict[str, pd.DataFrame | None], name: str) -> pd.Series | None:
    df = raw.get(name)
    return None if df is None else df.iloc[:, 0]


def _align(s: pd.Series | None, idx: pd.DatetimeIndex, limit_days: int) -> pd.Series:
    """As-of align to trading days, refusing to carry a value more than `limit_days` old."""
    if s is None:
        return pd.Series(np.nan, index=idx)
    s = s.dropna().sort_index()
    left = pd.DataFrame({"date": idx})
    right = pd.DataFrame({"obs_date": s.index, "v": s.to_numpy()})
    m = pd.merge_asof(left, right, left_on="date", right_on="obs_date", direction="backward")
    stale = (m["date"] - m["obs_date"]).dt.days > limit_days
    return pd.Series(m["v"].where(~stale).to_numpy(), index=idx)


def build_inputs(raw: dict[str, pd.DataFrame | None], cfg: Config) -> pd.DataFrame:
    gspc = raw.get("gspc")
    if gspc is None or gspc.empty:
        raise RuntimeError("S&P 500 price history unavailable (no fetch, no cache): cannot run")
    vc = cfg["vol"]
    h, ppy = vc["horizon_days"], vc["trading_days_per_year"]
    idx = pd.DatetimeIndex(gspc.index)
    x = pd.DataFrame(index=idx)
    x["close"] = gspc["close"]
    x["rv_daily"] = daily_variance(gspc, vc["rv_measure"])

    logger.info("fitting HAR-RV (expanding window)")
    x["har_daily"] = har_forecast(x["rv_daily"], h, vc["min_train_days"], vc["refit_every_days"])
    logger.info("fitting GJR-GARCH (expanding window, refit every %d days)",
                vc["refit_every_days"])
    x["garch_daily"] = garch_forecast(x["close"], h, vc["min_train_days"],
                                      vc["refit_every_days"]).reindex(idx)
    x["var_p_har"] = x["har_daily"] * ppy
    x["var_p_garch"] = x["garch_daily"] * ppy

    vix = _align(_col(raw, "vix"), idx, DAILY_FFILL_LIMIT)
    vix_backup = _align(_col(raw, "vix_cboe"), idx, DAILY_FFILL_LIMIT)
    x["vix_source"] = np.where(vix.notna(), "FRED", np.where(vix_backup.notna(), "CBOE", None))
    x["vix"] = vix.fillna(vix_backup)
    x["var_q"] = (x["vix"] / 100.0) ** 2  # CBOE VIX white paper: VIX = 100·sqrt(annualized σ²_Q)

    x["rf_bey"] = tbill_discount_to_bey(_align(_col(raw, "rf_3m"), idx, DAILY_FFILL_LIMIT))
    x["t10"] = _align(_col(raw, "t10"), idx, DAILY_FFILL_LIMIT)
    x["expinf"] = _align(_col(raw, "expinf_1y"), idx, MONTHLY_FFILL_DAYS) / 100.0
    x["hy_oas"] = _align(_col(raw, "hy_oas"), idx, DAILY_FFILL_LIMIT)
    x["baa10y"] = _align(_col(raw, "baa10y"), idx, DAILY_FFILL_LIMIT)

    sh = raw.get("shiller")
    if sh is not None:
        c = daily_cape(sh, x["close"], cfg["shiller"]["availability_lag_months"])
        x = x.join(c)
    else:
        x["cape"], x["cape_staleness_days"] = np.nan, np.nan
    x["erp_cape"] = erp_cape(x["cape"], x["rf_bey"], x["expinf"])

    dam = raw.get("damodaran")
    if dam is not None:
        x = x.join(erp_damodaran_daily(dam, idx, cfg["damodaran"]["availability_lag_days"]))
    else:
        x["erp_dam_t10"], x["dam_staleness_days"] = np.nan, np.nan
    x["erp_dam"] = erp_damodaran_bill(x["erp_dam_t10"], x["t10"], x["rf_bey"])
    x["erp_martin"] = erp_martin(x["var_q"], x["rf_bey"], h, ppy)
    return x


def compute_estimators(x: pd.DataFrame, cfg: Config) -> pd.DataFrame:
    ec = cfg["estimators"]
    h = cfg["vol"]["horizon_days"]
    e = pd.DataFrame(index=x.index)
    e["merton_cape_vix"] = merton_a(x["erp_cape"], x["var_q"])
    e["merton_cape_har"] = merton_a(x["erp_cape"], x["var_p_har"])
    e["merton_cape_garch"] = merton_a(x["erp_cape"], x["var_p_garch"])
    e["merton_dam_vix"] = merton_a(x["erp_dam"], x["var_q"])
    e["merton_dam_har"] = merton_a(x["erp_dam"], x["var_p_har"])
    e["vr_martin_har"] = merton_a(x["erp_martin"], x["var_p_har"])
    e["vr_martin_garch"] = merton_a(x["erp_martin"], x["var_p_garch"])
    logger.info("solving Esscher-tilt VRP estimator")
    e["vrp_esscher"] = vrp_esscher(x["close"], x["var_q"], x["har_daily"], h,
                                   ec["moments_window_days"], ec["esscher_max_A"])
    e["vrp_raw"] = x["var_q"] - x["var_p_har"]
    e["vrp_z"] = expanding_z(e["vrp_raw"], ec["credit_min_history_days"])
    e["credit_hy_z"] = credit_z(x["hy_oas"], ec["credit_min_history_days"])
    e["credit_baa_z"] = credit_z(x["baa10y"], ec["credit_min_history_days"])
    assert list(e.columns) == list(ESTIMATORS), "registry and pipeline out of sync"
    return e

"""
history.py - long price histories for any set of tickers (shared by projections and hedges).

Downloads (or reuses saved) daily prices, extends ETFs back before their launch with
look-alike funds (see PROXIES in panic_detector.py), and builds a portfolio value series.
"""
from __future__ import annotations

import logging

import numpy as np
import pandas as pd

import compare
import panic_detector as pdx

log = logging.getLogger("panic_detector")


def long_prices(tickers: list[str], cfg: pdx.Config, cache_name: str,
                synthetic: bool = False) -> tuple[pd.DataFrame, list[str]]:
    """Daily prices for ``tickers`` + the market ticker, history extended with proxies.

    Returns:
        (prices, human-readable proxy notes)
    """
    tickers = list(dict.fromkeys(tickers))
    if synthetic:
        syn = pdx.Config(universe={"All": tickers}, start=cfg.start, end=cfg.end,
                         seed=cfg.seed, market_ticker=cfg.market_ticker)
        prices, _ = pdx.generate_synthetic_prices(syn)
        return prices, []
    extra = pdx.proxy_tickers(tickers) if cfg.use_proxies else []
    raw = pdx.download_prices(cfg, tickers=tickers + extra, cache_name=cache_name)
    if not cfg.use_proxies:
        return raw, []
    spliced, notes = pdx.splice_proxies(raw, tickers)
    spliced[cfg.market_ticker] = raw[cfg.market_ticker]
    return spliced, pdx.describe_proxies(notes)


def portfolio_values(prices: pd.DataFrame, weights: pd.Series,
                     cfg: pdx.Config) -> tuple[pd.Series, pd.Series]:
    """Daily value of $1 in the portfolio (rebalanced daily) over its common history.

    Returns:
        (value series, the weights actually used after dropping tickers without data)
    """
    px, w = pdx.prepare_portfolio_prices(prices, weights, cfg, min_holdings=1)
    return compare.value_series(px, w), w


def monthly_returns(values: pd.Series) -> pd.Series:
    """Month-end to month-end simple returns (incomplete current month dropped)."""
    m = values.resample("ME").last()
    r = m.pct_change().dropna()
    last_day = values.index[-1]
    if last_day < (last_day + pd.offsets.MonthEnd(0)) - pd.Timedelta(days=3):
        r = r.iloc[:-1]  # the current month is not finished yet
    return r


def max_drawdown(index_paths: np.ndarray) -> np.ndarray:
    """Max drawdown of each row of a matrix of index levels (negative fractions)."""
    peak = np.maximum.accumulate(index_paths, axis=1)
    return (index_paths / peak - 1).min(axis=1)

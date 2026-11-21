#!/usr/bin/env python3
"""
panic_detector.py - a "market panic detector" built on rolling stock correlation networks.

In calm markets stocks move semi-independently (weak correlations, clustered by sector);
in a crash correlations spike and the market behaves like a single asset. This script
quantifies that with two rolling time series:

    1. Average pairwise correlation (mean of the off-diagonal correlation entries).
    2. Top eigenvalue lambda1 of the correlation matrix (the "market mode"), also reported
       as a share of total variance, lambda1 / N, and compared with the Marchenko-Pastur
       noise bound (1 + sqrt(N/T))^2.

It also draws the correlation network (threshold graph or minimum spanning tree) as static
snapshots and as an animated GIF, plus a 3-panel tracking chart with a look-ahead-free
panic flag.

Install:
    pip install yfinance pandas numpy networkx matplotlib

Usage:
    python panic_detector.py                      # real data (falls back to synthetic on failure)
    python panic_detector.py --synthetic          # synthetic one-factor data + self-test
    python panic_detector.py --self-test          # run the self-test only
    python panic_detector.py --mst --window 120   # MST network, 120-day window
    python panic_detector.py --start 2019-01-01   # shorter history (panic flag misses Mar 2020)
    python panic_detector.py --z-mode expanding   # original all-history panic baseline
    python panic_detector.py --universe etfs      # 9 sector ETFs since 1999 (survivorship-free)
    python panic_detector.py --portfolio example_portfolio.csv   # portfolio stress test
    python panic_detector.py --compare portfolios/candidates     # compare candidate portfolios
    python panic_detector.py --report portfolios/my/my_portfolio.csv --open   # daily report
    streamlit run app.py                                         # the Portfolio Lab web app
    python panic_detector.py --help

Outputs (./outputs/ for stocks, ./outputs/etfs/ for --universe etfs):
    metrics.csv, tracking.png, snapshots.png, network.gif,
    forward_analysis.csv, forward_analysis.png (what happened to SPY after each window)
"""
from __future__ import annotations

import argparse
import json
import logging
import math
import sys
import textwrap
import time
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path

import matplotlib

matplotlib.use("Agg")  # headless backend: we only save files
matplotlib.rcParams.update({
    "font.family": "monospace",
    "font.monospace": ["IBM Plex Mono", "Menlo", "SF Mono", "Consolas", "DejaVu Sans Mono"],
    "axes.titleweight": "regular",
})

import matplotlib.dates as mdates  # noqa: E402
import matplotlib.pyplot as plt  # noqa: E402
import networkx as nx  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
from matplotlib.animation import FuncAnimation, PillowWriter  # noqa: E402
from matplotlib.lines import Line2D  # noqa: E402

log = logging.getLogger("panic_detector")

# ----------------------------------------------------------------------------------------
# Configuration
# ----------------------------------------------------------------------------------------

# NOTE ON SURVIVORSHIP BIAS: this universe is *today's* large caps, chosen with hindsight.
# Companies that shrank, were acquired or went bankrupt since 2019 are absent, and today's
# winners are over-represented. Correlation levels are probably only mildly affected, but
# treat any return-based conclusion drawn from this universe with suspicion.
UNIVERSE: dict[str, list[str]] = {
    "Information Technology": ["AAPL", "MSFT", "NVDA", "ORCL"],
    "Communication Services": ["GOOGL", "META", "VZ", "DIS"],
    "Consumer Discretionary": ["AMZN", "HD", "MCD", "NKE"],
    "Consumer Staples": ["PG", "KO", "PEP", "WMT"],
    "Energy": ["XOM", "CVX", "COP"],
    "Financials": ["JPM", "BAC", "GS", "BRK-B"],
    "Health Care": ["JNJ", "UNH", "PFE", "MRK"],
    "Industrials": ["CAT", "HON", "UNP", "LMT"],
    "Materials": ["LIN", "SHW", "APD", "NEM"],
    "Real Estate": ["PLD", "AMT", "SPG"],
    "Utilities": ["NEE", "DUK", "SO"],
}

# Survivorship-free alternative: the 9 original Select Sector SPDR ETFs, trading since
# Dec 1998. XLRE (2015) and XLC (2018) are excluded to keep the full history. Caveat: GICS
# reclassifications (e.g. 2018: GOOGL/META moved from XLK/XLY into XLC) change what an ETF
# holds over time.
ETF_UNIVERSE: dict[str, list[str]] = {
    "Information Technology": ["XLK"],
    "Financials": ["XLF"],
    "Energy": ["XLE"],
    "Health Care": ["XLV"],
    "Industrials": ["XLI"],
    "Consumer Staples": ["XLP"],
    "Consumer Discretionary": ["XLY"],
    "Utilities": ["XLU"],
    "Materials": ["XLB"],
}

UNIVERSES: dict[str, dict[str, list[str]]] = {"stocks": UNIVERSE, "etfs": ETF_UNIVERSE}
# Per-universe defaults. Sector ETFs are diversified portfolios, so their correlations run
# much higher than single stocks (calm ~0.5-0.6); a higher edge threshold keeps the network
# readable.
UNIVERSE_DEFAULTS: dict[str, dict[str, object]] = {
    "stocks": {"start": "2017-01-01", "threshold": 0.5},
    "etfs": {"start": "1999-01-01", "threshold": 0.8},
}

# Forward-outcome horizons in trading days (about 1 and 3 months).
FORWARD_HORIZONS: tuple[int, ...] = (21, 63)

# Fixed sector -> colour mapping (colour follows the entity, never its rank). The first
# eight are a CVD-checked categorical palette; 11 sectors exceed it, so the last three are
# extra muted hues and every node also carries its ticker label (identity is never
# colour-alone).
SECTOR_COLORS: dict[str, str] = {
    "Information Technology": "#2a78d6",
    "Communication Services": "#eb6834",
    "Consumer Discretionary": "#1baf7a",
    "Consumer Staples": "#eda100",
    "Energy": "#e87ba4",
    "Financials": "#008300",
    "Health Care": "#6250d6",
    "Industrials": "#e34948",
    "Materials": "#8c5a2b",
    "Real Estate": "#55606e",
    "Utilities": "#7d8a1a",
}

# Known stress events annotated on the tracking chart.
STRESS_EVENTS: dict[str, str] = {
    "2000-04-14": "Dot-com crash",
    "2001-09-17": "9/11",
    "2002-07-23": "2002 low",
    "2008-09-15": "Lehman",
    "2010-05-06": "Flash crash",
    "2011-08-08": "US downgrade",
    "2015-08-24": "China deval.",
    "2018-02-05": "Volmageddon",
    "2018-12-24": "Q4 2018 low",
    "2020-03-16": "COVID crash",
    "2022-06-13": "2022 rate shock",
    "2024-08-05": "Yen-carry unwind",
    "2025-04-08": "Tariff shock",
}

SNAPSHOT_DATES: tuple[str, str] = ("2020-03-20", "2025-04-08")

INK = "#2b2b2b"
INK_MUTED = "#6b6b6b"
GRID = "#e4e3df"
LINE_MAIN = "#2a78d6"
PANIC_SHADE = "#e34948"
DD_SHADE = "#9a9a9a"


@dataclass
class Config:
    """All tunable parameters in one place."""

    universe: dict[str, list[str]] = field(default_factory=lambda: dict(UNIVERSE))
    universe_name: str = "stocks"  # "stocks" or "etfs" (sets cache file and labels)
    market_ticker: str = "SPY"
    start: str = "2017-01-01"  # 2 years before COVID so the panic flag is warmed up
    end: str | None = None  # None = today
    window: int = 90  # rolling window length in trading days (T)
    step: int = 5  # step between window end dates, trading days
    threshold: float = 0.5  # correlation threshold for network edges
    mst: bool = False  # draw minimum spanning tree instead of threshold graph
    max_missing: float = 0.05  # drop tickers with more missing data than this
    ffill_limit: int = 5  # forward-fill at most this many consecutive missing days
    z_threshold: float = 1.5  # panic flag: z-score of avg_corr above this
    z_mode: str = "rolling"  # "rolling" (trailing baseline) or "expanding" (all history)
    z_lookback_days: int = 504  # rolling baseline length in trading days (~2 years)
    z_min_days: int = 252  # z-score needs this many trading days of history
    drawdown_shade: float = 0.10  # shade SPY drawdowns deeper than this
    seed: int = 42
    use_proxies: bool = True  # portfolio/compare: extend ETF history with look-alike funds
    outdir: Path = Path("outputs")
    cache_dir: Path = Path("data")
    refresh: bool = False  # ignore cache and re-download
    max_cache_age_hours: float | None = 12.0  # re-download saved prices older than this
    make_gif: bool = True
    gif_stride: int | None = None  # every k-th window as a GIF frame; None = auto (~240 frames)
    fps: int = 12
    horizons: tuple[int, ...] = FORWARD_HORIZONS  # forward-outcome horizons, trading days
    dd_level: float = 0.10  # forward study: probability of a drawdown worse than this

    @property
    def tickers(self) -> list[str]:
        return [t for ts in self.universe.values() for t in ts]

    @property
    def sector_of(self) -> dict[str, str]:
        return {t: s for s, ts in self.universe.items() for t in ts}

    @property
    def z_min_obs(self) -> int:
        """Minimum observations of the *stepped* metric series for the z-score baseline."""
        return max(2, math.ceil(self.z_min_days / self.step))

    @property
    def z_lookback_obs(self) -> int:
        """Rolling baseline length in observations of the stepped metric series."""
        return max(self.z_min_obs, math.ceil(self.z_lookback_days / self.step))

    @property
    def z_label(self) -> str:
        if self.z_mode == "rolling":
            return f"rolling {self.z_lookback_days / 252:.0f}y"
        return "expanding"


class DataDownloadError(RuntimeError):
    """Raised when market data cannot be obtained."""


# ----------------------------------------------------------------------------------------
# Data: download / cache / synthetic / cleaning
# ----------------------------------------------------------------------------------------


def _cache_path(cfg: Config) -> Path:
    name = "prices_cache.csv" if cfg.universe_name == "stocks" else f"prices_cache_{cfg.universe_name}.csv"
    return cfg.cache_dir / name


def download_prices(cfg: Config, tickers: list[str] | None = None,
                    cache_name: str | None = None) -> pd.DataFrame:
    """Download auto-adjusted closes for the universe plus the market ticker, with CSV cache.

    ``tickers``/``cache_name`` override the universe (used by the portfolio tools).
    The cache is reused only if it holds every requested ticker, covers the requested start
    date, AND was downloaded less than ``cfg.max_cache_age_hours`` ago; otherwise prices
    are re-downloaded so results never silently stop at an old date. If that refresh fails
    (e.g. no internet), the older cached prices are used with a warning. ``--refresh``
    forces a new download.
    """
    wanted = list(dict.fromkeys((tickers or cfg.tickers) + [cfg.market_ticker]))
    path = cfg.cache_dir / cache_name if cache_name else _cache_path(cfg)
    meta_path = path.with_suffix(".meta.json")
    stale: pd.DataFrame | None = None
    if path.exists() and not cfg.refresh:
        cached = pd.read_csv(path, index_col=0, parse_dates=True)
        meta = json.loads(meta_path.read_text()) if meta_path.exists() else {}
        if meta:
            # The meta file remembers what was ASKED for, so tickers with no data (or that
            # started later than the requested date) do not force a re-download every run.
            covers = (set(wanted).issubset(meta.get("requested", []))
                      and pd.Timestamp(cfg.start) >= pd.Timestamp(meta.get("start", "2100-01-01")))
        else:
            covers = (set(wanted).issubset(cached.columns)
                      and cached.index.min() <= pd.Timestamp(cfg.start) + pd.Timedelta(days=7))
        age_h = (time.time() - meta.get("downloaded_at", path.stat().st_mtime)) / 3600
        fresh = cfg.max_cache_age_hours is None or age_h <= cfg.max_cache_age_hours
        if covers:
            out = cached[[c for c in wanted if c in cached.columns]]
            if cfg.end:
                out = out.loc[: cfg.end]
            out = out.loc[cfg.start:]
            if fresh:
                log.info("Using saved prices from %s (last price %s, downloaded %.1f h ago)",
                         path.name, cached.index.max().date(), age_h)
                return out
            stale = out
            log.info("Saved prices in %s are %.0f h old (last price %s): refreshing", path.name,
                     age_h, cached.index.max().date())
        else:
            log.info("Saved prices in %s do not cover this request: downloading", path.name)
    try:
        close = _yahoo_download(wanted, cfg)
    except DataDownloadError as exc:
        if stale is not None:
            log.warning("Refresh failed (%s): USING OLDER SAVED PRICES up to %s", exc,
                        stale.index.max().date())
            return stale
        raise
    cfg.cache_dir.mkdir(parents=True, exist_ok=True)
    close.to_csv(path)
    meta_path.write_text(json.dumps({"start": cfg.start, "requested": wanted,
                                     "downloaded_at": time.time()}))
    log.info("Saved prices to %s (last price %s)", path.name, close.index.max().date())
    return close


def _yahoo_download(wanted: list[str], cfg: Config) -> pd.DataFrame:
    """One yfinance call for all tickers; raises DataDownloadError on any failure."""
    try:
        import yfinance as yf
    except ImportError as exc:  # pragma: no cover - environment specific
        raise DataDownloadError("yfinance is not installed") from exc
    log.info("Downloading %d tickers from Yahoo Finance (%s -> %s)...", len(wanted), cfg.start,
             cfg.end or "today")
    try:
        raw = yf.download(wanted, start=cfg.start, end=cfg.end, auto_adjust=True,
                          progress=False, threads=True)
    except Exception as exc:  # yfinance raises many exception types
        raise DataDownloadError(f"yfinance download failed: {exc}") from exc
    if raw is None or raw.empty:
        raise DataDownloadError("yfinance returned no data")
    if isinstance(raw.columns, pd.MultiIndex):
        close = raw["Close"].copy()
    else:  # single ticker shape
        close = raw[["Close"]].rename(columns={"Close": wanted[0]})
    close = close.dropna(axis=1, how="all")
    close.index = pd.to_datetime(close.index).tz_localize(None)
    if close.empty or cfg.market_ticker not in close.columns:
        raise DataDownloadError("download is empty or missing the market ticker")
    missing = sorted(set(wanted) - set(close.columns))
    if missing:
        log.warning("No data for: %s", ", ".join(missing))
    return close


def clear_price_cache(cache_dir: Path) -> int:
    """Delete all saved price files so the next run downloads fresh prices."""
    n = 0
    for f in list(cache_dir.glob("prices_cache*.csv")) + list(cache_dir.glob("prices_cache*.meta.json")):
        f.unlink()
        n += 1
    return n


# Older look-alike funds used to extend an ETF's history back before it launched, in order
# of preference (most similar first). Mostly Vanguard index mutual funds tracking the same or
# a very similar index; GC=F is the gold futures price. Proxies carry slightly different fees,
# so spliced years are close approximations, not exact history.
PROXIES: dict[str, list[str]] = {
    "VTI": ["VTSMX"], "ITOT": ["VTI", "VTSMX"], "SCHB": ["VTI", "VTSMX"],
    "VOO": ["SPY"], "IVV": ["SPY"], "SPLG": ["SPY"],
    "VXUS": ["VEU", "VGTSX"], "IXUS": ["VEU", "VGTSX"], "VEU": ["VGTSX"],
    "VEA": ["EFA"], "IEFA": ["EFA"], "VWO": ["EEM"], "IEMG": ["EEM"],
    "BND": ["AGG", "VBMFX"], "AGG": ["VBMFX"], "SCHZ": ["AGG", "VBMFX"],
    "TLT": ["VUSTX"], "IEF": ["VFITX"], "SHY": ["VFISX"], "TIP": ["VIPSX"],
    "GLD": ["GC=F"], "IAU": ["GLD", "GC=F"], "GLDM": ["GLD", "GC=F"],
    "VNQ": ["VGSIX"],
}


def proxy_tickers(tickers: list[str]) -> list[str]:
    """All proxy tickers needed to extend the given tickers' history."""
    return list(dict.fromkeys(p for t in tickers for p in PROXIES.get(t, []) if p not in tickers))


def splice_proxies(prices: pd.DataFrame, tickers: list[str]) -> tuple[pd.DataFrame, dict]:
    """Extend each ticker's price history backwards using its proxies (see PROXIES).

    Before the ticker's first price, the proxy's returns are used, scaled so the two series
    join exactly on the splice date. Proxies are applied in order, each reaching further back.
    Tickers with no data of their own are left empty (never fabricated from a proxy alone).

    Returns:
        (prices for ``tickers`` with extended history, {ticker: [(proxy, from, to), ...]})
    """
    out: dict[str, pd.Series] = {}
    notes: dict[str, list[tuple[str, pd.Timestamp, pd.Timestamp]]] = {}
    for t in tickers:
        s = prices[t].dropna() if t in prices.columns else pd.Series(dtype=float)
        segs = []
        for p in PROXIES.get(t, []):
            if s.empty or p not in prices.columns:
                continue
            ps = prices[p].dropna()
            first = s.index[0]
            older = ps.loc[:first]
            if len(older) < 2 or older.index[0] >= first:
                continue
            anchor = older.iloc[-1]
            ext = older[older.index < first] * (s.iloc[0] / anchor)
            if ext.empty:
                continue
            segs.append((p, ext.index[0], first))
            s = pd.concat([ext, s])
        out[t] = s
        if segs:
            notes[t] = segs
    return pd.DataFrame(out).reindex(prices.index.union(pd.DataFrame(out).index)), notes


def describe_proxies(notes: dict) -> list[str]:
    """Human-readable lines such as 'VXUS: VEU 2007-03 -> 2011-01, VGTSX 1996-04 -> 2007-03'."""
    return [f"{t}: " + ", ".join(f"{p} {a:%Y-%m} -> {b:%Y-%m}" for p, a, b in segs)
            for t, segs in notes.items()]


def generate_synthetic_prices(cfg: Config) -> tuple[pd.DataFrame, tuple[pd.Timestamp, pd.Timestamp]]:
    """Generate prices from a one-factor (+ sector factor) model with a volatility regime.

    r_it = beta_i * f_t + gamma_i * s_{sector(i),t} + e_it, where the market factor's
    volatility jumps from calm to stressed for a block in the middle of the sample (with a
    negative drift so the synthetic market index draws down). The idiosyncratic and sector
    variances are constant, so correlations must rise in the stressed block.

    Returns:
        (prices with the universe + market ticker as columns, (stress_start, stress_end)).
    """
    rng = np.random.default_rng(cfg.seed)
    end = pd.Timestamp(cfg.end) if cfg.end else pd.Timestamp(date.today())
    dates = pd.bdate_range(cfg.start, end)
    n_days = len(dates)
    tickers = cfg.tickers
    sectors = list(cfg.universe)
    sec_idx = np.array([sectors.index(cfg.sector_of[t]) for t in tickers])

    lo, hi = int(0.45 * n_days), int(0.60 * n_days)
    sigma_f = np.full(n_days, 0.008)
    sigma_f[lo:hi] = 0.030
    mu_f = np.full(n_days, 0.0004)
    mu_f[lo:lo + (hi - lo) // 3] = -0.0025  # sell-off at the start of the stressed block
    f = mu_f + sigma_f * rng.standard_normal(n_days)

    s = 0.007 * rng.standard_normal((n_days, len(sectors)))
    beta = rng.uniform(0.7, 1.3, len(tickers))
    gamma = rng.uniform(0.8, 1.2, len(tickers))
    eps = 0.012 * rng.standard_normal((n_days, len(tickers)))
    rets = f[:, None] * beta[None, :] + s[:, sec_idx] * gamma[None, :] + eps

    prices = pd.DataFrame(100.0 * np.exp(np.cumsum(rets, axis=0)), index=dates, columns=tickers)
    # Sprinkle a few missing values to exercise the cleaning path.
    holes = rng.random(prices.shape) < 0.003
    prices = prices.mask(holes)
    mkt = f + 0.002 * rng.standard_normal(n_days)
    prices[cfg.market_ticker] = 300.0 * np.exp(np.cumsum(mkt))
    return prices, (dates[lo], dates[hi - 1])


def clean_prices(prices: pd.DataFrame, cfg: Config) -> tuple[pd.DataFrame, pd.Series]:
    """Clean prices and compute daily log returns. Nothing here looks ahead in time.

    Steps: drop rows where every ticker is missing (non-trading days), drop tickers with
    more than ``cfg.max_missing`` missing data, forward-fill gaps of at most
    ``cfg.ffill_limit`` days (forward-fill only uses past data), drop any leftover rows with
    gaps, then take log returns.

    Caveat: the "drop tickers with >5% missing" rule uses full-sample missingness, a mild
    form of look-ahead in *universe selection* (not in any metric).

    Returns:
        (stock log returns, market price aligned to the return dates).
    """
    prices = prices.sort_index().dropna(how="all")
    if cfg.market_ticker not in prices.columns:
        raise ValueError(f"market ticker {cfg.market_ticker} missing from price data")
    market = prices[cfg.market_ticker]
    stocks = prices.drop(columns=[cfg.market_ticker])
    stocks = stocks[[t for t in cfg.tickers if t in stocks.columns]]

    miss = stocks.isna().mean()
    dropped = miss[miss > cfg.max_missing]
    if not dropped.empty:
        log.warning("Dropping tickers with >%.0f%% missing: %s", 100 * cfg.max_missing,
                    ", ".join(f"{t} ({m:.1%})" for t, m in dropped.items()))
    stocks = stocks.drop(columns=dropped.index)

    stocks = stocks.ffill(limit=cfg.ffill_limit)
    market = market.ffill(limit=cfg.ffill_limit)
    panel = pd.concat([stocks, market.rename("__mkt__")], axis=1).dropna(how="any")
    if len(panel) < cfg.window + 2:
        raise ValueError(f"only {len(panel)} clean rows; need more than window={cfg.window}")

    rets = np.log(panel[stocks.columns]).diff().iloc[1:]
    log.info("Clean data: %d assets x %d daily returns (%s -> %s)", rets.shape[1], len(rets),
             rets.index[0].date(), rets.index[-1].date())
    return rets, panel["__mkt__"].loc[rets.index]


# ----------------------------------------------------------------------------------------
# Core calculations
# ----------------------------------------------------------------------------------------


def rolling_correlations(returns: pd.DataFrame, window: int, step: int) -> tuple[pd.DatetimeIndex, np.ndarray]:
    """Rolling Pearson correlation matrices, fully vectorised across windows.

    Window ends are aligned so the most recent date is always the last window. Each window
    uses only returns up to and including its end date.

    Returns:
        (window end dates of length W, array of shape (W, N, N)).
    """
    x = returns.to_numpy(dtype=float)
    n_days, n = x.shape
    if window > n_days:
        raise ValueError("window longer than the data")
    ends = np.arange(n_days - 1, window - 2, -step)[::-1]  # inclusive end positions
    views = np.lib.stride_tricks.sliding_window_view(x, window, axis=0)  # (n_days-T+1, N, T)
    win = views[ends - window + 1]  # (W, N, T)
    z = win - win.mean(axis=2, keepdims=True)
    sd = z.std(axis=2, ddof=1, keepdims=True)
    sd[sd == 0] = np.nan  # a flat series has undefined correlation
    z = z / sd
    corr = np.einsum("wit,wjt->wij", z, z) / (window - 1)
    corr = np.clip(np.nan_to_num(corr, nan=0.0), -1.0, 1.0)
    idx = np.arange(n)
    corr[:, idx, idx] = 1.0
    return returns.index[ends], corr


def compute_metrics(returns: pd.DataFrame, market: pd.Series, cfg: Config) -> tuple[pd.DataFrame, np.ndarray]:
    """Compute rolling network metrics and the panic flag.

    Columns: avg_corr, top_eig, top_eig_share, mp_bound, n_edges, spy_drawdown,
    plus avg_corr_z (z-score vs. a trailing baseline) and panic (bool flag), and a
    benchmark volatility flag: trailing_vol (annualised SPY vol over the same window),
    vol_z and vol_panic, built exactly like the correlation flag.

    Returns:
        (metrics DataFrame indexed by window end date, correlation stack (W, N, N)).
    """
    n, t = returns.shape[1], cfg.window
    q = n / t
    if q > 0.5:
        log.warning("N/T = %d/%d = %.2f > 0.5: correlation matrices will be noisy; "
                    "use a longer window or fewer stocks", n, t, q)
    else:
        log.info("N/T = %d/%d = %.2f", n, t, q)

    dates, corr = rolling_correlations(returns, cfg.window, cfg.step)
    eig = np.linalg.eigvalsh(corr)  # batched, ascending, shape (W, N)
    top = eig[:, -1]
    avg = (corr.sum(axis=(1, 2)) - n) / (n * (n - 1))
    iu = np.triu_indices(n, k=1)
    n_edges = (corr[:, iu[0], iu[1]] > cfg.threshold).sum(axis=1)

    # Drawdown uses the running (expanding) max: no look-ahead.
    drawdown = market / market.cummax() - 1.0

    df = pd.DataFrame(
        {
            "avg_corr": avg,
            "top_eig": top,
            "top_eig_share": top / n,  # trace of a correlation matrix = N
            "mp_bound": (1.0 + math.sqrt(q)) ** 2,
            "n_edges": n_edges,
            "spy_drawdown": drawdown.reindex(dates).to_numpy(),
        },
        index=pd.DatetimeIndex(dates, name="date"),
    )

    # Panic flag: z-score of today's avg_corr against a baseline built only from PRIOR
    # windows (no look-ahead, and the current value cannot dampen its own z-score).
    base_mean, base_std = zscore_baseline(df["avg_corr"], cfg)
    df["avg_corr_z"] = (df["avg_corr"] - base_mean) / base_std
    df["panic"] = df["avg_corr_z"] > cfg.z_threshold

    # Benchmark: the same flag built on plain market volatility. If the correlation flag
    # adds nothing beyond this, the network machinery is not earning its keep.
    mret = np.log(market).diff()
    tvol = mret.rolling(cfg.window).std() * math.sqrt(252)
    df["trailing_vol"] = tvol.reindex(dates).to_numpy()
    v_mean, v_std = zscore_baseline(df["trailing_vol"], cfg)
    df["vol_z"] = (df["trailing_vol"] - v_mean) / v_std
    df["vol_panic"] = df["vol_z"] > cfg.z_threshold
    return df, corr


def zscore_baseline(series: pd.Series, cfg: Config) -> tuple[pd.Series, pd.Series]:
    """Mean and std of the panic-flag baseline at each date, using only earlier values.

    rolling:   trailing ``cfg.z_lookback_days`` of history, so one extreme episode (e.g.
               COVID) stops dominating the baseline once it has rolled out.
    expanding: all history so far (COVID inflates the baseline permanently).
    Both need ``cfg.z_min_days`` of history before producing a value.
    """
    prior = series.shift(1)
    if cfg.z_mode == "rolling":
        roll = prior.rolling(cfg.z_lookback_obs, min_periods=cfg.z_min_obs)
    elif cfg.z_mode == "expanding":
        roll = prior.expanding(min_periods=cfg.z_min_obs)
    else:
        raise ValueError(f"unknown z_mode {cfg.z_mode!r}")
    return roll.mean(), roll.std()


def forward_outcomes(market: pd.Series, dates: pd.DatetimeIndex,
                     horizons: tuple[int, ...]) -> pd.DataFrame:
    """What happened to the market AFTER each window end date (these are outcomes, not inputs).

    For each horizon h (trading days) and each date t:
        fwd_ret_{h}d: simple return from t to t+h
        fwd_vol_{h}d: annualised realised volatility of daily log returns over t+1..t+h
        fwd_mdd_{h}d: worst peak-to-trough drawdown within t..t+h (negative number)
    Dates without h days of future data get NaN.
    """
    p = market.to_numpy(dtype=float)
    n = len(p)
    r = pd.Series(np.diff(np.log(p), prepend=np.nan))
    pos = market.index.get_indexer(dates)
    out: dict[str, np.ndarray] = {}
    for h in horizons:
        ret = np.full(n, np.nan)
        mdd = np.full(n, np.nan)
        if n > h:
            ret[: n - h] = p[h:] / p[: n - h] - 1.0
            win = np.lib.stride_tricks.sliding_window_view(p, h + 1)  # (n-h, h+1)
            mdd[: n - h] = (win / np.maximum.accumulate(win, axis=1) - 1.0).min(axis=1)
        vol = (r.rolling(h).std().shift(-h) * math.sqrt(252)).to_numpy()
        out[f"fwd_ret_{h}d"] = ret[pos]
        out[f"fwd_vol_{h}d"] = vol[pos]
        out[f"fwd_mdd_{h}d"] = mdd[pos]
    return pd.DataFrame(out, index=dates)


def summarize_forward(df: pd.DataFrame, cfg: Config) -> pd.DataFrame:
    """Compare forward outcomes across flag states and correlation z-score quintiles.

    Only windows where both flags are live (warm-up finished) are used. ``blocks`` counts
    contiguous runs of each group: overlapping windows are not independent, so blocks (not
    windows) is the honest sample size, especially for the flag-ON groups.
    """
    live = df[df["avg_corr_z"].notna() & df["vol_z"].notna()].copy()
    labels = [f"Corr z Q{i}" + (" (lowest)" if i == 1 else " (highest)" if i == 5 else "")
              for i in range(1, 6)]
    quint = pd.qcut(live["avg_corr_z"], 5, labels=labels)
    groups: dict[str, pd.Series] = {
        "All windows (flags live)": pd.Series(True, index=live.index),
        "Corr flag ON": live["panic"],
        "Corr flag OFF": ~live["panic"],
        "Vol flag ON": live["vol_panic"],
        "Vol flag OFF": ~live["vol_panic"],
        "Corr ON, vol OFF": live["panic"] & ~live["vol_panic"],
        "Vol ON, corr OFF": live["vol_panic"] & ~live["panic"],
    }
    for lab in labels:
        groups[lab] = quint == lab

    rows = []
    for h in cfg.horizons:
        ret, vol, mdd = (f"fwd_ret_{h}d", f"fwd_vol_{h}d", f"fwd_mdd_{h}d")
        has_future = live[ret].notna()
        for name, mask in groups.items():
            m = mask.astype(bool) & has_future
            sub = live.loc[m]
            rows.append({
                "horizon": f"{h}d",
                "group": name,
                "windows": int(m.sum()),
                "blocks": len(_runs(m)),
                "ret_mean_%": 100 * sub[ret].mean(),
                "ret_median_%": 100 * sub[ret].median(),
                "vol_mean_%": 100 * sub[vol].mean(),
                "mdd_mean_%": 100 * sub[mdd].mean(),
                f"p_dd>{cfg.dd_level:.0%}_%": 100 * (sub[mdd] < -cfg.dd_level).mean(),
            })
    return pd.DataFrame(rows)


def log_forward_summary(summary: pd.DataFrame, cfg: Config) -> None:
    """Print the forward study as readable tables plus the headline comparisons."""
    pd.set_option("display.width", 200)
    for h in cfg.horizons:
        tab = summary[summary["horizon"] == f"{h}d"].drop(columns="horizon")
        log.info("Forward outcomes for %s over the next %d trading days (~%d month%s):\n%s",
                 cfg.market_ticker, h, round(h / 21), "" if h <= 21 else "s",
                 tab.to_string(index=False, float_format=lambda x: f"{x:7.1f}"))
    h = max(cfg.horizons)
    tab = summary[summary["horizon"] == f"{h}d"].set_index("group")
    pcol = f"p_dd>{cfg.dd_level:.0%}_%"
    on, off = tab.loc["Corr flag ON"], tab.loc["Corr flag OFF"]
    if on["windows"] == 0:
        log.info("Headline: the correlation flag never fired while forward data was available")
        return
    log.info("Headline (%dd): corr flag ON vs OFF -> forward vol %.1f%% vs %.1f%%, "
             "mean return %.1f%% vs %.1f%%, P(drawdown > %.0f%%) %.0f%% vs %.0f%% "
             "[ON sample: %d windows in only %d independent blocks]",
             h, on["vol_mean_%"], off["vol_mean_%"], on["ret_mean_%"], off["ret_mean_%"],
             100 * cfg.dd_level, on[pcol], off[pcol], on["windows"], on["blocks"])


def plot_forward(summary: pd.DataFrame, cfg: Config, path: Path) -> None:
    """Forward vol, return and drawdown probability by correlation z-score quintile."""
    q = summary[summary["group"].str.startswith("Corr z Q")]
    pcol = f"p_dd>{cfg.dd_level:.0%}_%"
    panels = [("vol_mean_%", f"Forward {cfg.market_ticker} volatility (ann. %)"),
              ("ret_mean_%", f"Forward {cfg.market_ticker} return (%)"),
              (pcol, f"P(drawdown worse than {cfg.dd_level:.0%}) (%)")]
    colors = ["#2a78d6", "#eb6834"]
    groups = list(dict.fromkeys(q["group"]))
    x = np.arange(len(groups))
    width = 0.38
    fig, axes = plt.subplots(1, 3, figsize=(16, 5))
    for ax, (col, title) in zip(axes, panels):
        _style_axis(ax)
        ax.grid(axis="x", visible=False)
        for k, h in enumerate(cfg.horizons):
            vals = q[q["horizon"] == f"{h}d"].set_index("group").reindex(groups)[col]
            ax.bar(x + (k - 0.5) * width, vals.to_numpy(), width=width - 0.04,
                   color=colors[k % len(colors)], label=f"next {h} days (~{round(h / 21)}m)")
        ax.axhline(0, color=INK_MUTED, linewidth=0.8)
        ax.set_xticks(x)
        ax.set_xticklabels([f"Q{i + 1}" for i in range(len(groups))])
        ax.set_xlabel("Correlation z-score quintile (Q1 = calmest, Q5 = most stressed)",
                      color=INK, fontsize=9)
        ax.set_title(title, fontsize=10, color=INK, loc="left")
    axes[0].legend(frameon=False, fontsize=9, loc="upper left")
    fig.suptitle(f"What happened next? {cfg.universe_name} universe, {cfg.window}-day correlation "
                 f"({len(q) // max(len(cfg.horizons), 1)} quintiles, overlapping windows)",
                 fontsize=12, color=INK)
    fig.tight_layout(rect=(0, 0, 1, 0.94))
    fig.savefig(path, dpi=130)
    plt.close(fig)
    log.info("Saved %s", path)


def check_regime_response(metrics: pd.DataFrame, stress: tuple[pd.Timestamp, pd.Timestamp],
                          cfg: Config) -> None:
    """Self-test: avg_corr and top eigenvalue must both rise in the high-variance regime.

    Compares windows lying entirely inside the stressed block with windows lying entirely
    before it. Raises AssertionError on failure.
    """
    lo, hi = stress
    trading_days = pd.bdate_range(lo, hi)
    win_start = metrics.index - pd.tseries.offsets.BDay(cfg.window - 1)
    inside = (win_start >= lo) & (metrics.index <= hi)
    calm = metrics.index < lo
    assert inside.sum() > 0 and calm.sum() > 0, (
        f"self-test needs windows fully inside the stress block ({len(trading_days)} days) and "
        f"before it; reduce --window")
    c_calm, c_hi = metrics.loc[calm, "avg_corr"].mean(), metrics.loc[inside, "avg_corr"].mean()
    e_calm, e_hi = metrics.loc[calm, "top_eig"].mean(), metrics.loc[inside, "top_eig"].mean()
    log.info("Self-test: avg_corr calm %.3f -> stressed %.3f | top_eig calm %.2f -> stressed %.2f",
             c_calm, c_hi, e_calm, e_hi)
    assert c_hi > c_calm, "avg_corr did not rise in the high-variance regime"
    assert e_hi > e_calm, "top eigenvalue did not rise in the high-variance regime"
    assert (metrics.loc[inside, "top_eig"] > metrics.loc[inside, "mp_bound"]).all(), \
        "lambda1 not above the MP noise bound in the stressed regime"
    log.info("Self-test PASSED")


# ----------------------------------------------------------------------------------------
# Network construction and layout
# ----------------------------------------------------------------------------------------


def build_graph(corr: np.ndarray, tickers: list[str], threshold: float, mst: bool) -> nx.Graph:
    """Build the drawn network for one window.

    Threshold mode: edge if rho > threshold, weight = rho.
    MST mode: minimum spanning tree on distance d = sqrt(2 * (1 - rho)); weight = rho.
    """
    n = len(tickers)
    iu = np.triu_indices(n, k=1)
    rho = corr[iu]
    g = nx.Graph()
    g.add_nodes_from(tickers)
    a, b = np.asarray(tickers)[iu[0]], np.asarray(tickers)[iu[1]]
    if mst:
        dist = np.sqrt(np.clip(2.0 * (1.0 - rho), 0.0, None))
        full = nx.Graph()
        full.add_nodes_from(tickers)
        full.add_edges_from((u, v, {"distance": d, "weight": r})
                            for u, v, d, r in zip(a, b, dist, rho))
        tree = nx.minimum_spanning_tree(full, weight="distance")
        g.add_edges_from(tree.edges(data=True))
    else:
        keep = rho > threshold
        g.add_weighted_edges_from(zip(a[keep], b[keep], rho[keep]))
    return g


def compute_layouts(corr: np.ndarray, tickers: list[str], seed: int) -> list[dict[str, np.ndarray]]:
    """Spring layouts for every window, each initialised from the previous frame.

    The layout graph is the full correlation graph with attraction weight max(rho, 0)^2
    (not just the drawn edges), and positions are NOT rescaled to a unit box. In
    Fruchterman-Reingold the equilibrium distance between two nodes scales like
    weight^(-1/3) = rho^(-2/3), so a high-correlation market physically contracts into one
    tight cluster while a calm market spreads out into sector clusters. Fixed k and
    shared axis limits make frames directly comparable.
    """
    n = len(tickers)
    k = 1.0 / math.sqrt(n)
    weights = np.clip(corr, 0.0, 1.0) ** 2
    idx = np.arange(n)
    weights[:, idx, idx] = 0.0
    mapping = dict(enumerate(tickers))
    layouts: list[dict[str, np.ndarray]] = []
    prev: dict[str, np.ndarray] | None = None
    for w in weights:  # loop over windows (time), not over stock pairs
        g = nx.relabel_nodes(nx.from_numpy_array(w), mapping)
        pos = nx.spring_layout(g, k=k, pos=prev, iterations=300 if prev is None else 60,
                               weight="weight", scale=None, seed=seed)
        arr = np.array([pos[t] for t in tickers])
        arr -= arr.mean(axis=0)  # keep the cloud centred so frames line up
        prev = {t: arr[i] for i, t in enumerate(tickers)}
        layouts.append(prev)
    return layouts


# ----------------------------------------------------------------------------------------
# Plotting
# ----------------------------------------------------------------------------------------


def _style_axis(ax: plt.Axes) -> None:
    for side in ("top", "right"):
        ax.spines[side].set_visible(False)
    for side in ("left", "bottom"):
        ax.spines[side].set_color(INK_MUTED)
    ax.tick_params(colors=INK_MUTED, labelsize=9)
    ax.grid(True, color=GRID, linewidth=0.8)
    ax.set_axisbelow(True)


def _runs(mask: pd.Series) -> list[tuple[pd.Timestamp, pd.Timestamp]]:
    """Contiguous True runs of a boolean series as (start, end) timestamps."""
    m = mask.fillna(False).to_numpy(dtype=int)
    d = np.diff(np.r_[0, m, 0])
    starts, ends = np.flatnonzero(d == 1), np.flatnonzero(d == -1)  # end is exclusive
    idx = mask.index
    return [(idx[s], idx[min(e, len(idx) - 1)]) for s, e in zip(starts, ends)]


def _sector_legend(fig: plt.Figure, sectors: list[str], **kw) -> None:
    handles = [Line2D([0], [0], marker="o", linestyle="", markersize=8,
                      markerfacecolor=SECTOR_COLORS[s], markeredgecolor="white", label=s)
               for s in sectors]
    fig.legend(handles=handles, frameon=False, fontsize=8, labelcolor=INK, **kw)


def draw_network(ax: plt.Axes, g: nx.Graph, pos: dict[str, np.ndarray], sector_of: dict[str, str],
                 lim: float, threshold: float, mst: bool, title: str) -> None:
    """Draw one network frame: colour = sector, size = degree, edge width/alpha = correlation."""
    ax.clear()
    nodes = list(g.nodes)
    deg = np.array([g.degree(v) for v in nodes], dtype=float)
    sizes = 30 + 170 * deg / max(deg.max(), 1) if mst else 30 + 120 * deg / max(len(nodes) - 1, 1)
    if g.number_of_edges():
        w = np.array([d["weight"] for _, _, d in g.edges(data=True)])
        lo = -1.0 if mst else threshold
        frac = np.clip((w - lo) / (1.0 - lo), 0.0, 1.0)
        nx.draw_networkx_edges(g, pos, ax=ax, width=0.4 + 1.8 * frac, edge_color=INK_MUTED,
                               alpha=0.35)
    nx.draw_networkx_nodes(g, pos, ax=ax, nodelist=nodes, node_size=sizes,
                           node_color=[SECTOR_COLORS[sector_of[v]] for v in nodes],
                           edgecolors="white", linewidths=1.0)
    nx.draw_networkx_labels(g, pos, ax=ax, font_size=6, font_color=INK)
    ax.set_xlim(-lim, lim)
    ax.set_ylim(-lim, lim)
    ax.set_aspect("equal")
    ax.set_axis_off()
    ax.set_title(title, fontsize=10, color=INK)


def _frame_title(d: pd.Timestamp, row: pd.Series, n: int, label: str = "") -> str:
    head = f"{label}\n" if label else ""
    return (f"{head}{d:%Y-%m-%d} | avg ρ = {row.avg_corr:.2f} | "
            f"λ1 = {row.top_eig:.1f} ({row.top_eig_share:.0%} of var.)")


def plot_snapshots(metrics: pd.DataFrame, corr: np.ndarray, layouts: list[dict[str, np.ndarray]],
                   tickers: list[str], cfg: Config, path: Path) -> None:
    """Four side-by-side network snapshots: calmest, most panicked, and two event dates.

    A date that lands on a window already shown is replaced by the latest window. The four
    panels share one axis scale (so they stay comparable), fitted to these four frames.
    """
    idx = metrics.index
    picks: list[tuple[str, int]] = [
        ("Calmest window", int(np.argmin(metrics["avg_corr"].to_numpy()))),
        ("Most panicked window", int(np.argmax(metrics["avg_corr"].to_numpy()))),
    ]
    for d in SNAPSHOT_DATES:
        ts = pd.Timestamp(d)
        i = int(idx.get_indexer([ts], method="nearest")[0])
        if abs((idx[i] - ts).days) > 10:
            log.warning("Snapshot date %s outside the data; using nearest window %s", d,
                        idx[i].date())
        if i in {j for _, j in picks}:
            latest = len(idx) - 1
            if latest not in {j for _, j in picks}:
                log.info("Snapshot near %s duplicates another panel; showing latest window", d)
                picks.append(("Latest window", latest))
                continue
        picks.append((f"Near {d}", i))
    lim = 1.12 * max(np.abs(np.array(list(layouts[i].values()))).max() for _, i in picks)

    fig, axes = plt.subplots(1, 4, figsize=(22, 6.4))
    sector_of = cfg.sector_of
    for ax, (label, i) in zip(axes, picks):
        g = build_graph(corr[i], tickers, cfg.threshold, cfg.mst)
        draw_network(ax, g, layouts[i], sector_of, lim, cfg.threshold, cfg.mst,
                     _frame_title(idx[i], metrics.iloc[i], len(tickers), label))
    mode = "minimum spanning tree" if cfg.mst else f"edges where ρ > {cfg.threshold:.2f}"
    fig.suptitle(f"Correlation network, {cfg.window}-day window ({mode}); node size = degree",
                 fontsize=13, color=INK)
    _sector_legend(fig, [s for s in cfg.universe if any(sector_of[t] == s for t in tickers)],
                   loc="lower center", ncol=6)
    fig.tight_layout(rect=(0, 0.08, 1, 0.95))
    fig.savefig(path, dpi=130)
    plt.close(fig)
    log.info("Saved %s", path)


def plot_tracking(metrics: pd.DataFrame, market: pd.Series, cfg: Config, path: Path) -> None:
    """Three stacked panels: SPY (log) with drawdown shading, avg corr, lambda1 share vs MP."""
    fig, axes = plt.subplots(3, 1, figsize=(13, 10), sharex=True,
                             gridspec_kw={"height_ratios": [1.2, 1, 1]})
    ax_px, ax_c, ax_e = axes
    for ax in axes:
        _style_axis(ax)

    # Shading first (behind lines): panic flag on every panel, drawdowns on the price panel.
    panic_runs = _runs(metrics["panic"])
    for s, e in panic_runs:
        for ax in axes:
            ax.axvspan(s, e, color=PANIC_SHADE, alpha=0.12, linewidth=0)
    dd = market / market.cummax() - 1.0
    for s, e in _runs(dd <= -cfg.drawdown_shade):
        ax_px.axvspan(s, e, color=DD_SHADE, alpha=0.25, linewidth=0)

    ax_px.plot(market.index, market.to_numpy(), color=LINE_MAIN, linewidth=1.6)
    ax_px.set_yscale("log")
    ax_px.set_ylabel(f"{cfg.market_ticker} (log)", color=INK)
    ax_px.set_title(f"{cfg.market_ticker} price; grey = drawdown > {cfg.drawdown_shade:.0%}, "
                    f"red = panic flag ({cfg.z_label} z > {cfg.z_threshold})",
                    fontsize=10, color=INK, loc="left")

    ax_c.plot(metrics.index, metrics["avg_corr"], color=LINE_MAIN, linewidth=2,
              label="Average pairwise correlation")
    base_mean, base_std = zscore_baseline(metrics["avg_corr"], cfg)
    ax_c.plot(metrics.index, base_mean, color=INK_MUTED, linewidth=1.2, linestyle="--",
              label=f"Baseline mean ({cfg.z_label}, no look-ahead)")
    ax_c.plot(metrics.index, base_mean + cfg.z_threshold * base_std, color=PANIC_SHADE,
              linewidth=1.0, linestyle=":", label=f"Panic line (baseline + {cfg.z_threshold}σ)")
    ax_c.set_ylabel("Avg ρ", color=INK)
    ax_c.legend(frameon=False, fontsize=9, loc="upper left")

    ax_e.plot(metrics.index, metrics["top_eig_share"], color=LINE_MAIN, linewidth=2,
              label="λ1 / N (market-mode share of variance)")
    n = metrics["top_eig"].iloc[0] / metrics["top_eig_share"].iloc[0]
    ax_e.plot(metrics.index, metrics["mp_bound"] / n, color=INK_MUTED, linewidth=1.2,
              linestyle="--", label="Marchenko-Pastur noise bound λ+ / N")
    ax_e.set_ylabel("λ1 / N", color=INK)
    ax_e.set_ylim(bottom=0)
    ax_e.legend(frameon=False, fontsize=9, loc="upper left")

    lo, hi = market.index.min(), market.index.max()
    for k, (d, label) in enumerate(STRESS_EVENTS.items()):
        ts = pd.Timestamp(d)
        if not lo <= ts <= hi:
            continue
        for ax in axes:
            ax.axvline(ts, color=INK, linewidth=0.8, linestyle=":", alpha=0.7)
        ax_px.text(ts, 0.97 - 0.07 * (k % 3), f" {label}", transform=ax_px.get_xaxis_transform(),
                   ha="left", va="top", fontsize=8, color=INK,
                   bbox={"facecolor": "white", "edgecolor": "none", "alpha": 0.8, "pad": 1})

    ax_e.xaxis.set_major_locator(mdates.YearLocator())
    ax_e.xaxis.set_major_formatter(mdates.DateFormatter("%Y"))
    fig.suptitle(f"Market panic detector: {cfg.window}-day rolling correlation, "
                 f"{len(metrics)} windows", fontsize=13, color=INK, y=0.995)
    fig.tight_layout()
    fig.savefig(path, dpi=130)
    plt.close(fig)
    log.info("Saved %s", path)


def make_animation(metrics: pd.DataFrame, corr: np.ndarray, layouts: list[dict[str, np.ndarray]],
                   tickers: list[str], cfg: Config, lim: float, path: Path) -> None:
    """GIF: network per window step, with a time-series strip and a moving marker."""
    stride = cfg.gif_stride or max(1, math.ceil(len(metrics) / 240))
    frames = list(range(0, len(metrics), max(1, stride)))
    fig = plt.figure(figsize=(7, 8.2))
    gs = fig.add_gridspec(2, 1, height_ratios=[5, 1.1], hspace=0.08)
    ax_net = fig.add_subplot(gs[0])
    ax_ts = fig.add_subplot(gs[1])
    _style_axis(ax_ts)
    x = mdates.date2num(metrics.index.to_pydatetime())
    y = metrics["avg_corr"].to_numpy()
    for s, e in _runs(metrics["panic"]):
        ax_ts.axvspan(s, e, color=PANIC_SHADE, alpha=0.12, linewidth=0)
    ax_ts.plot(x, y, color=LINE_MAIN, linewidth=1.4)
    ax_ts.set_ylabel("Avg ρ", color=INK, fontsize=9)
    ax_ts.xaxis.set_major_locator(mdates.YearLocator())
    ax_ts.xaxis.set_major_formatter(mdates.DateFormatter("%Y"))
    vline = ax_ts.axvline(x[0], color=INK, linewidth=1)
    (dot,) = ax_ts.plot([x[0]], [y[0]], "o", color=INK, markersize=8, markeredgecolor="white")
    sector_of = cfg.sector_of
    sectors = [s for s in cfg.universe if any(sector_of[t] == s for t in tickers)]
    _sector_legend(fig, sectors, loc="upper center", ncol=4, bbox_to_anchor=(0.5, 0.995),
                   handletextpad=0.2, columnspacing=0.8)
    fig.subplots_adjust(left=0.1, right=0.97, top=0.88, bottom=0.05)

    def update(i: int):
        g = build_graph(corr[i], tickers, cfg.threshold, cfg.mst)
        draw_network(ax_net, g, layouts[i], sector_of, lim, cfg.threshold, cfg.mst,
                     _frame_title(metrics.index[i], metrics.iloc[i], len(tickers)))
        vline.set_xdata([x[i], x[i]])
        dot.set_data([x[i]], [y[i]])
        return ()

    anim = FuncAnimation(fig, update, frames=frames, blit=False)
    log.info("Rendering GIF with %d frames (every %d windows, ~%.0f s playback)...",
             len(frames), stride, len(frames) / cfg.fps)
    anim.save(path, writer=PillowWriter(fps=cfg.fps), dpi=72)
    plt.close(fig)
    log.info("Saved %s", path)


# ----------------------------------------------------------------------------------------
# Portfolio stress test (roadmap Phase 3a)
# ----------------------------------------------------------------------------------------


def load_portfolio(path: Path, min_holdings: int = 2) -> pd.Series:
    """Read a holdings CSV with columns ``ticker`` and ``weight`` (or ``value``).

    Weights can be percentages, fractions or money amounts: they are normalised to sum to 1.
    Lines starting with # are ignored. Duplicate tickers are summed.
    """
    df = pd.read_csv(path, comment="#", skipinitialspace=True)
    df.columns = [c.strip().lower() for c in df.columns]
    amount = next((c for c in ("weight", "value") if c in df.columns), None)
    if "ticker" not in df.columns or amount is None:
        raise ValueError(f"{path} needs a 'ticker' column and a 'weight' or 'value' column")
    df["ticker"] = df["ticker"].astype(str).str.strip().str.upper()
    w = df.groupby("ticker", sort=False)[amount].sum().astype(float)
    w = w[w != 0]
    if len(w) < min_holdings:
        raise ValueError(f"{path}: the portfolio needs at least {min_holdings} holding(s)")
    if (w < 0).any():
        log.warning("Negative weights (shorts) found: %s", ", ".join(w[w < 0].index))
    return w / w.sum()


def _port_vol(w: np.ndarray, vol: np.ndarray, corr: np.ndarray) -> float:
    """Annualised portfolio volatility from weights, annualised vols and a correlation matrix."""
    cov = np.outer(vol, vol) * corr
    return float(np.sqrt(w @ cov @ w))


def _risk_split(w: np.ndarray, vol: np.ndarray, corr: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Per-holding share of portfolio variance and correlation with the whole portfolio."""
    cov = np.outer(vol, vol) * corr
    cw = cov @ w
    var = float(w @ cw)
    return w * cw / var, cw / (vol * math.sqrt(var))


def prepare_portfolio_prices(prices: pd.DataFrame, weights: pd.Series, cfg: Config,
                             min_holdings: int = 2) -> tuple[pd.DataFrame, pd.Series]:
    """Align holdings + market prices on their common history.

    Holdings with no data are dropped (weights rescaled, loudly logged). The history starts
    when the most recently listed holding starts, so every holding is present every day.
    """
    tickers = list(weights.index)
    px = prices[[t for t in tickers if t in prices.columns] + [cfg.market_ticker]]
    missing = [t for t in tickers if t not in px.columns or px[t].isna().all()]
    if missing:
        log.warning("NO DATA for %s: dropped and the remaining weights rescaled", ", ".join(missing))
        weights = weights.drop(missing)
        weights = weights / weights.sum()
        tickers = list(weights.index)
        px = px[tickers + [cfg.market_ticker]]
    if len(tickers) < min_holdings:
        raise ValueError(f"fewer than {min_holdings} holding(s) have price data")
    first = px.apply(lambda c: c.first_valid_index())
    common_start = first.max()
    late = first[first > first.min() + pd.Timedelta(days=30)]
    if not late.empty:
        log.warning("Common history starts %s because of late listings: %s", common_start.date(),
                    ", ".join(f"{t} ({d.date()})" for t, d in late.items()))
    return px.loc[common_start:].ffill(limit=cfg.ffill_limit).dropna(), weights


def portfolio_stress(px: pd.DataFrame, weights: pd.Series, cfg: Config,
                     crisis_date: str | None = None) -> tuple[pd.DataFrame, pd.DataFrame, dict]:
    """Diversification health and crisis stress test for a portfolio.

    Today = the most recent ``cfg.window`` trading days. Crisis = the window with the
    highest average correlation among the holdings in their common history (or the window
    ending nearest ``crisis_date``). Scenarios keep today's weights:
      1. Today: today's volatilities and correlations
      2. Crisis correlations: today's volatilities, crisis correlations (diversification fails)
      3. Full crisis repeat: crisis volatilities and correlations
      4. Worst case: every correlation = 1 (no diversification at all)
    Effective independent bets = diversification ratio squared (Choueifaty & Coignard):
    N for N equal-risk uncorrelated holdings, 1 when everything moves together.

    Expects prices already aligned by ``prepare_portfolio_prices``.

    Returns:
        (scenario table, per-holding table, info dict with dates and summary numbers)
    """
    tickers = list(weights.index)
    rets = np.log(px).diff().iloc[1:]
    if len(rets) < 2 * cfg.window:
        log.warning("Only %d days of common history: the crisis scenario may not be a real crisis",
                    len(rets))
    stock_rets = rets[tickers]
    w = weights.to_numpy()

    now = stock_rets.iloc[-cfg.window:]
    vol_now = now.std().to_numpy() * math.sqrt(252)
    c_now = now.corr().to_numpy()

    dates, corr = rolling_correlations(stock_rets, cfg.window, cfg.step)
    n = len(tickers)
    avg = (corr.sum(axis=(1, 2)) - n) / (n * (n - 1))
    if crisis_date:
        k = int(pd.DatetimeIndex(dates).get_indexer([pd.Timestamp(crisis_date)], method="nearest")[0])
    else:
        k = int(np.argmax(avg))
    c_crisis = corr[k]
    end_pos = stock_rets.index.get_loc(dates[k])
    crisis = stock_rets.iloc[end_pos - cfg.window + 1: end_pos + 1]
    vol_crisis = crisis.std().to_numpy() * math.sqrt(252)

    scen_inputs = [
        ("Today", vol_now, c_now),
        ("Today's vol, crisis correlations", vol_now, c_crisis),
        ("Full crisis repeat", vol_crisis, c_crisis),
        ("Worst case: all correlations = 1", vol_now, np.ones((n, n))),
    ]
    rows = []
    for name, v, c in scen_inputs:
        pv = _port_vol(w, v, c)
        dr = float(np.abs(w) @ v) / pv
        rows.append({"scenario": name, "portfolio_vol_%": 100 * pv,
                     "bad_day_1in20_%": -100 * 1.645 * pv / math.sqrt(252),
                     "bad_month_1in20_%": -100 * 1.645 * pv / math.sqrt(12),
                     "independent_bets": dr ** 2,
                     "avg_corr": (c.sum() - n) / (n * (n - 1))})
    scen = pd.DataFrame(rows)

    rs_now, cp_now = _risk_split(w, vol_now, c_now)
    rs_cr, cp_cr = _risk_split(w, vol_now, c_crisis)
    mkt = rets[cfg.market_ticker].iloc[-cfg.window:]
    beta = now.apply(lambda col: col.cov(mkt) / mkt.var()).to_numpy()
    hold = pd.DataFrame({
        "weight_%": 100 * w,
        "risk_share_today_%": 100 * rs_now,
        "risk_share_crisis_corr_%": 100 * rs_cr,
        "vol_today_%": 100 * vol_now,
        "beta_to_" + cfg.market_ticker: beta,
        "corr_to_portfolio_today": cp_now,
        "corr_to_portfolio_crisis": cp_cr,
    }, index=pd.Index(tickers, name="ticker")).sort_values("risk_share_today_%", ascending=False)
    info = {"today_end": stock_rets.index[-1], "crisis_end": pd.Timestamp(dates[k]),
            "crisis_start": crisis.index[0], "history_start": stock_rets.index[0],
            "n": n, "weight_effective_n": 1.0 / float(np.sum(w ** 2))}
    return scen, hold, info


# Named crises for the historical replay: (start, end) = market peak to trough, roughly.
# Crises outside the holdings' common history are skipped automatically.
CRISES: dict[str, tuple[str, str]] = {
    "2000-02 dot-com crash": ("2000-03-24", "2002-10-09"),
    "2008 financial crisis": ("2007-10-09", "2009-03-09"),
    "2011 debt-ceiling crisis": ("2011-04-29", "2011-10-03"),
    "2015-16 China/oil slump": ("2015-05-21", "2016-02-11"),
    "2018 Q4 sell-off": ("2018-09-20", "2018-12-24"),
    "COVID crash 2020": ("2020-02-19", "2020-03-23"),
    "2022 inflation bear": ("2022-01-03", "2022-10-12"),
    "2025 tariff shock": ("2025-02-19", "2025-04-08"),
}


def crisis_replay(px: pd.DataFrame, weights: pd.Series,
                  cfg: Config) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Replay today's portfolio through each named crisis, using actual prices.

    Buy-and-hold from the crisis start (no rebalancing). Unlike correlation, this captures
    holdings that drift down together even when their daily moves look unrelated (e.g.
    stocks and bonds in 2022). For each crisis it reports portfolio and market return, max
    drawdown, worst day, worst 21-day stretch, and the correlation-based diversification
    (independent bets, and volatility with today's vols but the correlations of the
    ``cfg.window`` days ending at the crisis trough).

    Returns:
        (one row per crisis, per-holding returns with crises as columns)
    """
    tickers = list(weights.index)
    w = weights.to_numpy()
    rets = np.log(px[tickers]).diff().iloc[1:]
    now = rets.iloc[-cfg.window:]
    vol_now = now.std().to_numpy() * math.sqrt(252)
    rows, per_holding = [], {}
    for name, (start, end) in CRISES.items():
        s_ts, e_ts = pd.Timestamp(start), pd.Timestamp(end)
        if e_ts > px.index[-1] or e_ts <= px.index[0]:
            log.info("  Crisis replay: skipping %s (outside the holdings' common history from %s)",
                     name, px.index[0].date())
            continue
        if s_ts < px.index[0]:
            # Partly covered: keep it if at least half the crisis is inside the history.
            if (e_ts - px.index[0]) < 0.5 * (e_ts - s_ts):
                log.info("  Crisis replay: skipping %s (history from %s covers under half of it)",
                         name, px.index[0].date())
                continue
            s_ts = px.index[0]
            name = f"{name} (from {s_ts:%b %Y})"
        win = px.loc[s_ts:e_ts]
        if len(win) < 5:
            continue
        rel = win / win.iloc[0]
        value = rel[tickers] @ w  # buy-and-hold value, starts at 1
        mkt = rel[cfg.market_ticker]
        month = value.pct_change(21).min() if len(value) > 21 else value.iloc[-1] - 1.0
        hold_ret = rel[tickers].iloc[-1] - 1.0
        per_holding[name] = hold_ret

        end_pos = rets.index.get_indexer([win.index[-1]])[0]
        c = rets.iloc[max(0, end_pos - cfg.window + 1): end_pos + 1].corr().to_numpy()
        pv = _port_vol(w, vol_now, c)
        rows.append({
            "crisis": name,
            "start": win.index[0].date(),
            "end": win.index[-1].date(),
            "days": len(win) - 1,
            "portfolio_return_%": 100 * (value.iloc[-1] - 1.0),
            f"{cfg.market_ticker}_return_%": 100 * (mkt.iloc[-1] - 1.0),
            "max_drawdown_%": 100 * (value / value.cummax() - 1.0).min(),
            "worst_day_%": 100 * value.pct_change().min(),
            "worst_21d_%": 100 * month,
            "independent_bets": (float(np.abs(w) @ vol_now) / pv) ** 2,
            "vol_today_crisis_corr_%": 100 * pv,
            "best_holding": hold_ret.idxmax(),
            "best_holding_return_%": 100 * hold_ret.max(),
            "worst_holding": hold_ret.idxmin(),
            "worst_holding_return_%": 100 * hold_ret.min(),
        })
    summary = pd.DataFrame(rows)
    holdings = pd.DataFrame(per_holding).mul(100)
    holdings.index.name = "ticker"
    if not holdings.empty:
        holdings.insert(0, "weight_%", 100 * weights.reindex(holdings.index))
    return summary, holdings


def log_crisis_replay(summary: pd.DataFrame, cfg: Config) -> None:
    """Print the crisis replay as a compact table."""
    if summary.empty:
        log.info("CRISIS REPLAY: no named crisis falls inside the holdings' common history")
        return
    mk = f"{cfg.market_ticker}_return_%"
    lines = [f"  {'Crisis':<22} {'Dates':<23} {'Portf.':>7} {cfg.market_ticker:>7} {'MaxDD':>7} "
             f"{'WorstDay':>8} {'Worst21d':>8} {'Bets':>5}  Best / worst holding"]
    for _, r in summary.iterrows():
        lines.append(
            f"  {r['crisis']:<22} {str(r['start'])}→{str(r['end'])} "
            f"{r['portfolio_return_%']:6.1f}% {r[mk]:6.1f}% {r['max_drawdown_%']:6.1f}% "
            f"{r['worst_day_%']:7.1f}% {r['worst_21d_%']:7.1f}% {r['independent_bets']:5.1f}  "
            f"{r['best_holding']} {r['best_holding_return_%']:+.0f}% / "
            f"{r['worst_holding']} {r['worst_holding_return_%']:+.0f}%")
    log.info("CRISIS REPLAY (actual prices, today's weights, buy-and-hold from each crisis start):\n%s",
             "\n".join(lines))
    log.info("  These are real historical losses, so unlike the bad-day/month estimates above they "
             "include fat tails and shared drift.")


def plot_crisis_replay(summary: pd.DataFrame, holdings: pd.DataFrame, cfg: Config,
                       path: Path) -> None:
    """Left: portfolio vs market return per crisis. Right: each holding's return per crisis."""
    if summary.empty:
        return
    from matplotlib.colors import LinearSegmentedColormap, TwoSlopeNorm

    crises = list(summary["crisis"])
    hold = holdings.drop(columns="weight_%").reindex(columns=crises)
    hold = hold.loc[hold.mean(axis=1).sort_values(ascending=False).index]
    n_h, n_c = hold.shape
    fig, (ax_b, ax_h) = plt.subplots(1, 2, figsize=(7 + 2.2 * n_c, max(5.0, 0.42 * n_h + 2.2)),
                                     gridspec_kw={"width_ratios": [1, 1.25]})
    _style_axis(ax_b)
    x = np.arange(n_c)
    mk = f"{cfg.market_ticker}_return_%"
    ax_b.bar(x - 0.2, summary["portfolio_return_%"], width=0.38, color="#2a78d6", label="Your portfolio")
    ax_b.bar(x + 0.2, summary[mk], width=0.38, color="#9a9a9a", label=cfg.market_ticker)
    ax_b.scatter(x - 0.2, summary["max_drawdown_%"], marker="_", s=400, color=INK, zorder=3,
                 label="Portfolio max drawdown")
    for xi, v, dd in zip(x, summary["portfolio_return_%"], summary["max_drawdown_%"]):
        # Put the label below the drawdown marker so the two never overlap.
        y = min(v, dd) if v < 0 else v
        ax_b.text(xi - 0.2, y - (0.6 if v < 0 else -0.3), f"{v:.0f}%", ha="center",
                  va="top" if v < 0 else "bottom", fontsize=8, color=INK)
    ax_b.axhline(0, color=INK_MUTED, linewidth=0.8)
    ax_b.set_xticks(x)
    ax_b.set_xticklabels([textwrap.fill(c, 13) for c in crises], fontsize=8)
    ax_b.grid(axis="x", visible=False)
    ax_b.set_ylabel("Return from crisis start to trough (%)", color=INK)
    ax_b.set_title("What today's portfolio would have done", fontsize=11, color=INK, loc="left")
    ax_b.legend(frameon=False, fontsize=9, loc="lower left")

    # Diverging map: red = loss, grey midpoint = flat, blue = gain.
    cmap = LinearSegmentedColormap.from_list("div", ["#e34948", "#f0efec", "#2a78d6"])
    vals = hold.to_numpy(dtype=float)
    lim = np.nanmax(np.abs(vals)) or 1.0
    ax_h.imshow(vals, cmap=cmap, norm=TwoSlopeNorm(vmin=-lim, vcenter=0, vmax=lim), aspect="auto")
    for i in range(n_h):
        for j in range(n_c):
            v = vals[i, j]
            if np.isfinite(v):
                ax_h.text(j, i, f"{v:+.0f}%", ha="center", va="center", fontsize=8, color=INK)
    ax_h.set_xticks(range(n_c))
    ax_h.set_xticklabels([textwrap.fill(c, 13) for c in crises], fontsize=8)
    ax_h.set_yticks(range(n_h))
    ax_h.set_yticklabels(hold.index, fontsize=9)
    ax_h.tick_params(length=0, colors=INK_MUTED)
    for side in ax_h.spines.values():
        side.set_visible(False)
    ax_h.set_title("Each holding's return in each crisis (blue = protected you)", fontsize=11,
                   color=INK, loc="left")
    fig.suptitle("Crisis replay: today's weights, actual historical prices", fontsize=13, color=INK)
    fig.tight_layout(rect=(0, 0, 1, 0.94))
    fig.savefig(path, dpi=130)
    plt.close(fig)
    log.info("Saved %s", path)


def log_portfolio_report(scen: pd.DataFrame, hold: pd.DataFrame, info: dict, cfg: Config) -> None:
    """Plain-English summary of the portfolio stress test."""
    t = scen.set_index("scenario")
    today, cc, full, worst = (t.iloc[i] for i in range(4))
    log.info("PORTFOLIO STRESS TEST (today = %d days to %s; crisis = %s -> %s; history from %s)",
             cfg.window, info["today_end"].date(), info["crisis_start"].date(),
             info["crisis_end"].date(), info["history_start"].date())
    log.info("  Holdings: %d (effectively %.1f after weighting)", info["n"], info["weight_effective_n"])
    log.info("  Diversification today: behaves like %.1f independent bets (avg correlation %.2f)",
             today["independent_bets"], today["avg_corr"])
    log.info("  Today:                 vol %5.1f%%/yr | 1-in-20 bad day %5.1f%% | bad month %5.1f%%",
             today["portfolio_vol_%"], today["bad_day_1in20_%"], today["bad_month_1in20_%"])
    log.info("  Crisis correlations:   vol %5.1f%%/yr (%+.0f%%) | bets %.1f | correlation %.2f",
             cc["portfolio_vol_%"], 100 * (cc["portfolio_vol_%"] / today["portfolio_vol_%"] - 1),
             cc["independent_bets"], cc["avg_corr"])
    log.info("  Full crisis repeat:    vol %5.1f%%/yr | 1-in-20 bad day %5.1f%% | bad month %5.1f%%",
             full["portfolio_vol_%"], full["bad_day_1in20_%"], full["bad_month_1in20_%"])
    log.info("  Worst case (corr = 1): vol %5.1f%%/yr", worst["portfolio_vol_%"])
    top = hold.head(3)
    log.info("  Biggest risk sources: %s", "; ".join(
        f"{tk} {r['weight_%']:.0f}% of money -> {r['risk_share_today_%']:.0f}% of risk"
        for tk, r in top.iterrows()))
    div = hold.sort_values("corr_to_portfolio_today").head(3)
    log.info("  Best diversifiers today (lowest correlation to the portfolio): %s", "; ".join(
        f"{tk} {r['corr_to_portfolio_today']:+.2f} (crisis {r['corr_to_portfolio_crisis']:+.2f})"
        for tk, r in div.iterrows()))
    log.info("  Note: bad-day/month figures assume normal returns and understate real crash "
             "tails; see the crisis replay below for actual historical losses.")


def plot_portfolio(scen: pd.DataFrame, hold: pd.DataFrame, info: dict, cfg: Config, path: Path) -> None:
    """Three panels: money vs risk share, portfolio vol by scenario, correlation today vs crisis."""
    n = len(hold)
    fig, axes = plt.subplots(1, 3, figsize=(18, max(5.0, 0.38 * n + 2)),
                             gridspec_kw={"width_ratios": [1.2, 1, 1.2]})
    ax_r, ax_s, ax_c = axes
    for ax in axes:
        _style_axis(ax)

    order = hold.sort_values("risk_share_today_%")
    y = np.arange(n)
    ax_r.barh(y + 0.2, order["weight_%"], height=0.38, color="#9ec5f4", label="Share of money")
    ax_r.barh(y - 0.2, order["risk_share_today_%"], height=0.38, color="#2a78d6",
              label="Share of risk (today)")
    ax_r.set_yticks(y)
    ax_r.set_yticklabels(order.index, fontsize=9)
    ax_r.axvline(0, color=INK_MUTED, linewidth=0.8)
    ax_r.grid(axis="y", visible=False)
    ax_r.set_xlabel("%", color=INK)
    ax_r.set_title("Where your risk really comes from", fontsize=11, color=INK, loc="left")
    ax_r.legend(frameon=False, fontsize=9, loc="lower right")

    names = ["Today", "Crisis\ncorrelations", "Full crisis\nrepeat", "All corr = 1"]
    vals = scen["portfolio_vol_%"].to_numpy()
    bars = ax_s.bar(np.arange(len(vals)), vals, color=["#2a78d6", "#eb6834", "#e34948", "#6b6b6b"],
                    width=0.6)
    for b, v, bets in zip(bars, vals, scen["independent_bets"]):
        ax_s.text(b.get_x() + b.get_width() / 2, v, f"{v:.1f}%\n{bets:.1f} bets", ha="center",
                  va="bottom", fontsize=9, color=INK)
    ax_s.set_xticks(np.arange(len(vals)))
    ax_s.set_xticklabels(names, fontsize=9)
    ax_s.grid(axis="x", visible=False)
    ax_s.set_ylim(0, vals.max() * 1.25)
    ax_s.set_ylabel("Portfolio volatility (%/yr)", color=INK)
    ax_s.set_title(f"Same portfolio, different regimes (crisis = window to "
                   f"{info['crisis_end']:%Y-%m-%d})", fontsize=11, color=INK, loc="left")

    order_c = hold.sort_values("corr_to_portfolio_today")
    yc = np.arange(n)
    ax_c.hlines(yc, order_c["corr_to_portfolio_today"], order_c["corr_to_portfolio_crisis"],
                color=GRID, linewidth=2)
    ax_c.plot(order_c["corr_to_portfolio_today"], yc, "o", color="#2a78d6", markersize=8,
              markeredgecolor="white", label="Today")
    ax_c.plot(order_c["corr_to_portfolio_crisis"], yc, "o", color="#e34948", markersize=8,
              markeredgecolor="white", label="Crisis correlations")
    ax_c.axvline(0, color=INK_MUTED, linewidth=0.8)
    ax_c.set_yticks(yc)
    ax_c.set_yticklabels(order_c.index, fontsize=9)
    ax_c.grid(axis="y", visible=False)
    ax_c.set_xlim(-1, 1)
    ax_c.set_xlabel("Correlation with the rest of the portfolio", color=INK)
    ax_c.set_title("Which holdings actually diversify (left = better)", fontsize=11, color=INK,
                   loc="left")
    ax_c.legend(frameon=False, fontsize=9, loc="lower left")

    fig.suptitle(f"Portfolio stress test: {info['n']} holdings, behaving like "
                 f"{scen['independent_bets'].iloc[0]:.1f} independent bets today",
                 fontsize=13, color=INK)
    fig.tight_layout(rect=(0, 0, 1, 0.94))
    fig.savefig(path, dpi=130)
    plt.close(fig)
    log.info("Saved %s", path)


def run_portfolio(cfg: Config, portfolio_path: Path, synthetic: bool,
                  crisis_date: str | None = None) -> dict:
    """Load holdings from a CSV, then run the stress test (see run_portfolio_weights)."""
    weights = load_portfolio(portfolio_path)
    log.info("Loaded %d holdings from %s", len(weights), portfolio_path)
    return run_portfolio_weights(cfg, weights, synthetic, crisis_date)


def run_portfolio_weights(cfg: Config, weights: pd.Series, synthetic: bool = False,
                          crisis_date: str | None = None) -> dict:
    """Stress test + crisis replay for given weights; writes outputs/portfolio/.

    Returns a dict with the tables (scenarios, holdings, info, replay, replay_holdings)
    and the paths of the two charts (report_png, crises_png).
    """
    weights = weights[weights != 0] / weights.sum()
    outdir = cfg.outdir / "portfolio"
    outdir.mkdir(parents=True, exist_ok=True)
    tickers = list(weights.index)
    if not synthetic:
        try:
            extra = proxy_tickers(tickers) if cfg.use_proxies else []
            prices = download_prices(cfg, tickers=tickers + extra,
                                     cache_name="prices_cache_portfolio.csv")
        except DataDownloadError as exc:
            log.error("%s -> falling back to SYNTHETIC data", exc)
            synthetic = True
    if synthetic:
        log.warning("Using SYNTHETIC prices: the portfolio numbers are illustrative only")
        syn_cfg = Config(universe={"Portfolio": tickers}, start=cfg.start, end=cfg.end,
                         seed=cfg.seed, market_ticker=cfg.market_ticker)
        prices, _ = generate_synthetic_prices(syn_cfg)
    if cfg.use_proxies:
        spliced, notes = splice_proxies(prices, tickers)
        spliced[cfg.market_ticker] = prices[cfg.market_ticker]
        prices = spliced
        for line in describe_proxies(notes):
            log.info("  Longer history via proxy: %s", line)
    px, weights = prepare_portfolio_prices(prices, weights, cfg)
    scen, hold, info = portfolio_stress(px, weights, cfg, crisis_date)
    replay, replay_hold = crisis_replay(px, weights, cfg)
    scen.to_csv(outdir / "portfolio_scenarios.csv", index=False, float_format="%.3f")
    hold.to_csv(outdir / "portfolio_holdings.csv", float_format="%.3f")
    log.info("Saved %s and %s", outdir / "portfolio_scenarios.csv", outdir / "portfolio_holdings.csv")
    log_portfolio_report(scen, hold, info, cfg)
    plot_portfolio(scen, hold, info, cfg, outdir / "portfolio_report.png")
    replay.to_csv(outdir / "portfolio_crises.csv", index=False, float_format="%.3f")
    replay_hold.to_csv(outdir / "portfolio_crisis_holdings.csv", float_format="%.3f")
    log.info("Saved %s and %s", outdir / "portfolio_crises.csv",
             outdir / "portfolio_crisis_holdings.csv")
    log_crisis_replay(replay, cfg)
    plot_crisis_replay(replay, replay_hold, cfg, outdir / "portfolio_crises.png")
    return {"scenarios": scen, "holdings": hold, "info": info, "replay": replay,
            "replay_holdings": replay_hold, "synthetic": synthetic,
            "report_png": outdir / "portfolio_report.png",
            "crises_png": outdir / "portfolio_crises.png"}


# ----------------------------------------------------------------------------------------
# Pipeline / CLI
# ----------------------------------------------------------------------------------------


def run(cfg: Config, synthetic: bool) -> pd.DataFrame:
    """Run the full pipeline and write every output. Returns the metrics DataFrame."""
    cfg.outdir.mkdir(parents=True, exist_ok=True)
    stress = None
    if not synthetic:
        try:
            prices = download_prices(cfg)
        except DataDownloadError as exc:
            log.error("%s -> falling back to SYNTHETIC data", exc)
            synthetic = True
    if synthetic:
        log.warning("Using SYNTHETIC one-factor data; dates and events are illustrative only")
        prices, stress = generate_synthetic_prices(cfg)

    returns, market = clean_prices(prices, cfg)
    metrics, corr = compute_metrics(returns, market, cfg)
    if stress is not None:
        check_regime_response(metrics, stress, cfg)

    tickers = list(returns.columns)
    metrics = metrics.join(forward_outcomes(market, metrics.index, cfg.horizons))
    metrics_path = cfg.outdir / "metrics.csv"
    metrics.to_csv(metrics_path, float_format="%.6f")
    log.info("Saved %s", metrics_path)

    calm, panic = metrics["avg_corr"].idxmin(), metrics["avg_corr"].idxmax()
    last = metrics.iloc[-1]
    log.info("Calmest window %s (avg ρ %.2f) | most panicked %s (avg ρ %.2f)", calm.date(),
             metrics.at[calm, "avg_corr"], panic.date(), metrics.at[panic, "avg_corr"])
    log.info("Latest %s: avg ρ %.2f, λ1 %.1f (%.0f%%), MP bound %.2f, z %.2f, panic=%s",
             metrics.index[-1].date(), last.avg_corr, last.top_eig, 100 * last.top_eig_share,
             last.mp_bound, last.avg_corr_z, bool(last.panic))
    log.info("Windows flagged as panic (%s z > %.1f): %d of %d", cfg.z_label, cfg.z_threshold,
             int(metrics["panic"].sum()), len(metrics))
    for s, e in _runs(metrics["panic"]):
        run_ = metrics.loc[s:e]
        run_ = run_[run_["panic"]]
        log.info("  panic period: %s -> %s (peak avg ρ %.2f)", s.date(),
                 run_.index[-1].date(), run_["avg_corr"].max())

    summary = summarize_forward(metrics, cfg)
    summary.to_csv(cfg.outdir / "forward_analysis.csv", index=False, float_format="%.3f")
    log.info("Saved %s", cfg.outdir / "forward_analysis.csv")
    log_forward_summary(summary, cfg)
    plot_forward(summary, cfg, cfg.outdir / "forward_analysis.png")

    log.info("Computing %d network layouts...", len(metrics))
    layouts = compute_layouts(corr, tickers, cfg.seed)
    lim = 1.08 * max(np.abs(np.array(list(p.values()))).max() for p in layouts)

    plot_tracking(metrics, market, cfg, cfg.outdir / "tracking.png")
    plot_snapshots(metrics, corr, layouts, tickers, cfg, cfg.outdir / "snapshots.png")
    if cfg.make_gif:
        make_animation(metrics, corr, layouts, tickers, cfg, lim, cfg.outdir / "network.gif")
    return metrics


def self_test(cfg: Config) -> None:
    """Synthetic-data self-test of the metric pipeline (no plots)."""
    prices, stress = generate_synthetic_prices(cfg)
    returns, market = clean_prices(prices, cfg)
    metrics, _ = compute_metrics(returns, market, cfg)
    check_regime_response(metrics, stress, cfg)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Market panic detector via rolling correlation networks.")
    p.add_argument("--window", type=int, default=90, help="rolling window, trading days (default 90)")
    p.add_argument("--step", type=int, default=5, help="step between windows, trading days (default 5)")
    p.add_argument("--universe", choices=sorted(UNIVERSES), default="stocks",
                   help="stocks: 41 large caps since 2017; etfs: 9 sector ETFs since 1999")
    p.add_argument("--threshold", type=float, default=None,
                   help="edge threshold on correlation (default 0.5 stocks, 0.8 etfs)")
    p.add_argument("--mst", action="store_true", help="draw the minimum spanning tree instead of a threshold graph")
    p.add_argument("--z-threshold", type=float, default=1.5, help="panic flag z-score threshold (default 1.5)")
    p.add_argument("--z-mode", choices=["rolling", "expanding"], default="rolling",
                   help="panic baseline: trailing window or all history (default rolling)")
    p.add_argument("--z-lookback-days", type=int, default=504,
                   help="rolling baseline length in trading days (default 504 = ~2 years)")
    p.add_argument("--z-min-days", type=int, default=252,
                   help="history needed before the panic flag can fire (default 252)")
    p.add_argument("--start", default=None, help="start date (default 2017-01-01 stocks, 1999-01-01 etfs)")
    p.add_argument("--end", default=None, help="end date (default today)")
    p.add_argument("--report", type=Path, default=None,
                   help="holdings CSV in portfolios/my/: build today's daily report")
    p.add_argument("--open", action="store_true", help="--report: open the report in the browser")
    p.add_argument("--compare", type=Path, nargs="+", default=None,
                   help="folder(s) or CSV files of candidate portfolios to compare side by side")
    p.add_argument("--portfolio", type=Path, default=None,
                   help="holdings CSV (ticker,weight): run the portfolio stress test instead")
    p.add_argument("--no-proxies", action="store_true",
                   help="portfolio/compare: use only each ETF's own history (no look-alike funds)")
    p.add_argument("--crisis-date", default=None,
                   help="portfolio test: use the window ending nearest this date as the crisis "
                        "(default: the most correlated window in the holdings' history)")
    p.add_argument("--synthetic", action="store_true", help="use synthetic one-factor data and run the self-test")
    p.add_argument("--self-test", action="store_true", help="run the synthetic self-test only and exit")
    p.add_argument("--refresh", action="store_true", help="ignore the price cache and re-download")
    p.add_argument("--cache-hours", type=float, default=12.0,
                   help="re-download saved prices older than this many hours (default 12)")
    p.add_argument("--no-gif", action="store_true", help="skip the (slow) GIF animation")
    p.add_argument("--gif-stride", type=int, default=None,
                   help="use every k-th window as a GIF frame (default: auto, ~240 frames)")
    p.add_argument("--fps", type=int, default=12, help="GIF frames per second (default 12)")
    p.add_argument("--outdir", type=Path, default=Path("outputs"), help="output directory (default ./outputs)")
    p.add_argument("--cache-dir", type=Path, default=Path("data"), help="price cache directory (default ./data)")
    p.add_argument("-v", "--verbose", action="store_true", help="debug logging")
    return p.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO,
                        format="%(asctime)s %(levelname)-7s %(message)s", datefmt="%H:%M:%S")
    for noisy in ("matplotlib", "PIL", "yfinance", "peewee", "urllib3"):
        logging.getLogger(noisy).setLevel(logging.WARNING)

    defaults = UNIVERSE_DEFAULTS[args.universe]
    outdir = args.outdir if args.universe == "stocks" else args.outdir / args.universe
    cfg = Config(universe=dict(UNIVERSES[args.universe]), universe_name=args.universe,
                 start=args.start or ("1990-01-01" if (args.compare or args.portfolio)
                                      else str(defaults["start"])),
                 end=args.end,
                 window=args.window, step=args.step,
                 threshold=args.threshold if args.threshold is not None else float(defaults["threshold"]),
                 mst=args.mst, z_threshold=args.z_threshold,
                 z_mode=args.z_mode, z_lookback_days=args.z_lookback_days,
                 z_min_days=args.z_min_days,
                 outdir=outdir, cache_dir=args.cache_dir, refresh=args.refresh,
                 max_cache_age_hours=args.cache_hours,
                 make_gif=not args.no_gif, gif_stride=args.gif_stride, fps=args.fps,
                 use_proxies=not args.no_proxies)
    if cfg.window < 10 or cfg.step < 1:
        log.error("window must be >= 10 and step >= 1")
        return 2
    if cfg.window <= len(cfg.tickers):
        log.warning("window (%d) <= number of stocks (%d): correlation matrix is rank-deficient",
                    cfg.window, len(cfg.tickers))

    try:
        if args.self_test:
            self_test(cfg)
        elif args.report:
            from report import run_report  # local module, imported lazily
            run_report(cfg, args.report, synthetic=args.synthetic, open_browser=args.open)
        elif args.compare:
            from compare import run_compare  # local module, imported lazily
            run_compare(cfg, args.compare, synthetic=args.synthetic)
        elif args.portfolio:
            run_portfolio(cfg, args.portfolio, synthetic=args.synthetic,
                          crisis_date=args.crisis_date)
        else:
            run(cfg, synthetic=args.synthetic)
    except AssertionError as exc:
        log.error("Self-test FAILED: %s", exc)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

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
    python panic_detector.py --help

Outputs (in ./outputs/ by default):
    metrics.csv, tracking.png, snapshots.png, network.gif
"""
from __future__ import annotations

import argparse
import logging
import math
import sys
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path

import matplotlib

matplotlib.use("Agg")  # headless backend: we only save files

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
    outdir: Path = Path("outputs")
    cache_dir: Path = Path("data")
    refresh: bool = False  # ignore cache and re-download
    make_gif: bool = True
    gif_stride: int = 1  # use every k-th window as a GIF frame (1 = every window step)
    fps: int = 8

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
    return cfg.cache_dir / "prices_cache.csv"


def download_prices(cfg: Config) -> pd.DataFrame:
    """Download auto-adjusted closes for the universe plus the market ticker, with CSV cache.

    The cache is reused if it contains every requested ticker and covers the requested
    start date. Use ``--refresh`` to force a new download (e.g. to pick up recent days).
    """
    wanted = cfg.tickers + [cfg.market_ticker]
    path = _cache_path(cfg)
    if path.exists() and not cfg.refresh:
        cached = pd.read_csv(path, index_col=0, parse_dates=True)
        covers_start = cached.index.min() <= pd.Timestamp(cfg.start) + pd.Timedelta(days=7)
        if set(wanted).issubset(cached.columns) and covers_start:
            log.info("Loaded cached prices from %s (%d rows, last %s)", path, len(cached),
                     cached.index.max().date())
            out = cached[wanted]
            if cfg.end:
                out = out.loc[: cfg.end]
            return out.loc[cfg.start:]
        log.info("Cache at %s does not cover the request; re-downloading", path)

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

    cfg.cache_dir.mkdir(parents=True, exist_ok=True)
    close.to_csv(path)
    log.info("Cached prices to %s", path)
    return close


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
    log.info("Clean data: %d stocks x %d daily returns (%s -> %s)", rets.shape[1], len(rets),
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
    plus avg_corr_z (z-score vs. a trailing baseline) and panic (bool flag).

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
    sizes = 30 + 170 * deg / max(deg.max(), 1) if mst else 30 + 3 * deg
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
        ax_px.text(ts, 0.97 - 0.07 * (k % 2), f" {label}", transform=ax_px.get_xaxis_transform(),
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
    frames = list(range(0, len(metrics), max(1, cfg.gif_stride)))
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
    log.info("Rendering GIF with %d frames (this can take a minute)...", len(frames))
    anim.save(path, writer=PillowWriter(fps=cfg.fps), dpi=72)
    plt.close(fig)
    log.info("Saved %s", path)


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
    p.add_argument("--threshold", type=float, default=0.5, help="edge threshold on correlation (default 0.5)")
    p.add_argument("--mst", action="store_true", help="draw the minimum spanning tree instead of a threshold graph")
    p.add_argument("--z-threshold", type=float, default=1.5, help="panic flag z-score threshold (default 1.5)")
    p.add_argument("--z-mode", choices=["rolling", "expanding"], default="rolling",
                   help="panic baseline: trailing window or all history (default rolling)")
    p.add_argument("--z-lookback-days", type=int, default=504,
                   help="rolling baseline length in trading days (default 504 = ~2 years)")
    p.add_argument("--z-min-days", type=int, default=252,
                   help="history needed before the panic flag can fire (default 252)")
    p.add_argument("--start", default="2017-01-01", help="start date (default 2017-01-01)")
    p.add_argument("--end", default=None, help="end date (default today)")
    p.add_argument("--synthetic", action="store_true", help="use synthetic one-factor data and run the self-test")
    p.add_argument("--self-test", action="store_true", help="run the synthetic self-test only and exit")
    p.add_argument("--refresh", action="store_true", help="ignore the price cache and re-download")
    p.add_argument("--no-gif", action="store_true", help="skip the (slow) GIF animation")
    p.add_argument("--gif-stride", type=int, default=1, help="use every k-th window as a GIF frame (default 1)")
    p.add_argument("--fps", type=int, default=8, help="GIF frames per second (default 8)")
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

    cfg = Config(start=args.start, end=args.end, window=args.window, step=args.step,
                 threshold=args.threshold, mst=args.mst, z_threshold=args.z_threshold,
                 z_mode=args.z_mode, z_lookback_days=args.z_lookback_days,
                 z_min_days=args.z_min_days,
                 outdir=args.outdir, cache_dir=args.cache_dir, refresh=args.refresh,
                 make_gif=not args.no_gif, gif_stride=args.gif_stride, fps=args.fps)
    if cfg.window < 10 or cfg.step < 1:
        log.error("window must be >= 10 and step >= 1")
        return 2
    if cfg.window <= len(cfg.tickers):
        log.warning("window (%d) <= number of stocks (%d): correlation matrix is rank-deficient",
                    cfg.window, len(cfg.tickers))

    try:
        if args.self_test:
            self_test(cfg)
        else:
            run(cfg, synthetic=args.synthetic)
    except AssertionError as exc:
        log.error("Self-test FAILED: %s", exc)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

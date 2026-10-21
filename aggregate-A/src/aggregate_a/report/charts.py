"""Static PNG charts (matplotlib). Small multiples: one panel per unit family, never dual axes."""

from __future__ import annotations

from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.dates as mdates  # noqa: E402
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

# Validated default categorical palette (first three slots validate all-pairs).
SERIES = ["#2a78d6", "#eb6834", "#1baf7a"]
INK, INK2, MUTED, GRID, SURFACE = "#0b0b0b", "#52514e", "#898781", "#e1e0d9", "#fcfcfb"
SHADE = "#d03b3b"

PANELS = [
    ("Merton A, CAPE ERP", ["merton_cape_vix", "merton_cape_har", "merton_cape_garch"], "A"),
    ("Merton A, Damodaran ERP", ["merton_dam_vix", "merton_dam_har"], "A"),
    ("Variance-ratio / VRP-implied A", ["vr_martin_har", "vr_martin_garch", "vrp_esscher"], "A"),
    ("Cross-checks (z-scores, expanding window)", ["vrp_z", "credit_baa_z", "credit_hy_z"], "z"),
]


def layer1_chart(est: pd.DataFrame, crises: list[dict], path: Path, title: str) -> Path:
    fig, axes = plt.subplots(len(PANELS), 1, figsize=(12, 13), sharex=True, facecolor=SURFACE)
    for ax, (ptitle, cols, unit) in zip(axes, PANELS, strict=True):
        ax.set_facecolor(SURFACE)
        for c in crises:
            ax.axvspan(pd.Timestamp(c["start"]), pd.Timestamp(c["end"]), color=SHADE,
                       alpha=0.08, lw=0)
        vals = []
        for color, col in zip(SERIES, cols, strict=False):
            if col not in est or est[col].notna().sum() == 0:
                continue
            s = est[col]
            ax.plot(s.index, s.to_numpy(), lw=1.2, color=color, label=col)
            vals.append(s.dropna().to_numpy())
        if vals:
            v = np.concatenate(vals)
            lo, hi = np.nanpercentile(v, [0.5, 99.5])
            pad = 0.05 * (hi - lo)
            ax.set_ylim(lo - pad, hi + pad)
        if unit == "A":
            ax.axhspan(1, 15, color=GRID, alpha=0.35, lw=0, zorder=0)
            ax.axhline(0, color=MUTED, lw=0.6)
        else:
            ax.axhline(0, color=MUTED, lw=0.6)
        ax.set_title(ptitle, loc="left", fontsize=11, color=INK)
        ax.set_ylabel(unit, color=INK2)
        ax.grid(axis="y", color=GRID, lw=0.6)
        for side in ("top", "right"):
            ax.spines[side].set_visible(False)
        for side in ("left", "bottom"):
            ax.spines[side].set_color(GRID)
        ax.tick_params(colors=INK2, labelsize=9)
        ax.legend(loc="upper left", fontsize=8, frameon=False, ncols=3, labelcolor=INK2)
    axes[-1].xaxis.set_major_locator(mdates.YearLocator(2))
    axes[-1].xaxis.set_major_formatter(mdates.DateFormatter("%Y"))
    fig.suptitle(title, x=0.01, ha="left", fontsize=13, color=INK)
    fig.text(0.01, 0.005, "Red shading: fear episodes from config.yaml. Grey band: A in [1, 15]. "
             "y-axes clipped to the 0.5–99.5th percentile.", fontsize=8, color=MUTED)
    fig.tight_layout(rect=(0, 0.01, 1, 0.98))
    path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(path, dpi=110, facecolor=SURFACE)
    plt.close(fig)
    return path

# Sources and verification status

Status key:
- **checked**: confirmed in this build by a web search against the publisher or author page.
- **memory**: a standard reference, cited from memory with high confidence. Not re-checked against the publication in this build.
- **UNVERIFIED**: a specific claim (formula detail, data availability) that could not be confirmed. Treat it with caution.

## Data

| Source | Used for | Status | Notes |
|---|---|---|---|
| FRED API `series/observations`; fallback `fredgraph.csv` | DTB3, DGS10, VIXCLS, EXPINF1YR, BAMLH0A0HYM2, BAA10Y | memory | Official FRED channels. A key is optional because of the CSV fallback. |
| FRED ICE BofA history truncated to a rolling ~3 years since April 2026 | `credit_hy_z` baseline | **UNVERIFIED** | Reported by third-party mirrors (eco3min.fr, govspending.org), not seen on an official FRED notice. |
| Shiller `ie_data.xls` (shillerdata.com; Yale mirror) | CAPE | checked (location, secondary) | Its CDN link changes, so the code follows the link found on the landing page. |
| Damodaran `histimpl.xls` (pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/histimpl.html) | implied ERP | checked | Annual, year-end. The monthly series is not used. |
| Cboe `VIX_History.csv` | VIX backup | memory | The CSV column layout is asserted by a network test. |
| yfinance `^GSPC` | OHLC prices | memory | Unofficial Yahoo client, used because the spec asked for it. Personal-use terms. |
| Bekaert–Engstrom–Xu risk-aversion index (nancyxu.net/risk-aversion-index) | validation benchmark (Step 2) | **UNVERIFIED** | The URL is cited in the NBER working paper; the page has not been checked live. |

## Methods

| Reference | Used for | Status |
|---|---|---|
| Merton (1969) REStat 51(3); Merton (1971) JET 3(4) | A = ERP/σ² | memory |
| Campbell & Shiller (1998) J. Portfolio Management | CAPE predicts long-run returns | memory |
| Damodaran implied ERP methodology | ERP over the T-bond | checked (data page) |
| Martin (2017) QJE 132(1), "What is the Expected Return on the Market?" | SVIX lower bound on ERP | checked (claim); **UNVERIFIED** whether the bound multiplies or divides by R_f (effect < 0.5% at 30 days) |
| VIX² ≥ SVIX² (VIX overweights the left tail) | direction of the Martin approximation bias | **UNVERIFIED** |
| Cboe VIX white paper: VIX = 100·√(annualized 30-day risk-neutral variance) | σ²_Q | memory |
| Garman & Klass (1980) J. Business 53(1) | daily range-based variance | memory (formula unit-tested for unbiasedness on simulated Brownian bars) |
| Corsi (2009) J. Financial Econometrics 7(2) | HAR-RV | memory |
| Glosten, Jagannathan & Runkle (1993) J. Finance 48(5) | GJR-GARCH; weak risk–return relation | memory |
| Bollerslev, Tauchen & Zhou (2009) RFS 22(11) | VRP as a risk-aversion proxy | memory |
| Bakshi & Madan (2006) Management Science 52(12):1945–1956 | volatility-spread theory (form of the VRP–moments link) | checked (publication); **UNVERIFIED** (exact Theorem 1 coefficients). We use our own derivation, which is tested. |
| Esscher (1932); Gerber & Shiu (1994) | exponential tilting = power-utility pricing kernel | memory |
| Mehra & Prescott (1985) J. Monetary Economics | context for plausible A | memory |
| T-bill bond-equivalent yield 365d/(360 − d·t) | DTB3 conversion | memory |

## Project assumptions (ours, not literature)

- The 1-month Shiller publication lag and the 5-day Damodaran availability lag.
- Adding the daily term spread to Damodaran's annual ERP.
- 1/CAPE used as the *level* of expected real return.
- Crisis and calm windows in `config.yaml`.
- Filtered-historical-simulation physical density for the Esscher estimator (5-year window).
- The [1, 15] plausibility band, which comes from the project spec.

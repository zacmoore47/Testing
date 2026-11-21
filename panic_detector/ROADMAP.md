# Panic Detector Roadmap

Goal: turn `panic_detector.py` from a chart of past correlations into a tool that helps
someone make better risk decisions, and test honestly whether it does.

**Guiding principle:** correlation is good at telling you whether diversification is working
and whether risk is likely to stay high. It is weak at timing the market: flags tend to fire
mid-crash or near the bottom. Build towards the first use and test before claiming anything.

## Done so far
- [x] Rolling correlation, top eigenvalue, Marchenko-Pastur bound, network plots, GIF
- [x] Panic flag uses a rolling 2-year z-score with a prior-only baseline (no look-ahead)
- [x] Default start 2017 so the flag is warmed up before COVID
- [x] Snapshot panels deduplicated and zoomed to fit; GIF playback speed fixed

## Phase 1: Prove whether it works  ✅ DONE
- [x] **1a. Longer, survivorship-free history:** `--universe etfs` (9 original sector SPDRs, 1999+)
- [x] **1b. Forward-outcome study:** `forward_analysis.csv/png`, comparing flag ON/OFF,
      correlation quintiles and a plain volatility flag
- [x] Verdict recorded below
- [ ] Optional cross-check: run the forward study on the stock universe (2017+)

### Phase 1 verdict (ETF universe, 1999-2026, 15 flag episodes)
| Question | Answer | Confidence |
|---|---|---|
| Risk gauge? | **Yes, moderately.** Forward 1m SPY vol rises steadily Q1→Q5: 13.1, 13.8, 15.3, 17.0, 21.0%; P(1m drawdown >10%) 3.0% → 9.4% | High (smooth staircase, 20-70 blocks per quintile) |
| Market-timing tool? | **No.** High correlation came before *higher* 3m returns (Q5 +3.3% vs Q1 +0.9%; flag ON +5.0% vs OFF +2.0%), so selling on it would have hurt | Direction: medium. Size: low (15 episodes) |
| Does the corr flag beat a plain volatility flag? | **No.** P(3m drawdown >10%): corr flag ON 21% vs OFF 22%; vol flag ON 34.5% vs OFF 19.4% | Medium |
| Early-warning edge? | **Possible, in combination.** Vol high and corr normal: worst case (3m return −1.1%, P(DD>10%) 55%; likely sector-driven bear markets like 2000-02). Corr high and vol normal: elevated forward vol (1m 24.5% vs 16.1% average) | Low (11-14 episodes): a hypothesis only |

**Conclusion:** use it to measure diversification and risk regime, never as a sell signal.
**Plan change:** Phase 3a moves next; Phase 2 is refocused on a combined correlation +
volatility regime model; Phase 3b (de-risking backtest) is deprioritised and should use
volatility, not correlation.

## Phase 2: Combined regime model (refocused after Phase 1; do after 3a)
- [ ] Combined correlation × volatility regimes (e.g. high vol + low corr = dispersed sell-off);
      test on ETF history with block-level significance (bootstrap over episodes)
- [ ] Exponentially weighted correlation (less lag, no "fake cliff" when old shocks leave the window)
- [ ] Absorption-ratio change (Kritzman et al. 2011) as an early-warning candidate
- [ ] Compare lead times across all Phase 1 stress episodes; keep only what helps

## Phase 3: Make it useful to a person  ← 3a DONE
- [x] **3a. Portfolio stress test:** `--portfolio holdings.csv`. First real run (example portfolio,
      Nov 2026): 13 holdings behave like 4.0 independent bets today, but only 1.5 under
      COVID correlations (vol +64% with no change in volatility). 7 tech names = 66% of money
      but about 90% of risk. XOM/KO/JNJ diversify today, but their correlation jumps to about 0.8 in a crisis;
      only TLT (bonds) diversified in COVID (−0.44)
      2022 inflation-shock test (window Feb-Jun 2022): bets 1.8, vol +48%. TLT's hedge vanished
      (crisis corr −0.44 in 2020 → +0.03 in 2022) while XOM/KO held up better (+0.27/+0.36 vs
      about 0.8 in 2020). Lesson: the hedge depends on the crisis type (deflationary → bonds, inflationary → energy).
      Limitation found: daily-return correlation misses shared downward drift (TLT ≈ 0 corr
      in 2022 but fell ~20% alongside stocks)
- [x] 3a+ Historical replay: actual portfolio and per-holding return, max drawdown, worst
      day and worst month inside each crisis window (captures drift that correlation misses)
- [x] 3a+ Multiple crisis scenarios in one report (2008, Q4 2018, COVID, 2022, 2025; skipped if outside history) (COVID 2020, 2022 inflation shock, 2025 tariffs):
      the crisis type matters (bonds hedged in 2020 but fell with stocks in 2022)
- [x] 3a+ Historical (non-normal) worst day / worst 21 days / max drawdown per crisis from the crisis window, since
      normal approximations understate crash tails
      **Replay results (example portfolio):** portfolio vs SPY: Q4 2018 −21.0% vs −19.3%,
      COVID −26.5% vs −33.7%, 2022 −28.2% vs −24.5%, 2025 −19.0% vs −18.8%. Despite 13
      holdings incl. gold/bonds, it beat SPY in only 1 of 4 crises (tech concentration).
      Hedges by crisis: TLT +14% COVID but −29% in 2022 (blind spot confirmed); XOM +60%
      in 2022 but −48% COVID; GLD the most consistent (between −7% and +5%). KO/JNJ held in the slow 2022
      bear but fell 25-37% in the COVID crash. Real worst day in COVID −9.9%.
- [ ] Polish: bar labels collide with drawdown markers when return ≈ drawdown
- [ ] Run on the user's own portfolio
- [ ] **3b. (Deprioritised) Honest backtest of a volatility-based de-risking rule** vs buy-and-hold: trading costs included,
      out-of-sample, explicit overfitting check

## Phase 4: Make it run itself (now part of S3/S4 above)
- [ ] Scheduled daily run on the Mac
- [ ] One-page daily summary (regime, weekly change, portfolio diversification health)
- [ ] Alert only when something changes (flag flips, sharp correlation jump)

## Decisions (Nov 2026)
- **Who it's for:** personal investing. The user is building a first portfolio, investing from the **US** (USD, US-listed ETFs).
- **Goal:** compare candidate portfolios → pick → track real holdings → daily report.
- **Interface:** a small local web app (Streamlit) for entering portfolios and holdings.
- **Updates:** via `git pull` (repo is public; project lives in `panic_detector/`).
- **Not a goal:** telling the user what to buy. Phase 1 showed the regime does not predict
  returns, so the tool shows trade-offs (growth vs bumpiness vs worst-case loss) and the user decides.

## Portfolio app track (current priority, replaces the old Phase 4 ordering)
- [x] **S0. Setup:** project moved into `panic_detector/`; user clones repo and uses `git pull`
- [x] **S1. Compare mode:** `--compare portfolios/candidates`; long-run growth/vol/max drawdown, crisis replay per portfolio,
      diversification today vs crisis, concentration; US ETF template portfolios; hindsight warning
      First real run (2011-01 → 2026-11, limited by VXUS): clear growth-vs-pain staircase:
      conservative 6.0%/yr, worst drop −18.9% | 60/40 7.2%, −22.3% | stocks+bonds+gold 8.2%, −22.5% |
      global stocks 10.1%, −34.4% | US stocks 12.9%, −35.0% | tech heavy 16.0%, −32.2%
      (worst 12m −30.9%, 24-month recovery). No mix was positive in any crisis; bonds cushioned
      fast crashes (COVID) far more than 2022. **Big caveat:** the window excludes 2000-02 and 2008,
      the two worst modern crashes, so all drops shown understate what is possible.
- [x] **S1+. Longer history via proxies:** splice older look-alike funds before an ETF existed
      (e.g. VXUS ← VEU/EFA, BND ← AGG) so comparisons include 2008 (and 2000-02 where possible)
      Real run from 2000-08 (all proxies worked): US stocks 8.1%/yr, worst −55.5%, 53-month
      recovery | global 7.1%, −57.5% | 60/40 6.2%, −36.9% | stocks+bonds+gold 7.4%, −35.4%,
      29 months | conservative 6.1%, −22.2% | tech heavy 8.1%, **−73.0%, 155-month recovery**.
      Start date changes rankings drastically (tech: best in 2011+ view, worst risk here).
      Robust across BOTH windows: bonds cut worst drops by about 1/3-1/2; stocks+bonds+gold beat 60/40
      on reward vs pain. Period caveats: gold started near a multi-decade low in 2000; bonds
      benefited from 40 years of falling rates.
- [x] **S1++. Rolling-window robustness:** `rolling.png`, `rolling_summary.csv`; results for every possible start date (e.g. all
      10-year periods): range of outcomes, worst 10-year result, how often each mix came out ahead.
      Directly tests start-date sensitivity
      Real run (start months 2000-08 → 2016-11 for 10y; ~3 truly separate decades):
      10-year worst / typical %/yr: US stocks −1.1 / 10.6 | global +0.7 / 8.7 | 60/40 +3.4 / 6.8 |
      **stocks+bonds+gold +4.9 / 8.1 (best worst-case of all six)** | conservative +3.9 / 6.6 |
      tech heavy −5.6 / 14.4 (came 1st in 87% of start months, but that is mostly one era, 2009-2021).
      5-year worst: SBG +1.3, conservative +2.8, 60/40 −0.7, US −6.3, tech −12.5 %/yr.
      No mix containing bonds lost money over any 5- or 10-year period since 2000.
- [x] Polish: overlapping end labels on the growth chart; long crisis labels on the heatmap
- [~] **S2. Web app (built, awaiting first real run):** `streamlit run app.py`; edit candidate portfolios in a table, run the comparison,
      enter real holdings (shares, amount invested, target weight, cash), saved locally
- [~] **S3. Daily report (built, awaiting first real run):** `--report portfolios/my/<file>.csv` or the app's Daily report page; HTML page with value, daily and total P&L, actual vs target mix
      and rebalance flags, market regime, diversification health, crisis exposure, alerts
      only on change; daily value history
- [x] **UI redesign:** minimal "quant desk" style: IBM Plex Sans/Mono, monochrome + one accent,
      no emojis, numeric sortable tables, interactive Altair charts (charts.py) with hover values;
      daily report HTML restyled to match
- [x] **Fresh data:** saved prices re-download when older than 12 h (`--cache-hours`), fall back
      to saved prices with a warning if offline; "Refresh prices" button; price date shown
- [x] **Rebalance calculator:** buy-only (minimises the largest shortfall in % points, never
      sells) or full rebalance; whole or fractional shares; never overspends (4,000 random
      plans tested); "I placed these trades" updates shares, cost basis and CASH
- [x] **Projections page:** circular block bootstrap (12-month blocks) of the portfolio's real
      monthly returns; fees, inflation (today's $), pessimism adjustment, goal probability;
      fan chart + milestones. Validated: constant return = savings formula exactly; bootstrap
      median matches history within ~0.1%/yr (a non-circular version was biased and replaced)
- [x] **Hedge finder page:** 14 common hedge ETFs + user tickers; return in the portfolio's
      worst 5% weeks, correlation, rise in crises where the portfolio lost, and the effect of
      holding X% (worst drop, volatility, growth cost); verdicts Hedge / Diversifier / No help
      validated on known synthetic cases (opposite mover, unrelated, same mover)
- [ ] **S4. Automation:** weekday-evening scheduled run on the Mac (launchd) + desktop notification

## Research track (later, optional)
- Phase 2 combined correlation × volatility regime model
- Phase 3b volatility-based de-risking backtest

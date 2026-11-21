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

## Phase 3: Make it useful to a person  ← 3a DONE, upgrades next
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
- [ ] 3a+ Historical replay: actual portfolio and per-holding return, max drawdown, worst
      day and worst month inside each crisis window (captures drift that correlation misses)
- [ ] 3a+ Multiple crisis scenarios in one report (COVID 2020, 2022 inflation shock, 2025 tariffs):
      the crisis type matters (bonds hedged in 2020 but fell with stocks in 2022)
- [ ] 3a+ Historical (non-normal) bad-day/bad-month estimates from the crisis window, since
      normal approximations understate crash tails
- [ ] **3b. (Deprioritised) Honest backtest of a volatility-based de-risking rule** vs buy-and-hold: trading costs included,
      out-of-sample, explicit overfitting check

## Phase 4: Make it run itself
- [ ] Scheduled daily run on the Mac
- [ ] One-page daily summary (regime, weekly change, portfolio diversification health)
- [ ] Alert only when something changes (flag flips, sharp correlation jump)

## Open question
Who is the tool for: personal investing, a portfolio/job project, or other users?
The answer changes how much to invest in Phase 3/4 (e.g. a web dashboard for other users).

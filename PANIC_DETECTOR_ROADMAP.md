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

## Phase 1: Prove whether it works  ← IN PROGRESS
- [ ] **1a. Longer, survivorship-free history:** `--universe etfs` uses the 9 original
      sector SPDR ETFs (XLK XLF XLE XLV XLI XLP XLY XLU XLB), daily since Dec 1998.
      This covers about 10 stress episodes (2000-02, 2008, 2011, 2015-16, 2018, 2020, 2022, 2025).
- [ ] **1b. Forward-outcome study:** for each window, measure SPY's next 1-month and
      3-month return, realised volatility, max drawdown and P(drawdown worse than 10%).
      Compare correlation flag ON vs OFF, by z-score quintile, and against a plain
      volatility flag (does correlation add anything beyond volatility?).
- [ ] Interpret the results and write down the verdict: risk tool, early-warning tool,
      or just a visual?

Prediction before testing: flags predict higher future volatility, but not lower returns.

## Phase 2: Make the signal timelier (only if Phase 1 justifies it)
- [ ] Exponentially weighted correlation (less lag, no "fake cliff" when old shocks leave the window)
- [ ] Absorption-ratio change (Kritzman et al. 2011) as an early-warning candidate
- [ ] Compare lead times across all Phase 1 stress episodes; keep only what helps

## Phase 3: Make it useful to a person
- [ ] **3a. Portfolio stress test:** input a holdings CSV, then report the effective
      number of independent bets, portfolio volatility now vs under crisis correlations
      (e.g. March 2020), and which holdings actually diversify
- [ ] **3b. Honest backtest of a de-risking rule** vs buy-and-hold: trading costs included,
      out-of-sample, explicit overfitting check

## Phase 4: Make it run itself
- [ ] Scheduled daily run on the Mac
- [ ] One-page daily summary (regime, weekly change, portfolio diversification health)
- [ ] Alert only when something changes (flag flips, sharp correlation jump)

## Open question
Who is the tool for: personal investing, a portfolio/job project, or other users?
The answer changes how much to invest in Phase 3/4 (e.g. a web dashboard for other users).

"""
app.py - Portfolio Lab: a small local web app around the panic detector.

Start it from the panic_detector folder:
    streamlit run app.py
It opens in your browser at http://localhost:8501. Everything stays on your computer:
portfolios are saved as CSV files in portfolios/, results in outputs/.

Pages:
    Compare portfolios - create/edit candidate mixes and compare them side by side
    My portfolio       - enter what you actually own, value it, and stress-test it
"""
from __future__ import annotations

import logging
import re
from pathlib import Path

import pandas as pd
import streamlit as st

import compare
import holdings as hd
import panic_detector as pdx

BASE = Path(__file__).resolve().parent
CAND_DIR = BASE / "portfolios" / "candidates"
MY_DIR = BASE / "portfolios" / "my"
NEW = "➕ New portfolio"

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)-7s %(message)s",
                    datefmt="%H:%M:%S")
for noisy in ("matplotlib", "PIL", "yfinance", "peewee", "urllib3"):
    logging.getLogger(noisy).setLevel(logging.WARNING)

st.set_page_config(page_title="Portfolio Lab", page_icon="📈", layout="wide")


# ---------------------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------------------


def make_cfg(use_proxies: bool = True) -> pdx.Config:
    return pdx.Config(start="1990-01-01", use_proxies=use_proxies,
                      outdir=BASE / "outputs", cache_dir=BASE / "data")


def slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", name.strip().lower()).strip("_") or "portfolio"


def candidate_files() -> dict[str, Path]:
    CAND_DIR.mkdir(parents=True, exist_ok=True)
    return {compare.portfolio_name(p): p for p in sorted(CAND_DIR.glob("*.csv"))}


def read_weights(path: Path) -> pd.DataFrame:
    w = pdx.load_portfolio(path, min_holdings=1)
    return pd.DataFrame({"ticker": w.index, "weight": (100 * w).round(2).to_numpy()})


def write_weights(df: pd.DataFrame, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w") as f:
        f.write("# Saved from Portfolio Lab. Weights are % (rescaled to 100).\n")
        df.to_csv(f, index=False)


def clean_weights(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["ticker"] = df["ticker"].fillna("").astype(str).str.strip().str.upper()
    df["weight"] = pd.to_numeric(df["weight"], errors="coerce").fillna(0)
    return df[(df["ticker"] != "") & (df["weight"] > 0)].groupby("ticker", as_index=False,
                                                                  sort=False).sum()


def pct(x: float, signed: bool = False) -> str:
    if pd.isna(x):
        return "n/a"
    return f"{x:+.1f}%" if signed else f"{x:.1f}%"


def money(x: float, signed: bool = False) -> str:
    if pd.isna(x):
        return "n/a"
    return f"{'+' if signed and x >= 0 else ''}{'-' if x < 0 else ''}${abs(x):,.0f}"


def editor_key(name: str) -> str:
    """A per-portfolio editor key with a version, so 'reset/load' can refresh the table."""
    v = st.session_state.setdefault(f"ver_{name}", 0)
    return f"editor_{name}_{v}"


def bump(name: str) -> None:
    st.session_state[f"ver_{name}"] = st.session_state.get(f"ver_{name}", 0) + 1


# ---------------------------------------------------------------------------------------
# Sidebar
# ---------------------------------------------------------------------------------------

st.sidebar.title("📈 Portfolio Lab")
page = st.sidebar.radio("Page", ["Compare portfolios", "My portfolio"])
st.sidebar.divider()
demo = st.sidebar.toggle("Demo mode (made-up prices)", value=False,
                         help="Uses synthetic prices instead of Yahoo Finance. Only for "
                              "trying the app without internet. Numbers are meaningless.")
if demo:
    st.sidebar.warning("Demo mode is ON: all numbers are made up.")
st.sidebar.caption("Everything runs and is saved on this computer. This tool shows trade-offs "
                   "from past data; it is not financial advice and does not predict returns.")


# ---------------------------------------------------------------------------------------
# Page: Compare portfolios
# ---------------------------------------------------------------------------------------


def page_compare() -> None:
    st.title("Compare portfolios")
    st.write("Build a few candidate mixes, then compare growth, worst drops, crisis results "
             "and how robust each one was to the timing of when you started.")

    files = candidate_files()
    st.subheader("1. Your candidate portfolios")
    left, right = st.columns([1, 1.3])
    with left:
        choice = st.selectbox("Edit a portfolio", [NEW] + list(files))
        is_new = choice == NEW
        name = st.text_input("Name", value="" if is_new else choice,
                             placeholder="e.g. my balanced mix")
        start_df = (pd.DataFrame({"ticker": ["VTI", "BND"], "weight": [60.0, 40.0]}) if is_new
                    else read_weights(files[choice]))
        edited = st.data_editor(
            start_df, num_rows="dynamic", width="stretch", key=editor_key(choice),
            column_config={
                "ticker": st.column_config.TextColumn("Ticker", help="Yahoo Finance symbol, e.g. VTI"),
                "weight": st.column_config.NumberColumn("Weight %", min_value=0.0, step=1.0,
                                                        format="%.1f"),
            })
        cleaned = clean_weights(edited)
        total = cleaned["weight"].sum()
        st.caption(f"{len(cleaned)} holdings, weights add up to {total:.1f}% "
                   f"({'they will be rescaled to 100%' if abs(total - 100) > 0.01 else 'good'}).")
        b1, b2 = st.columns(2)
        if b1.button("💾 Save portfolio", type="primary", width="stretch"):
            if not name.strip():
                st.error("Give the portfolio a name first.")
            elif cleaned.empty:
                st.error("Add at least one ticker with a weight above 0.")
            else:
                if is_new:
                    n = len(files) + 1
                    path = CAND_DIR / f"{n}_{slug(name)}.csv"
                else:
                    old = files[choice]
                    prefix = re.match(r"^(\d+)_", old.name)
                    path = CAND_DIR / f"{prefix.group(1) + '_' if prefix else ''}{slug(name)}.csv"
                    if path != old:
                        old.unlink()
                write_weights(cleaned, path)
                st.success(f"Saved {path.name}")
                bump(choice)
                st.rerun()
        if not is_new and b2.button("🗑️ Delete", width="stretch"):
            files[choice].unlink()
            st.success(f"Deleted {choice}")
            st.rerun()
    with right:
        st.markdown("**Common building blocks** (US-listed ETFs)")
        st.markdown(
            "| Ticker | What it holds |\n|---|---|\n"
            "| VTI | Whole US stock market |\n| VOO | S&P 500 (US large companies) |\n"
            "| VXUS | Stocks outside the US |\n| BND | US investment-grade bonds |\n"
            "| TLT | Long-term US Treasury bonds |\n| GLD | Gold |\n"
            "| QQQ | Nasdaq-100 (tech-heavy) |\n| VNQ | US real estate (REITs) |")
        st.caption("Any Yahoo Finance ticker works. Older funds are used automatically to "
                   "extend history before an ETF existed.")

    st.subheader("2. Compare")
    files = candidate_files()
    chosen = st.multiselect("Portfolios to compare", list(files), default=list(files))
    use_proxies = st.checkbox("Extend history with look-alike funds (recommended)", value=True,
                              help="Lets the comparison reach back to 2000 and include the "
                                   "dot-com crash and 2008.")
    if st.button("▶️ Run comparison", type="primary", disabled=not chosen):
        with st.spinner("Downloading prices and comparing (the first run can take ~30 s)..."):
            try:
                st.session_state["compare_result"] = compare.run_compare(
                    make_cfg(use_proxies), [files[c] for c in chosen], synthetic=demo)
            except Exception as exc:  # show a readable message instead of a stack trace
                st.error(f"Comparison failed: {exc}")
                st.session_state.pop("compare_result", None)

    res = st.session_state.get("compare_result")
    if res:
        show_compare_result(res)


def show_compare_result(res: dict) -> None:
    if res["synthetic"]:
        st.warning("These results use MADE-UP prices (demo mode or download failure).")
    st.markdown(f"**Period:** {res['start']:%b %Y} to {res['end']:%b %Y}, the same for every "
                "portfolio. Rebalanced, before fees and taxes.")
    if res["proxy_lines"]:
        st.caption("Earlier years use look-alike funds: " + "; ".join(res["proxy_lines"]))
    st.info(compare.HINDSIGHT_NOTE)

    s = res["summary"]
    table = pd.DataFrame({
        "Portfolio": s["portfolio"],
        "Growth / yr": s["growth_per_year_%"].map(pct),
        "Volatility": s["volatility_%"].map(pct),
        "Worst drop": s["max_drawdown_%"].map(pct),
        "Recovery": s["peak_to_recovery"],
        "Worst 12 months": s["worst_12m_%"].map(pct),
        "$10k became": s["10k_becomes_$"].map(money),
        "Bets now": s["bets_today"].map(lambda x: f"{x:.1f}"),
        "Bets in COVID": s["bets_in_covid"].map(lambda x: f"{x:.1f}"),
        "Biggest risk": s["biggest_risk"],
    })
    tab1, tab2, tab3 = st.tabs(["Overview", "Crises", "Robustness (rolling periods)"])
    with tab1:
        st.dataframe(table, hide_index=True, width="stretch")
        st.image(str(res["comparison_png"]), width="stretch")
    with tab2:
        st.write("Return of each portfolio from the start of each crisis to the market bottom.")
        st.dataframe(res["crisis_table"].map(lambda x: pct(x, signed=True)),
                     width="stretch")
    with tab3:
        rs = res["rolling_summary"]
        if rs.empty:
            st.write("Not enough history for rolling periods.")
        else:
            st.write("Every 5- and 10-year holding period, started each month. **Worst** = if "
                     "you had started at the worst month. Periods overlap, so treat this as "
                     "'how much did timing matter', not as independent trials.")
            for yrs, t in rs.groupby("years", sort=False):
                st.markdown(f"**{yrs}-year periods** ({int(t['periods'].iloc[0])} start months)")
                st.dataframe(pd.DataFrame({
                    "Portfolio": t["portfolio"],
                    "Worst": t["worst_%/yr"].map(lambda x: pct(x, True) + "/yr"),
                    "1 in 10 bad": t["bad_10pct_%/yr"].map(lambda x: pct(x, True) + "/yr"),
                    "Typical": t["typical_%/yr"].map(lambda x: pct(x, True) + "/yr"),
                    "Best": t["best_%/yr"].map(lambda x: pct(x, True) + "/yr"),
                    "Lost money": t["lost_money_%"].map(lambda x: f"{x:.0f}% of periods"),
                    "Worst drop": t["worst_drop_inside_%"].map(pct),
                }), hide_index=True, width="stretch")
            if res["rolling_png"]:
                st.image(str(res["rolling_png"]), width="stretch")


# ---------------------------------------------------------------------------------------
# Page: My portfolio
# ---------------------------------------------------------------------------------------


def page_my_portfolio() -> None:
    st.title("My portfolio")
    st.write("Enter what you actually own. Prices are fetched from Yahoo Finance when you "
             "click **Check my portfolio**. The file is saved only on this computer.")

    MY_DIR.mkdir(parents=True, exist_ok=True)
    existing = sorted(p.stem for p in MY_DIR.glob("*.csv"))
    names = existing or ["my_portfolio"]
    c1, c2 = st.columns([1, 1])
    with c1:
        which = st.selectbox("Portfolio file", names + ["➕ New file"])
        if which == "➕ New file":
            which = slug(st.text_input("New file name", value="second_portfolio"))
    path = MY_DIR / f"{which}.csv"
    key = f"my_{which}"
    if key not in st.session_state:
        st.session_state[key] = hd.load_holdings(path)

    with c2:
        files = candidate_files()
        src = st.selectbox("Optional: start from a candidate's mix", ["(none)"] + list(files))
        if st.button("Use it as my target weights", disabled=src == "(none)"):
            w = read_weights(files[src])
            cur = hd.clean_holdings(st.session_state[key]).set_index("ticker")
            new = pd.DataFrame({"ticker": w["ticker"], "target_weight": w["weight"]})
            new["shares"] = new["ticker"].map(cur["shares"]).fillna(0.0) if not cur.empty else 0.0
            new["invested_usd"] = (new["ticker"].map(cur["invested_usd"]).fillna(0.0)
                                   if not cur.empty else 0.0)
            st.session_state[key] = hd.clean_holdings(new)
            bump(key)
            st.rerun()

    st.markdown("**Holdings** — add one row per fund. For uninvested cash add a row with "
                "ticker **CASH** and the dollar amount in *Shares*.")
    edited = st.data_editor(
        st.session_state[key], num_rows="dynamic", width="stretch",
        key=editor_key(key),
        column_config={
            "ticker": st.column_config.TextColumn("Ticker", help="e.g. VTI, or CASH"),
            "shares": st.column_config.NumberColumn("Shares", min_value=0.0, format="%.4f",
                                                    help="Number of shares (CASH: dollars)"),
            "invested_usd": st.column_config.NumberColumn(
                "Total invested $", min_value=0.0, format="$%.2f",
                help="What you paid in total for this holding (0 if unknown)"),
            "target_weight": st.column_config.NumberColumn(
                "Target %", min_value=0.0, format="%.1f", help="The share you are aiming for"),
        })
    b1, b2, b3 = st.columns(3)
    if b1.button("💾 Save", type="primary", width="stretch"):
        hd.save_holdings(edited, path)
        st.session_state[key] = hd.clean_holdings(edited)
        st.success(f"Saved {path.relative_to(BASE)}")
    check = b2.button("🔄 Check my portfolio", width="stretch")
    stress = b3.button("🧪 Stress-test my holdings", width="stretch")

    cleaned = hd.clean_holdings(edited)
    if (check or stress) and cleaned.empty:
        st.error("Add at least one holding first.")
        return
    if check or stress:
        with st.spinner("Fetching latest prices..."):
            try:
                st.session_state[f"val_{which}"] = hd.value_holdings(cleaned, make_cfg(), demo)
            except Exception as exc:
                st.error(f"Could not value the portfolio: {exc}")
                return
    val = st.session_state.get(f"val_{which}")
    if val:
        show_valuation(*val)
    if stress and val:
        weights = hd.weights_from_holdings(val[0])
        if len(weights) < 2:
            st.warning("The stress test needs at least 2 invested holdings with shares.")
        else:
            with st.spinner("Running stress test and crisis replay..."):
                try:
                    st.session_state[f"stress_{which}"] = pdx.run_portfolio_weights(
                        make_cfg(), weights, synthetic=demo)
                except Exception as exc:
                    st.error(f"Stress test failed: {exc}")
    res = st.session_state.get(f"stress_{which}")
    if res:
        show_stress(res)


def show_valuation(table: pd.DataFrame, totals: dict) -> None:
    st.subheader(f"Value as of {totals['as_of']}")
    if totals["missing"]:
        st.error("No price found for: " + ", ".join(totals["missing"]) +
                 ". Check the ticker symbols on finance.yahoo.com.")
    m1, m2, m3 = st.columns(3)
    m1.metric("Total value", money(totals["value"]),
              delta=f"{money(totals['day_change'], True)} ({pct(totals['day_change_%'], True)}) today")
    m2.metric("Total invested", money(totals["invested"]))
    m3.metric("Gain / loss", money(totals["gain"], True), delta=pct(totals["gain_%"], True))
    if totals["off_target"]:
        st.warning(f"More than {hd.DRIFT_BAND:.0f} percentage points away from target: "
                   + ", ".join(totals["off_target"]) + ". You may want to rebalance.")
    show = pd.DataFrame({
        "Ticker": table["ticker"], "Shares": table["shares"].map(lambda x: f"{x:,.4f}"),
        "Price": table["price"].map(lambda x: "n/a" if pd.isna(x) else f"${x:,.2f}"),
        "Value": table["value"].map(money), "Invested": table["invested_usd"].map(money),
        "Gain": table["gain_usd"].map(lambda x: money(x, True)),
        "Gain %": table["gain_%"].map(lambda x: pct(x, True)),
        "Today": table["day_change_usd"].map(lambda x: money(x, True)),
        "Actual %": table["actual_%"].map(pct), "Target %": table["target_%"].map(pct),
        "Drift": table["drift_pts"].map(lambda x: "n/a" if pd.isna(x) else f"{x:+.1f} pts"),
        "Rebalance?": table["rebalance_flag"].map(lambda x: "⚠️" if x else ""),
    })
    st.dataframe(show, hide_index=True, width="stretch")


def show_stress(res: dict) -> None:
    st.subheader("Stress test of your current holdings")
    if res["synthetic"]:
        st.warning("These results use MADE-UP prices.")
    sc = res["scenarios"].set_index("scenario")
    today = sc.iloc[0]
    c1, c2, c3 = st.columns(3)
    c1.metric("Independent bets today", f"{today['independent_bets']:.1f}")
    c2.metric("Volatility today", pct(today["portfolio_vol_%"]))
    c3.metric("Volatility with crisis correlations", pct(sc.iloc[1]["portfolio_vol_%"]),
              delta=pct(100 * (sc.iloc[1]["portfolio_vol_%"] / today["portfolio_vol_%"] - 1), True),
              delta_color="inverse")
    st.caption("Cash is left out of the stress test (it has no price history), so real "
               "swings on your total, including cash, are a bit smaller.")
    st.image(str(res["report_png"]), width="stretch")
    if not res["replay"].empty:
        st.markdown("**What your current mix would have done in past crises** (actual prices)")
        r = res["replay"]
        st.dataframe(pd.DataFrame({
            "Crisis": r["crisis"], "Your mix": r["portfolio_return_%"].map(lambda x: pct(x, True)),
            "S&P 500 (SPY)": r["SPY_return_%"].map(lambda x: pct(x, True)),
            "Worst drop": r["max_drawdown_%"].map(pct), "Worst day": r["worst_day_%"].map(pct),
            "Best holding": r["best_holding"] + " " + r["best_holding_return_%"].map(lambda x: pct(x, True)),
            "Worst holding": r["worst_holding"] + " " + r["worst_holding_return_%"].map(lambda x: pct(x, True)),
        }), hide_index=True, width="stretch")
        st.image(str(res["crises_png"]), width="stretch")


if page == "Compare portfolios":
    page_compare()
else:
    page_my_portfolio()

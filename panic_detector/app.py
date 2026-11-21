"""
app.py - Portfolio Lab: a local web app around the panic detector.

Start it from the panic_detector folder:
    streamlit run app.py
It opens in your browser at http://localhost:8501. Everything stays on your computer:
portfolios are saved as CSV files in portfolios/, results in outputs/.

Pages:
    Compare       create/edit candidate mixes and compare them side by side
    Portfolio     enter what you actually own, value it, and stress-test it
    Daily report  one-page report with alerts for what changed
"""
from __future__ import annotations

import logging
import re
from pathlib import Path

import pandas as pd
import streamlit as st
import streamlit.components.v1 as components

import charts as ch
import compare
import hedges as hg
import holdings as hd
import panic_detector as pdx
import projections as pj
import report as rp

BASE = Path(__file__).resolve().parent
CAND_DIR = BASE / "portfolios" / "candidates"
MY_DIR = BASE / "portfolios" / "my"
NEW = "New portfolio"

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)-7s %(message)s",
                    datefmt="%H:%M:%S")
for noisy in ("matplotlib", "PIL", "yfinance", "peewee", "urllib3"):
    logging.getLogger(noisy).setLevel(logging.WARNING)

st.set_page_config(page_title="Portfolio Lab", page_icon="▦", layout="wide")

CSS = """
<style>
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&display=swap');
:root { --ink:#1a1a1a; --muted:#6b6b6b; --line:#e3e3df; --accent:#2a78d6; --pos:#0f7b3f; --neg:#c62f2e; }
html, body, .stApp, .stApp p, .stApp label, .stApp li, .stApp input, .stApp textarea, .stApp button,
.stApp h1, .stApp h2, .stApp h3, .stApp [data-testid="stMarkdownContainer"], .stApp [data-baseweb],
.stApp span:not([data-testid="stIconMaterial"]):not([class*="material"]) {
  font-family: 'IBM Plex Mono', SFMono-Regular, Menlo, Consolas, monospace; }
.stApp { font-size: 0.92rem; }
.stApp { background:#fbfbfa; }
header[data-testid="stHeader"] { background:transparent; height:0; }
.block-container { padding-top:2.0rem; padding-bottom:3rem; max-width:1320px; }
h1 { font-size:1.45rem !important; font-weight:500 !important; letter-spacing:0; margin:0 !important; padding:0 !important; }
h2, h3 { font-weight:600 !important; letter-spacing:-0.01em; }
section[data-testid="stSidebar"] { background:#f3f3f1; border-right:1px solid var(--line); }
section[data-testid="stSidebar"] .block-container { padding-top:1.2rem; }
.wordmark { font-family:'IBM Plex Mono', monospace; font-weight:500; font-size:0.95rem; letter-spacing:0.14em; color:var(--ink); }
.wordmark span { color:var(--accent); }
.eyebrow { font-family:'IBM Plex Mono', monospace; text-transform:uppercase; letter-spacing:0.14em; font-size:0.68rem; color:var(--accent); margin-bottom:4px; }
.lede { color:var(--muted); font-size:0.92rem; margin:6px 0 4px; max-width:820px; }
.section { font-family:'IBM Plex Mono', monospace; text-transform:uppercase; letter-spacing:0.12em; font-size:0.68rem; color:var(--muted);
           border-bottom:1px solid var(--line); padding-bottom:6px; margin:30px 0 14px; }
.meta { font-family:'IBM Plex Mono', monospace; font-size:0.74rem; color:var(--muted); letter-spacing:0.04em; margin:6px 0 2px; }
.note { font-size:0.8rem; color:var(--muted); border-left:2px solid var(--line); padding:2px 0 2px 10px; margin:8px 0 14px; max-width:980px; }
.flag { font-size:0.85rem; border-left:2px solid #a86b00; background:#fff8ec; padding:8px 12px; margin:8px 0; }
.flag.neg { border-left-color:var(--neg); background:#fdf1f1; }
[data-testid="stMetric"] { background:#ffffff; border:1px solid var(--line); border-radius:3px; padding:10px 14px; }
[data-testid="stMetricLabel"] p { text-transform:uppercase; letter-spacing:0.08em; font-size:0.66rem !important; color:var(--muted); }
[data-testid="stMetricValue"] { font-family:'IBM Plex Mono', monospace; font-size:1.35rem !important; font-weight:500; }
[data-testid="stMetricDelta"] { font-family:'IBM Plex Mono', monospace; font-size:0.75rem !important; }
.stButton button, .stDownloadButton button { border-radius:3px; font-weight:500; letter-spacing:0.01em; }
div[data-baseweb="select"] > div, .stTextInput input, .stNumberInput input { border-radius:3px; }
.stTabs [data-baseweb="tab-list"] { gap:20px; border-bottom:1px solid var(--line); }
.stTabs button[role="tab"] p, .stTabs [data-baseweb="tab"] p { font-family:'IBM Plex Mono', monospace !important; text-transform:uppercase; letter-spacing:0.1em; font-size:0.72rem !important; }
[data-testid="stDataFrame"], [data-testid="stDataEditor"] { border:1px solid var(--line); border-radius:3px; }
.stRadio [role="radiogroup"] label p { font-size:0.9rem; }
</style>
"""
st.markdown(CSS, unsafe_allow_html=True)


# ---------------------------------------------------------------------------------------
# Small UI helpers
# ---------------------------------------------------------------------------------------


def header(eyebrow: str, title: str, lede: str) -> None:
    st.markdown(f"<div class='eyebrow'>{eyebrow}</div>", unsafe_allow_html=True)
    st.title(title)
    st.markdown(f"<div class='lede'>{lede}</div>", unsafe_allow_html=True)


def section(label: str) -> None:
    st.markdown(f"<div class='section'>{label}</div>", unsafe_allow_html=True)


def note(text: str) -> None:
    st.markdown(f"<div class='note'>{text}</div>", unsafe_allow_html=True)


def flag(text: str, negative: bool = False) -> None:
    st.markdown(f"<div class='flag{' neg' if negative else ''}'>{text}</div>",
                unsafe_allow_html=True)


def chart(c) -> None:
    st.altair_chart(c, theme=None, width="stretch")


PCT = st.column_config.NumberColumn(format="%.1f%%")
SPCT = st.column_config.NumberColumn(format="%+.1f%%")
USD = st.column_config.NumberColumn(format="$%,.0f")
SUSD = st.column_config.NumberColumn(format="%+,.0f")
NUM1 = st.column_config.NumberColumn(format="%.1f")


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


def editor_key(name: str) -> str:
    v = st.session_state.setdefault(f"ver_{name}", 0)
    return f"editor_{name}_{v}"


def bump(name: str) -> None:
    st.session_state[f"ver_{name}"] = st.session_state.get(f"ver_{name}", 0) + 1


def fmt_money(x: float, signed: bool = False) -> str:
    if pd.isna(x):
        return "n/a"
    return f"{'+' if signed and x >= 0 else ''}{'-' if x < 0 else ''}${abs(x):,.0f}"


def fmt_pct(x: float, signed: bool = True) -> str:
    return "n/a" if pd.isna(x) else (f"{x:+.1f}%" if signed else f"{x:.1f}%")


# ---------------------------------------------------------------------------------------
# Sidebar
# ---------------------------------------------------------------------------------------

with st.sidebar:
    st.markdown("<div class='wordmark'>PORTFOLIO<span>/</span>LAB</div>", unsafe_allow_html=True)
    st.markdown("<div class='meta'>Correlation · risk · robustness</div>", unsafe_allow_html=True)
    st.markdown("<div class='section'>Navigate</div>", unsafe_allow_html=True)
    page = st.radio("Page", ["Compare", "Portfolio", "Projections", "Hedges", "Daily report"],
                    label_visibility="collapsed")
    st.markdown("<div class='section'>Data</div>", unsafe_allow_html=True)
    demo = st.toggle("Demo data", value=False,
                     help="Uses made-up prices instead of Yahoo Finance, for trying the app "
                          "offline. All numbers are then meaningless.")
    if demo:
        flag("Synthetic prices: results are illustrative only.", negative=True)
    if st.button("Refresh prices", width="stretch",
                 help="Saved prices refresh automatically when older than 12 hours. Use this "
                      "to force a fresh download now."):
        n = pdx.clear_price_cache(BASE / "data")
        st.toast(f"Cleared {n} saved price files; the next run downloads fresh prices.")
    st.markdown("<div class='note'>Runs locally. Based on historical prices; describes "
                "risk and trade-offs, does not predict returns. Not financial advice.</div>",
                unsafe_allow_html=True)


# ---------------------------------------------------------------------------------------
# Page: Compare
# ---------------------------------------------------------------------------------------


def page_compare() -> None:
    header("Research", "Portfolio comparison",
           "Define candidate allocations and compare growth, drawdowns, crisis behaviour and "
           "sensitivity to start date over a common historical window.")

    files = candidate_files()
    section("Candidate allocations")
    left, right = st.columns([1.15, 1], gap="large")
    with left:
        choice = st.selectbox("Allocation", [NEW] + list(files))
        is_new = choice == NEW
        name = st.text_input("Name", value="" if is_new else choice,
                             placeholder="e.g. balanced 60/40")
        start_df = (pd.DataFrame({"ticker": ["VTI", "BND"], "weight": [60.0, 40.0]}) if is_new
                    else read_weights(files[choice]))
        edited = st.data_editor(
            start_df, num_rows="dynamic", width="stretch", key=editor_key(choice),
            column_config={
                "ticker": st.column_config.TextColumn("Ticker", help="Yahoo Finance symbol"),
                "weight": st.column_config.NumberColumn("Weight %", min_value=0.0, step=1.0,
                                                        format="%.1f"),
            })
        cleaned = clean_weights(edited)
        total = cleaned["weight"].sum()
        st.markdown(f"<div class='meta'>{len(cleaned)} HOLDINGS · Σ WEIGHT {total:.1f}%"
                    f"{' · RESCALED TO 100%' if abs(total - 100) > 0.01 else ''}</div>",
                    unsafe_allow_html=True)
        b1, b2, _ = st.columns([1, 1, 1.4])
        if b1.button("Save", type="primary", width="stretch"):
            if not name.strip():
                st.error("Name the allocation first.")
            elif cleaned.empty:
                st.error("Add at least one ticker with a weight above 0.")
            else:
                if is_new:
                    path = CAND_DIR / f"{len(files) + 1}_{slug(name)}.csv"
                else:
                    old = files[choice]
                    prefix = re.match(r"^(\d+)_", old.name)
                    path = CAND_DIR / f"{prefix.group(1) + '_' if prefix else ''}{slug(name)}.csv"
                    if path != old:
                        old.unlink()
                write_weights(cleaned, path)
                bump(choice)
                st.rerun()
        if not is_new and b2.button("Delete", width="stretch"):
            files[choice].unlink()
            st.rerun()
    with right:
        st.markdown("<div class='meta'>REFERENCE · US-LISTED BUILDING BLOCKS</div>",
                    unsafe_allow_html=True)
        st.dataframe(pd.DataFrame({
            "Ticker": ["VTI", "VOO", "VXUS", "BND", "TLT", "GLD", "QQQ", "VNQ"],
            "Exposure": ["US total stock market", "S&P 500", "Ex-US equities",
                         "US investment-grade bonds", "Long-term Treasuries", "Gold",
                         "Nasdaq-100", "US REITs"]}), hide_index=True, width="stretch")
        note("Any Yahoo Finance ticker works. Before an ETF existed, a look-alike fund extends "
             "its history (e.g. VXUS ← VEU ← VGTSX).")

    section("Run")
    files = candidate_files()
    c1, c2 = st.columns([3, 1.2], gap="large")
    chosen = c1.multiselect("Allocations", list(files), default=list(files))
    use_proxies = c2.checkbox("Extend history with proxies", value=True,
                              help="Reaches back to 2000, including the dot-com crash and 2008.")
    if st.button("Run comparison", type="primary", disabled=not chosen):
        with st.spinner("Downloading prices and computing (first run ~30 s)"):
            try:
                st.session_state["compare_result"] = compare.run_compare(
                    make_cfg(use_proxies), [files[c] for c in chosen], synthetic=demo)
            except Exception as exc:
                st.error(f"Comparison failed: {exc}")
                st.session_state.pop("compare_result", None)
    res = st.session_state.get("compare_result")
    if res:
        show_compare(res)


def show_compare(res: dict) -> None:
    names = res["names"]
    s = res["summary"]
    section("Results")
    if res["synthetic"]:
        flag("Synthetic prices: results are illustrative only.", negative=True)
    st.markdown(f"<div class='meta'>PRICES AS OF {res['end']:%Y-%m-%d} · "
                f"WINDOW {res['start']:%Y-%m-%d} → {res['end']:%Y-%m-%d} · "
                f"{len(names)} ALLOCATIONS · DAILY REBALANCED · GROSS OF FEES AND TAXES</div>",
                unsafe_allow_html=True)
    if res["proxy_lines"]:
        st.markdown("<div class='meta'>PROXIES · " + " · ".join(res["proxy_lines"]) + "</div>",
                    unsafe_allow_html=True)
    note(compare.HINDSIGHT_NOTE)

    t1, t2, t3 = st.tabs(["Performance", "Crises", "Robustness"])
    with t1:
        st.dataframe(pd.DataFrame({
            "Allocation": s["portfolio"], "CAGR": s["growth_per_year_%"], "Vol": s["volatility_%"],
            "Ret/vol": s["return_per_risk"], "Max DD": s["max_drawdown_%"],
            "Recovery": s["peak_to_recovery"].str.replace("not yet recovered", "not yet"),
            "Worst 12m": s["worst_12m_%"], "$10k →": s["10k_becomes_$"],
            "Bets": s["bets_today"], "Bets·COVID": s["bets_in_covid"], "Top risk": s["biggest_risk"],
        }), hide_index=True, width="stretch", column_config={
            "CAGR": PCT, "Vol": PCT, "Ret/vol": st.column_config.NumberColumn(format="%.2f"),
            "Max DD": PCT, "Worst 12m": PCT, "$10k →": USD, "Bets": NUM1, "Bets·COVID": NUM1})
        a, b = st.columns([1.5, 1], gap="large")
        with a:
            st.markdown("<div class='meta'>GROWTH OF $10,000 · LOG SCALE</div>", unsafe_allow_html=True)
            chart(ch.growth_chart(res["values"], names))
        with b:
            st.markdown("<div class='meta'>CAGR VS MAX DRAWDOWN</div>", unsafe_allow_html=True)
            chart(ch.risk_return_scatter(s, names))
        st.markdown("<div class='meta'>DRAWDOWN FROM RUNNING HIGH</div>", unsafe_allow_html=True)
        chart(ch.drawdown_chart(res["values"], names))
    with t2:
        ct = res["crisis_table"]
        long = ct.reset_index().melt("portfolio", var_name="crisis", value_name="ret").dropna()
        st.markdown("<div class='meta'>RETURN FROM CRISIS START TO MARKET TROUGH · %</div>",
                    unsafe_allow_html=True)
        chart(ch.heatmap(long, "crisis", "portfolio", "ret", list(ct.columns), names))
        note("Rows are crises, columns are allocations. Blue = held value, red = lost value.")
    with t3:
        rs, rw = res["rolling_summary"], res["rolling_windows"]
        if rs.empty:
            st.write("Not enough history for rolling periods.")
            return
        horizons = list(dict.fromkeys(rs["years"]))
        yrs = st.radio("Holding period", horizons, index=len(horizons) - 1, horizontal=True,
                       format_func=lambda y: f"{y} years")
        t = rs[rs["years"] == yrs]
        n_start = int(t["periods"].iloc[0])
        st.markdown(f"<div class='meta'>{n_start} OVERLAPPING {yrs}-YEAR WINDOWS, ONE PER START "
                    "MONTH · ANNUALISED RETURN</div>", unsafe_allow_html=True)
        st.dataframe(pd.DataFrame({
            "Allocation": t["portfolio"], "Worst": t["worst_%/yr"], "P10": t["bad_10pct_%/yr"],
            "Median": t["typical_%/yr"], "Best": t["best_%/yr"], "Loss freq.": t["lost_money_%"],
            "Max DD": t["worst_drop_inside_%"], "Ranked 1st": t["came_first_%"],
        }), hide_index=True, width="stretch", column_config={
            "Worst": SPCT, "P10": SPCT, "Median": SPCT, "Best": SPCT,
            "Loss freq.": st.column_config.NumberColumn(format="%.0f%%"), "Max DD": PCT,
            "Ranked 1st": st.column_config.NumberColumn(format="%.0f%%")})
        a, b = st.columns([1.5, 1], gap="large")
        with a:
            st.markdown("<div class='meta'>ANNUALISED RETURN BY START MONTH</div>", unsafe_allow_html=True)
            chart(ch.rolling_lines(rw, yrs, names))
        with b:
            st.markdown("<div class='meta'>DISTRIBUTION · WORST ▏ P10–BEST ━ MEDIAN ●</div>",
                        unsafe_allow_html=True)
            chart(ch.rolling_range(rs, yrs, names))
        note("Windows overlap heavily (about "
             f"{max(1, round((pd.Timestamp(rw['end'].max()) - pd.Timestamp(rw['start'].min())).days / 365.25 / yrs))}"
             " independent periods), so this measures sensitivity to timing, not independent "
             "trials. 'Ranked 1st' ignores risk.")


# ---------------------------------------------------------------------------------------
# Page: Portfolio
# ---------------------------------------------------------------------------------------


def page_portfolio() -> None:
    header("Holdings", "My portfolio",
           "Record positions, value them at the latest close, and stress-test the current "
           "mix. Saved locally in portfolios/my/ (excluded from git).")
    MY_DIR.mkdir(parents=True, exist_ok=True)
    existing = sorted(p.stem for p in MY_DIR.glob("*.csv") if not p.stem.endswith("_history"))
    names = existing or ["my_portfolio"]

    section("Positions")
    c1, c2, c3 = st.columns([1, 1, 0.8], gap="large")
    with c1:
        which = st.selectbox("File", names + ["New file"])
        if which == "New file":
            which = slug(st.text_input("New file name", value="second_portfolio"))
    path = MY_DIR / f"{which}.csv"
    key = f"my_{which}"
    if key not in st.session_state:
        st.session_state[key] = hd.load_holdings(path)
    files = candidate_files()
    with c2:
        src = st.selectbox("Load targets from allocation", ["—"] + list(files))
    with c3:
        st.write("")
        st.write("")
        if st.button("Apply targets", disabled=src == "—", width="stretch"):
            w = read_weights(files[src])
            cur = hd.clean_holdings(st.session_state[key]).set_index("ticker")
            new = pd.DataFrame({"ticker": w["ticker"], "target_weight": w["weight"]})
            new["shares"] = new["ticker"].map(cur["shares"]).fillna(0.0) if not cur.empty else 0.0
            new["invested_usd"] = (new["ticker"].map(cur["invested_usd"]).fillna(0.0)
                                   if not cur.empty else 0.0)
            st.session_state[key] = hd.clean_holdings(new)
            bump(key)
            st.rerun()

    edited = st.data_editor(
        st.session_state[key], num_rows="dynamic", width="stretch", key=editor_key(key),
        column_config={
            "ticker": st.column_config.TextColumn("Ticker", help="e.g. VTI, or CASH"),
            "shares": st.column_config.NumberColumn("Shares", min_value=0.0, format="%.4f",
                                                    help="Number of shares (CASH: dollar amount)"),
            "invested_usd": st.column_config.NumberColumn("Cost basis $", min_value=0.0,
                                                          format="%.2f",
                                                          help="Total paid for the position"),
            "target_weight": st.column_config.NumberColumn("Target %", min_value=0.0,
                                                           format="%.1f"),
        })
    st.markdown("<div class='meta'>ADD A ROW WITH TICKER CASH FOR UNINVESTED CASH (SHARES = "
                "DOLLARS)</div>", unsafe_allow_html=True)
    b1, b2, b3, _ = st.columns([1, 1, 1, 1.5])
    if b1.button("Save", type="primary", width="stretch"):
        hd.save_holdings(edited, path)
        st.session_state[key] = hd.clean_holdings(edited)
        st.toast(f"Saved {path.relative_to(BASE)}")
    check = b2.button("Value", width="stretch")
    stress = b3.button("Stress test", width="stretch")

    cleaned = hd.clean_holdings(edited)
    if (check or stress) and cleaned.empty:
        st.error("Add at least one position first.")
        return
    if check or stress:
        with st.spinner("Fetching latest prices"):
            try:
                st.session_state[f"val_{which}"] = hd.value_holdings(cleaned, make_cfg(), demo)
            except Exception as exc:
                st.error(f"Valuation failed: {exc}")
                return
    val = st.session_state.get(f"val_{which}")
    if val:
        show_valuation(*val)
        show_rebalance(val[0], key, path)
    if stress and val:
        weights = hd.weights_from_holdings(val[0])
        if len(weights) < 2:
            st.warning("The stress test needs at least 2 invested positions.")
        else:
            with st.spinner("Running stress test and crisis replay"):
                try:
                    st.session_state[f"stress_{which}"] = pdx.run_portfolio_weights(
                        make_cfg(), weights, synthetic=demo)
                except Exception as exc:
                    st.error(f"Stress test failed: {exc}")
    res = st.session_state.get(f"stress_{which}")
    if res:
        show_stress(res)


def show_valuation(table: pd.DataFrame, totals: dict) -> None:
    section(f"Valuation · close {totals['as_of']}")
    if totals["missing"]:
        flag("No price for " + ", ".join(totals["missing"]) + ". Check the symbols on "
             "finance.yahoo.com.", negative=True)
    m = st.columns(4)
    m[0].metric("Market value", fmt_money(totals["value"]),
                delta=f"{fmt_money(totals['day_change'], True)} ({fmt_pct(totals['day_change_%'])}) 1D")
    m[1].metric("Cost basis", fmt_money(totals["invested"]))
    m[2].metric("Unrealised P&L", fmt_money(totals["gain"], True), delta=fmt_pct(totals["gain_%"]))
    m[3].metric("Positions off target", f"{len(totals['off_target'])}",
                delta=", ".join(totals["off_target"]) or "none", delta_color="off",
                delta_arrow="off")
    st.dataframe(pd.DataFrame({
        "Ticker": table["ticker"], "Shares": table["shares"], "Price": table["price"],
        "Value": table["value"], "Cost": table["invested_usd"],
        "P&L ($)": table["gain_usd"].round(0) + 0.0, "P&L %": table["gain_%"],
        "1D ($)": table["day_change_usd"].round(0) + 0.0, "Weight": table["actual_%"],
        "Target": table["target_%"], "Drift (pts)": table["drift_pts"],
        "Status": table["rebalance_flag"].map(lambda x: "REBALANCE" if x else "ok"),
    }), hide_index=True, width="stretch", column_config={
        "Shares": st.column_config.NumberColumn(format="%.4f"),
        "Price": st.column_config.NumberColumn(format="$%.2f"), "Value": USD, "Cost": USD,
        "P&L ($)": SUSD, "P&L %": SPCT, "1D ($)": SUSD, "Weight": PCT, "Target": PCT,
        "Drift (pts)": st.column_config.NumberColumn(format="%+.1f")})
    note(f"Status REBALANCE = more than {hd.DRIFT_BAND:.0f} percentage points from target. "
         "Cash with a 0% target is treated as a buffer.")


def show_rebalance(table: pd.DataFrame, key: str, path: Path) -> None:
    section("Rebalance · trade calculator")
    if table["target_%"].fillna(0).sum() <= 0:
        note("Set target % for your positions (or load targets from an allocation) to get "
             "a trade plan.")
        return
    cash_bal = float(table.loc[table["ticker"] == hd.CASH, "value"].sum())
    c = st.columns([1, 1.4, 1, 1], gap="medium")
    new_money = c[0].number_input("New money to invest ($)", min_value=0.0, value=0.0,
                                  step=100.0, format="%.2f")
    mode_label = c[1].radio("Method", ["Buy only (no selling)", "Full rebalance (buy and sell)"],
                            help="Buy only never sells, so it never realises gains (no tax "
                                 "event in a taxable account). Full rebalance also sells "
                                 "overweight positions.")
    use_cash = c[2].checkbox(f"Also invest CASH (${cash_bal:,.0f})", value=False,
                             disabled=cash_bal <= 0)
    fractional = c[3].checkbox("Fractional shares", value=False,
                               help="Only if your broker supports them. Otherwise purchases "
                                    "are rounded down to whole shares.")
    mode = "full" if mode_label.startswith("Full") else "buy_only"
    plan, s = hd.rebalance_plan(table, new_money, use_cash, mode, fractional)
    if s["money_available"] <= 0 and mode == "buy_only":
        note("Enter new money (or tick 'Also invest CASH') to see what to buy.")
        return
    m = st.columns(4)
    m[0].metric("Cash to invest", fmt_money(s["money_available"]))
    m[1].metric("Buys / sells", f"{fmt_money(s['spent_on_buys'])} / {fmt_money(s['sell_proceeds'])}")
    m[2].metric("Left over", fmt_money(s["cash_left_over"]))
    m[3].metric("Max drift (pts)", f"{s['max_drift_after']:.1f}",
                delta=f"{s['max_drift_after'] - s['max_drift_now']:+.1f} from {s['max_drift_now']:.1f}",
                delta_color="inverse")
    st.dataframe(pd.DataFrame({
        "Ticker": plan["ticker"], "Action": plan["action"], "Shares": plan["trade_shares"],
        "Amount ($)": plan["trade_usd"].round(2), "Price": plan["price"],
        "Weight now": plan["weight_now_%"], "Weight after": plan["weight_after_%"],
        "Target": plan["target_%"], "Drift after (pts)": plan["drift_after_pts"],
    }), hide_index=True, width="stretch", column_config={
        "Shares": st.column_config.NumberColumn(format="%+.4f" if fractional else "%+.0f"),
        "Amount ($)": st.column_config.NumberColumn(format="%+,.2f"),
        "Price": st.column_config.NumberColumn(format="$%.2f"),
        "Weight now": PCT, "Weight after": PCT, "Target": PCT,
        "Drift after (pts)": st.column_config.NumberColumn(format="%+.1f")})
    msgs = [f"Prices are the last close ({table.attrs.get('as_of', 'latest')}); they will move "
            "before you trade, so amounts are approximate. Consider limit orders."]
    if mode == "full" and s["sell_proceeds"] > 0:
        msgs.append("Selling in a taxable account can trigger capital-gains tax; in an IRA or "
                    "401(k) it does not.")
    if not fractional:
        msgs.append("Whole shares only: purchases are rounded down, so a little cash is left.")
    note(" ".join(msgs) + " Not financial advice.")
    if s["n_trades"] and st.button("I placed these trades → update my positions",
                                   help="Adds the trades to your saved positions (shares, "
                                        "cost basis and CASH) and saves the file."):
        updated = hd.apply_plan(st.session_state[key], plan, s)
        hd.save_holdings(updated, path)
        st.session_state[key] = updated
        bump(key)
        for k in [k for k in st.session_state if k.startswith(("val_", "stress_"))]:
            del st.session_state[k]
        st.toast("Positions updated and saved. Click Value to see the new mix.")
        st.rerun()


def show_stress(res: dict) -> None:
    section("Stress test · current weights")
    if res["synthetic"]:
        flag("Synthetic prices: results are illustrative only.", negative=True)
    sc, hold = res["scenarios"], res["holdings"]
    today, cc = sc.iloc[0], sc.iloc[1]
    m = st.columns(4)
    m[0].metric("Independent bets", f"{today['independent_bets']:.1f}",
                delta=f"{cc['independent_bets']:.1f} in crisis", delta_color="off",
                delta_arrow="off")
    m[1].metric("Volatility (ann.)", fmt_pct(today["portfolio_vol_%"], False))
    m[2].metric("Vol · crisis correlations", fmt_pct(cc["portfolio_vol_%"], False),
                delta=fmt_pct(100 * (cc["portfolio_vol_%"] / today["portfolio_vol_%"] - 1)),
                delta_color="inverse")
    m[3].metric("Largest risk contributor", hold.index[0],
                delta=f"{hold['weight_%'].iloc[0]:.0f}% capital → "
                      f"{hold['risk_share_today_%'].iloc[0]:.0f}% risk", delta_color="off",
                delta_arrow="off")
    info = res["info"]
    st.markdown(f"<div class='meta'>TODAY = LAST 90 SESSIONS TO {info['today_end']:%Y-%m-%d} · "
                f"CRISIS WINDOW {info['crisis_start']:%Y-%m-%d} → {info['crisis_end']:%Y-%m-%d} · "
                "CASH EXCLUDED</div>", unsafe_allow_html=True)
    a, b = st.columns(2, gap="large")
    with a:
        st.markdown("<div class='meta'>CAPITAL VS RISK CONTRIBUTION · %</div>", unsafe_allow_html=True)
        chart(ch.money_vs_risk(hold))
    with b:
        st.markdown("<div class='meta'>CORRELATION TO PORTFOLIO · TODAY VS CRISIS</div>",
                    unsafe_allow_html=True)
        chart(ch.correlation_dumbbell(hold))
    a, b = st.columns([1.1, 1], gap="large")
    with a:
        st.markdown("<div class='meta'>PORTFOLIO VOLATILITY BY REGIME · %/YR</div>",
                    unsafe_allow_html=True)
        chart(ch.scenario_bars(sc))
    with b:
        st.markdown("<div class='meta'>SCENARIOS · FAT-TAILED ESTIMATES FROM THIS PORTFOLIO'S HISTORY"
                    "</div>", unsafe_allow_html=True)
        st.dataframe(pd.DataFrame({
            "Scenario": ["Today", "Crisis correlations", "Full crisis repeat", "All corr = 1"],
            "Vol": sc["portfolio_vol_%"], "1-in-20 day": sc["bad_day_1in20_%"],
            "1-in-100 day": sc["bad_day_1in100_%"], "Avg worst-5% day": sc["avg_worst_day_5%_%"],
            "1-in-20 month": sc["bad_month_1in20_%"], "1-in-100 month": sc["bad_month_1in100_%"],
            "Bets": sc["independent_bets"]}), hide_index=True, width="stretch", column_config={
                "Vol": PCT, "1-in-20 day": PCT, "1-in-100 day": PCT, "Avg worst-5% day": PCT,
                "1-in-20 month": PCT, "1-in-100 month": PCT, "Bets": NUM1})
        tl = res["info"]["tail"]["day"]
        worse = 100 * (tl["q01"] / pdx.NORMAL_TAIL["q01"] - 1)
        note(f"Tail shape from {res['info']['tail_history_days']:,} days of this portfolio's history, "
             f"scaled to each scenario's volatility. Its 1-in-100 day is {-tl['q01']:.2f}× daily "
             f"volatility vs 2.33× for a normal distribution ({worse:+.0f}%). "
             "The crisis replay below shows actual losses.")

    r = res["replay"]
    if not r.empty:
        section("Crisis replay · actual prices, buy-and-hold from crisis start")
        st.dataframe(pd.DataFrame({
            "Crisis": r["crisis"], "Start": r["start"], "Trough": r["end"],
            "Portfolio": r["portfolio_return_%"], "SPY": r["SPY_return_%"],
            "Max DD": r["max_drawdown_%"], "Worst day": r["worst_day_%"],
            "Worst 21d": r["worst_21d_%"], "Bets": r["independent_bets"],
            "Best": r["best_holding"], "Best %": r["best_holding_return_%"],
            "Worst": r["worst_holding"], "Worst %": r["worst_holding_return_%"],
        }), hide_index=True, width="stretch", column_config={
            "Portfolio": SPCT, "SPY": SPCT, "Max DD": PCT, "Worst day": PCT, "Worst 21d": PCT,
            "Bets": NUM1, "Best %": SPCT, "Worst %": SPCT})
        a, b = st.columns([1, 1.2], gap="large")
        with a:
            st.markdown("<div class='meta'>PORTFOLIO VS SPY · %</div>", unsafe_allow_html=True)
            chart(ch.replay_bars(r))
        with b:
            rh = res["replay_holdings"].drop(columns="weight_%")
            long = rh.reset_index().melt("ticker", var_name="crisis", value_name="ret").dropna()
            st.markdown("<div class='meta'>RETURN BY HOLDING AND CRISIS · %</div>",
                        unsafe_allow_html=True)
            chart(ch.heatmap(long, "crisis", "ticker", "ret", list(rh.columns),
                             list(rh.mean(axis=1).sort_values(ascending=False).index)))


# ---------------------------------------------------------------------------------------
# Page: Daily report
# ---------------------------------------------------------------------------------------


def page_report() -> None:
    header("Monitoring", "Daily report",
           "Value, allocation drift, market regime and diversification in one page, with "
           "alerts only for what changed since the previous report.")
    MY_DIR.mkdir(parents=True, exist_ok=True)
    files = sorted(p for p in MY_DIR.glob("*.csv") if not p.stem.endswith("_history"))
    if not files:
        note("Save positions on the Portfolio page first.")
        return
    c1, c2, _ = st.columns([1.2, 0.8, 2])
    which = c1.selectbox("Portfolio", [p.stem for p in files])
    c2.write("")
    c2.write("")
    go = c2.button("Generate", type="primary", width="stretch")
    path = MY_DIR / f"{which}.csv"
    latest = BASE / "outputs" / "reports" / f"{which}_latest.html"
    if go:
        with st.spinner("Fetching prices and building the report (20–40 s)"):
            try:
                st.session_state[f"report_{which}"] = rp.run_report(make_cfg(), path,
                                                                    synthetic=demo)
            except Exception as exc:
                st.error(f"Report failed: {exc}")
    res = st.session_state.get(f"report_{which}")
    page_html = res["html"] if res else (latest.read_text() if latest.exists() else None)
    if res and res["synthetic"]:
        flag("Synthetic prices: results are illustrative only.", negative=True)
    if page_html:
        st.markdown(f"<div class='meta'>{'GENERATED NOW' if res else 'LAST SAVED REPORT'} · "
                    f"ARCHIVE IN {latest.parent.relative_to(BASE)}/</div>", unsafe_allow_html=True)
        components.html(page_html, height=2400, scrolling=True)


# ---------------------------------------------------------------------------------------
# Shared: pick a portfolio (a candidate allocation or one of your holdings files)
# ---------------------------------------------------------------------------------------


def portfolio_sources() -> dict[str, tuple[str, Path]]:
    out = {f"Allocation · {n}": ("cand", p) for n, p in candidate_files().items()}
    MY_DIR.mkdir(parents=True, exist_ok=True)
    for p in sorted(MY_DIR.glob("*.csv")):
        if not p.stem.endswith("_history"):
            out[f"My portfolio · {p.stem}"] = ("mine", p)
    return out


def weights_for(kind: str, path: Path) -> tuple[pd.Series, str]:
    """Weights by ticker. Holdings use current market values (else their targets)."""
    if kind == "cand":
        return pdx.load_portfolio(path, min_holdings=1), "target weights"
    h = hd.load_holdings(path)
    if (h.loc[h["ticker"] != hd.CASH, "shares"] > 0).any():
        table, _ = hd.value_holdings(h, make_cfg(), demo)
        w = hd.weights_from_holdings(table)
        if len(w):
            return w, "current market values (cash excluded)"
    t = h[(h["ticker"] != hd.CASH) & (h["target_weight"] > 0)]
    return pd.Series(t["target_weight"].to_numpy(), index=t["ticker"]) / t["target_weight"].sum(), \
        "target weights"


def weights_caption(w: pd.Series, basis: str) -> None:
    parts = " · ".join(f"{t} {100 * x:.0f}%" for t, x in w.sort_values(ascending=False).items())
    st.markdown(f"<div class='meta'>WEIGHTS ({basis.upper()}) · {parts}</div>", unsafe_allow_html=True)


# ---------------------------------------------------------------------------------------
# Page: Projections
# ---------------------------------------------------------------------------------------


def page_projections() -> None:
    header("Planning", "Projections",
           "Simulate thousands of possible futures for one or more portfolios. Each future is "
           "stitched together from random 12-month stretches of real history, and every "
           "portfolio goes through the same scenarios, so the comparison is fair.")
    sources = portfolio_sources()
    section("Portfolios")
    chosen = st.multiselect("Saved portfolios (up to 6)", list(sources),
                            default=list(sources)[:3], max_selections=6)
    with st.expander("Custom mix (optional)"):
        cname = st.text_input("Name", value="custom mix")
        cdf = st.data_editor(pd.DataFrame({"ticker": ["VTI", "VXUS", "BND"], "weight": [50.0, 20.0, 30.0]}),
                             num_rows="dynamic", width="stretch", key="proj_custom",
                             column_config={"ticker": st.column_config.TextColumn("Ticker"),
                                            "weight": st.column_config.NumberColumn("Weight %", min_value=0.0,
                                                                                    format="%.1f")})
        use_custom = st.checkbox("Include this mix", value=False)
        if st.button("Save as allocation", disabled=not cname.strip()):
            cw = clean_weights(cdf)
            if cw.empty:
                st.error("Add at least one ticker with a weight.")
            else:
                write_weights(cw, CAND_DIR / f"{len(candidate_files()) + 1}_{slug(cname)}.csv")
                st.toast("Saved. It now appears in the list above and on the Compare page.")
                st.rerun()

    section("Plan")
    c = st.columns([1, 1, 1, 1], gap="medium")
    initial = c[0].number_input("Starting amount ($)", min_value=0.0, value=10_000.0, step=1000.0)
    monthly = c[1].number_input("Added every month ($)", min_value=0.0, value=500.0, step=50.0)
    years = c[2].slider("Years", 1, 40, 20)
    goal = c[3].number_input("Goal ($, optional)", min_value=0.0, value=0.0, step=10_000.0)
    c = st.columns([1, 1, 1, 1], gap="medium")
    real = c[0].toggle("Today's dollars", value=True,
                       help="Removes inflation so amounts are in today's purchasing power.")
    infl = c[1].number_input("Inflation %/yr", 0.0, 10.0, 2.5, 0.1, disabled=not real)
    fee = c[2].number_input("Fund fees %/yr", 0.0, 2.0, 0.05, 0.01,
                            help="Weighted expense ratio; most broad index ETFs are 0.03–0.10%.")
    adjust = c[3].number_input("Pessimism %/yr", 0.0, 5.0, 0.0, 0.25,
                               help="Subtract this from every year's return. The history used "
                                    "was strong for US stocks and bonds; 1–2% is a cautious setting.")
    if st.button("Run simulations", type="primary", disabled=not (chosen or use_custom)):
        with st.spinner("Downloading history and simulating 5,000 futures per portfolio"):
            try:
                ports, bases = {}, {}
                for src in chosen:
                    kind, path = sources[src]
                    ports[src.split(" · ", 1)[1]], bases[src.split(" · ", 1)[1]] = weights_for(kind, path)
                if use_custom:
                    cw = clean_weights(cdf)
                    if not cw.empty:
                        ports[cname or "custom mix"] = pd.Series(cw["weight"].to_numpy(),
                                                                 index=cw["ticker"]) / cw["weight"].sum()
                        bases[cname or "custom mix"] = "custom weights"
                plan = pj.Plan(initial=initial, monthly=monthly, years=years, fee_pct=fee,
                               adjust_pct=adjust, inflation_pct=infl, real=real, goal=goal or None)
                many = pj.project_many(ports, plan, make_cfg(), synthetic=demo)
                many["bases"] = bases
                st.session_state["projection_many"] = many
            except Exception as exc:
                st.error(f"Simulation failed: {exc}")
    many = st.session_state.get("projection_many")
    if many:
        show_projections(many)


def show_projections(many: dict) -> None:
    plan, results = many["plan"], many["results"]
    names = list(results)
    section("Results")
    if many["synthetic"]:
        flag("Synthetic prices: results are illustrative only.", negative=True)
    st.markdown(f"<div class='meta'>{plan.sims:,} SCENARIOS PER PORTFOLIO · SAME SCENARIOS FOR ALL · "
                f"HISTORY {many['start']:%Y-%m} → {many['end']:%Y-%m} ({many['months']} MONTHS) · "
                f"{plan.years} YEARS · {'TODAY’S $' if plan.real else 'NOMINAL $'} · FEES "
                f"{plan.fee_pct:.2f}% · PESSIMISM {plan.adjust_pct:.2f}%</div>", unsafe_allow_html=True)
    t = pj.comparison_table(many)
    contributed = float(t["contributed"].iloc[0])
    st.markdown(f"<div class='meta'>CONTRIBUTED OVER {plan.years} YEARS: {fmt_money(contributed)}"
                "</div>", unsafe_allow_html=True)
    cols = {"Portfolio": t["portfolio"], "Average return /yr": t["mean_ret"],
            "Typical (median) /yr": t["median_ret"], "Bad case /yr": t["bad_ret"],
            "Good case /yr": t["good_ret"], "Average final $": t["final_mean"],
            "Median final $": t["final_median"], "Bad case $": t["final_bad"],
            "Good case $": t["final_good"], "P(below contributed)": t["p_below"],
            "Typical worst drop": t["mdd_median"]}
    if plan.goal:
        cols[f"P(reach {fmt_money(plan.goal)})"] = t["p_goal"]
    st.dataframe(pd.DataFrame(cols), hide_index=True, width="stretch", column_config={
        "Average return /yr": PCT, "Typical (median) /yr": PCT, "Bad case /yr": PCT,
        "Good case /yr": PCT, "Average final $": USD, "Median final $": USD, "Bad case $": USD,
        "Good case $": USD, "P(below contributed)": st.column_config.NumberColumn(format="%.0f%%"),
        "Typical worst drop": PCT,
        f"P(reach {fmt_money(plan.goal)})": st.column_config.NumberColumn(format="%.0f%%")})
    note("Average = mean over all scenarios; it is pulled up by a few very lucky futures, so the "
         "average final $ is above the median. Median = what a typical scenario got; plan around "
         "the median and the bad case (10th percentile: 1 in 10 scenarios did worse).")
    a, b = st.columns([1.4, 1], gap="large")
    with a:
        st.markdown("<div class='meta'>MEDIAN (SOLID) AND BAD CASE (DASHED) · GREY = CONTRIBUTED"
                    "</div>", unsafe_allow_html=True)
        chart(ch.median_compare(results, names))
    with b:
        st.markdown("<div class='meta'>SPREAD OF RETURNS ACROSS ALL SCENARIOS · DASHED = AVERAGE"
                    "</div>", unsafe_allow_html=True)
        chart(ch.return_distribution({n: results[n]["ann"] for n in names}, names))

    section("Scenarios · one portfolio")
    pick = st.selectbox("Show scenarios for", names)
    res = results[pick]
    weights_caption(res["weights"], many["bases"].get(pick, "weights"))
    s = res["summary"]
    m = st.columns(5)
    m[0].metric("Average return /yr", fmt_pct(100 * s["ann_return_mean"], False))
    m[1].metric("Typical (median) /yr", fmt_pct(100 * s["ann_return"][50], False))
    m[2].metric("Bad case $ (10th)", fmt_money(s["final"][10]))
    m[3].metric("Median $", fmt_money(s["final"][50]))
    m[4].metric("Good case $ (90th)", fmt_money(s["final"][90]))
    a, b = st.columns([1.6, 1], gap="large")
    with a:
        st.markdown(f"<div class='meta'>{len(res['samples'].columns) - 1} OF {plan.sims:,} SIMULATED "
                    "FUTURES (FAINT) · MEDIAN, 10TH AND 90TH PERCENTILE</div>", unsafe_allow_html=True)
        chart(ch.scenario_paths(res["samples"], res["paths"]))
    with b:
        ms = pj.milestones(res["paths"])
        st.markdown("<div class='meta'>MILESTONES</div>", unsafe_allow_html=True)
        st.dataframe(pd.DataFrame({
            "Year": ms["year"].round(0).astype(int), "Contributed": ms["contributed"],
            "Bad (10th)": ms["p10"], "Median": ms["p50"], "Good (90th)": ms["p90"]}),
            hide_index=True, width="stretch", column_config={
                "Contributed": USD, "Bad (10th)": USD, "Median": USD, "Good (90th)": USD})
    note("A range, not a forecast: futures are reshuffled pieces of the historical window shown "
         "above, so shocks worse than any in that window cannot appear. Use the pessimism setting "
         "to stress the plan. Not financial advice.")


# ---------------------------------------------------------------------------------------
# Page: Hedges
# ---------------------------------------------------------------------------------------


def show_hedge_ratio(res: dict) -> None:
    t = res["table"]
    section("How much to hold")
    pick = st.selectbox("Candidate", list(t["ticker"]),
                        format_func=lambda x: f"{x} · {t.set_index('ticker').at[x, 'what']}")
    row = t.set_index("ticker").loc[pick]
    pr, cr = res["series"][pick]
    front = hg.hedge_frontier(pr, cr)
    roll = hg.rolling_min_variance(pr, cr)
    m = st.columns(4)
    m[0].metric("Min-variance weight (0–50%)", f"{row['minvar_w_%']:.0f}%")
    m[1].metric("Min-CVaR weight (0–50%)", f"{row['mincvar_w_%']:.0f}%",
                delta=f"worst drop {row['mincvar_dd_change_pts']:+.1f} pts", delta_color="off",
                delta_arrow="off")
    m[2].metric("Growth change at min-CVaR", f"{row['mincvar_cagr_change_pts']:+.2f} pts/yr")
    if len(roll):
        m[3].metric("Rolling min-var (uncapped)", f"{100 * roll.min():.0f}–{100 * roll.max():.0f}%",
                    delta=f"now {100 * roll.iloc[-1]:.0f}%", delta_color="off", delta_arrow="off")
    left, right = ch.hedge_tradeoff(front, row["minvar_w_%"], row["mincvar_w_%"])
    a, b = st.columns(2, gap="large")
    with a:
        st.markdown("<div class='meta'>PROTECTION GAINED VS NO HEDGE</div>", unsafe_allow_html=True)
        chart(left)
    with b:
        st.markdown("<div class='meta'>COST: GROWTH AND VOLATILITY VS NO HEDGE</div>",
                    unsafe_allow_html=True)
        chart(right)
    if len(roll):
        st.markdown("<div class='meta'>MIN-VARIANCE WEIGHT RE-ESTIMATED EVERY MONTH ON THE PRIOR 3 "
                    "YEARS · DASHED = AVERAGE</div>", unsafe_allow_html=True)
        chart(ch.rolling_weight(roll))
    note("Weights are searched from 0 to 50% so the hedge stays a sleeve, not the whole portfolio. "
         "Min-variance often favours whatever is calmest (that is de-risking, not hedging); "
         "min-CVaR targets the worst weeks directly. Both are estimated on past data, and the "
         "rolling chart shows how much the 'right' weight moves: treat them as a range, pick a "
         "round number inside it, and prefer the flat part of the protection curve.")


def page_hedges() -> None:
    header("Risk", "Hedge finder",
           "Which assets historically offset this portfolio's losses, and what they cost in "
           "return. Tests common hedge ETFs plus any tickers you add.")
    sources = portfolio_sources()
    if not sources:
        note("Create an allocation on the Compare page first.")
        return
    section("Setup")
    c = st.columns([1.6, 1, 1.6], gap="medium")
    src = c[0].selectbox("Portfolio", list(sources))
    add = c[1].slider("Test holding (%)", 5, 30, 10, 5,
                      help="Each candidate is tested as this share of the portfolio, with the "
                           "rest held pro rata in your current mix.")
    extra = c[2].text_input("Also test these tickers (comma separated)",
                            placeholder="e.g. KO, JNJ, BRK-B, DBMF")
    if st.button("Find hedges", type="primary"):
        kind, path = sources[src]
        with st.spinner("Downloading histories and testing candidates"):
            try:
                w, basis = weights_for(kind, path)
                res = hg.analyse(w, make_cfg(), add_pct=add, extra=extra.split(","),
                                 synthetic=demo)
                res["basis"] = basis
                st.session_state["hedges"] = res
            except Exception as exc:
                st.error(f"Hedge analysis failed: {exc}")
    res = st.session_state.get("hedges")
    if res:
        show_hedges(res)


def show_hedges(res: dict) -> None:
    t = res["table"]
    section("Candidates")
    if res["synthetic"]:
        flag("Synthetic prices: results are illustrative only.", negative=True)
    weights_caption(res["weights"], res["basis"])
    st.markdown(f"<div class='meta'>PORTFOLIO HISTORY FROM {res['port_start']:%Y-%m-%d} · "
                f"WORST DROP {res['port_maxdd_%']:.1f}% · EACH CANDIDATE TESTED AT "
                f"{res['add_pct']:.0f}% · MEASURED OVER THE YEARS BOTH EXIST</div>",
                unsafe_allow_html=True)
    if t.empty:
        note("No candidate had enough overlapping history.")
        return
    st.dataframe(pd.DataFrame({
        "Ticker": t["ticker"], "What": t["what"], "Verdict": t["verdict"],
        "In your worst weeks": t["tail_ret_%"], "Corr.": t["corr"],
        "Up in your losing crises": t["crises_up"], "Worst drop Δ": t["maxdd_change_pts"],
        "Volatility Δ": t["vol_change_pts"], "Growth Δ /yr": t["cagr_change_pts"],
        "Own growth /yr": t["cagr_%"], "Min-var wt": t["minvar_w_%"],
        "Min-CVaR wt": t["mincvar_w_%"], "Since": t["since"],
    }), hide_index=True, width="stretch", column_config={
        "Min-var wt": st.column_config.NumberColumn(format="%.0f%%",
            help="Weight (0-50%) that minimised the portfolio's variance"),
        "Min-CVaR wt": st.column_config.NumberColumn(format="%.0f%%",
            help="Weight (0-50%) that made the average of the worst 5% of weeks least bad"),
        "In your worst weeks": st.column_config.NumberColumn(format="%+.2f%%",
            help="Average weekly return during the portfolio's worst 5% of weeks"),
        "Corr.": st.column_config.NumberColumn(format="%+.2f"),
        "Worst drop Δ": st.column_config.NumberColumn(format="%+.1f",
            help="Points by which the worst drop gets smaller (positive = more protection)"),
        "Volatility Δ": st.column_config.NumberColumn(format="%+.1f"),
        "Growth Δ /yr": st.column_config.NumberColumn(format="%+.2f",
            help="Change in growth per year: the cost of holding the hedge"),
        "Own growth /yr": PCT})
    note("Hedge = rose in your worst weeks, cut the worst drop and rose in most crises where "
         "you lost money. Diversifier = softened the worst drop without rising. Deltas compare "
         "the portfolio with and without the candidate over the same years.")
    for tk, txt in [(r["ticker"], r["note"]) for _, r in t.iterrows() if r["note"]]:
        st.markdown(f"<div class='meta'>{tk} · {txt}</div>", unsafe_allow_html=True)
    st.markdown("<div class='meta'>PROTECTION VS COST</div>", unsafe_allow_html=True)
    chart(ch.hedge_scatter(t))
    if True:
        cr = res["crises"]
        if not cr.empty:
            port = cr.groupby("crisis", sort=False)["portfolio"].first()
            rows = cr[cr["ticker"].isin(t["ticker"])]
            port_rows = pd.DataFrame({"ticker": "YOUR PORTFOLIO", "crisis": port.index,
                                      "ret": port.to_numpy()})
            long = pd.concat([port_rows, rows[["ticker", "crisis", "ret"]]])
            st.markdown("<div class='meta'>RETURN IN EACH CRISIS · %</div>", unsafe_allow_html=True)
            long = long.replace({"ticker": {"YOUR PORTFOLIO": "YOU"}})
            chart(ch.heatmap(long, "crisis", "ticker", "ret", list(port.index),
                             ["YOU"] + list(t["ticker"])))
    if res["skipped"]:
        st.markdown("<div class='meta'>SKIPPED · " + " · ".join(res["skipped"]) + "</div>",
                    unsafe_allow_html=True)
    show_hedge_ratio(res)
    note("Hedges change with the type of crisis (Treasuries protected in 2008 and 2020 but fell "
         "with stocks in 2022). Prefer candidates that helped across several crises, and weigh "
         "the cost in growth. Analysis of past data, not a recommendation.")


if page == "Compare":
    page_compare()
elif page == "Portfolio":
    page_portfolio()
elif page == "Projections":
    page_projections()
elif page == "Hedges":
    page_hedges()
else:
    page_report()

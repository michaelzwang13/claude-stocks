"""Streamlit sidebar: ticker input, past analyses, dashboard toggle."""
from __future__ import annotations

import streamlit as st

from claude_stocks.analysis.pipeline import CostCapExceeded, analyze_sync
from claude_stocks.backtest.refresh import refresh_all
from claude_stocks.data.composite import build_default_provider
from claude_stocks.db import analyses_repo
from claude_stocks.disclaimer import DISCLAIMER_SHORT


def render() -> None:
    with st.sidebar:
        st.markdown("## Claude-Stocks")
        st.caption(DISCLAIMER_SHORT)

        ticker_input = st.text_input("Ticker", key="ticker_input", max_chars=10, placeholder="AAPL")
        analyze_clicked = st.button("Analyze", type="primary", use_container_width=True)

        if analyze_clicked and ticker_input.strip():
            _run_analysis(ticker_input.strip().upper())

        st.divider()
        _render_past_analyses()

        st.divider()
        _render_dashboard_controls()

        st.divider()
        cost_today = analyses_repo.todays_cost_usd()
        st.caption(f"Today's API spend: ${cost_today:.2f}")


def _run_analysis(ticker: str) -> None:
    provider = build_default_provider()
    with st.status(f"Analyzing {ticker}…", expanded=True) as status:
        try:
            st.write("Fetching market data…")
            st.write("Running 5 factor analyses in parallel (Sonnet 4.6)…")
            st.write("Synthesizing rating (Opus 4.7)…")
            result = analyze_sync(ticker, provider)
            status.update(label=f"{ticker} → {result['synthesis']['overall_rating']}", state="complete")
            st.session_state["current_analysis_id"] = result["analysis_id"]
            st.session_state["current_view"] = "ticker"
            st.session_state["fresh_result"] = result
            st.rerun()
        except CostCapExceeded as e:
            status.update(label="Cost cap hit", state="error")
            st.error(str(e))
        except Exception as e:
            status.update(label="Analysis failed", state="error")
            st.exception(e)


def _render_past_analyses() -> None:
    st.markdown("**Past analyses**")
    recent = analyses_repo.list_recent(limit=25)
    if not recent:
        st.caption("No analyses yet — enter a ticker above.")
        return
    for a in recent:
        when = a.created_at[:10]
        label = f"{when}  ·  {a.ticker}  ·  {a.overall_rating}  {a.overall_score:.1f}"
        if st.button(label, key=f"past-{a.id}", use_container_width=True):
            st.session_state["current_analysis_id"] = a.id
            st.session_state["current_view"] = "ticker"
            st.session_state.pop("fresh_result", None)
            st.rerun()


def _render_dashboard_controls() -> None:
    st.markdown("**Dashboard**")
    if st.button("View backtest dashboard", use_container_width=True):
        st.session_state["current_view"] = "dashboard"
        st.rerun()
    if st.button("Refresh performance now", use_container_width=True):
        with st.spinner("Refreshing performance snapshots…"):
            try:
                result = refresh_all()
                st.toast(f"Refresh done. {result['snapshots_written']} new snapshots.", icon="✅")
            except Exception as e:
                st.toast(f"Refresh failed: {e}", icon="⚠️")

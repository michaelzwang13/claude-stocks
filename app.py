"""Streamlit entrypoint. Run with: streamlit run app.py"""
from __future__ import annotations

import logging

import streamlit as st

from claude_stocks.backtest.scheduler import init_scheduler, maybe_catchup
from claude_stocks.db.migrations import apply_schema
from claude_stocks.disclaimer import DISCLAIMER_SHORT
from claude_stocks.ui import analysis_view, backtest_view, sidebar

logging.basicConfig(level=logging.INFO)


@st.cache_resource
def _startup() -> None:
    """Run once per Streamlit process: migrate DB + start scheduler + catch up."""
    apply_schema()
    init_scheduler()
    maybe_catchup()


def main() -> None:
    st.set_page_config(page_title="Claude-Stocks", layout="wide")
    _startup()

    if "current_view" not in st.session_state:
        st.session_state["current_view"] = "ticker"
    if "disclaimer_ack" not in st.session_state:
        st.session_state["disclaimer_ack"] = False

    sidebar.render()

    if not st.session_state["disclaimer_ack"]:
        with st.container(border=True):
            st.warning(
                f"**{DISCLAIMER_SHORT}**  This is an experimental personal tool. "
                "Claude is not a financial advisor."
            )
            if st.button("I understand — continue", type="primary"):
                st.session_state["disclaimer_ack"] = True
                st.rerun()
        return

    view = st.session_state["current_view"]
    if view == "dashboard":
        backtest_view.render()
    else:
        analysis_view.render()


if __name__ == "__main__":
    main()

"""Main per-ticker analysis view."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pandas as pd
import streamlit as st

from claude_stocks.backtest.intervals import INTERVALS, ORDER
from claude_stocks.db import analyses_repo, performance_repo
from claude_stocks.ui.components import factor_card, rating_badge


def render() -> None:
    analysis_id = st.session_state.get("current_analysis_id")
    if not analysis_id:
        st.info("Enter a ticker in the sidebar to begin.")
        return

    record = analyses_repo.get_by_id(analysis_id)
    if not record:
        st.error(f"Analysis #{analysis_id} not found.")
        return

    synthesis = record.full_json["synthesis"]
    factors = record.full_json["factors"]
    fresh = st.session_state.get("fresh_result")
    raw = fresh if fresh and fresh.get("analysis_id") == analysis_id else None

    _render_header(record, synthesis)
    st.markdown("")
    _render_factor_cards(factors)
    st.markdown("")

    tabs = st.tabs(["Reasoning", "Raw Data", "Backtest", "Cost"])
    with tabs[0]:
        _render_reasoning(synthesis, factors)
    with tabs[1]:
        _render_raw_data(raw)
    with tabs[2]:
        _render_backtest(record)
    with tabs[3]:
        _render_cost(record)


def _render_header(record, synthesis) -> None:
    left, right = st.columns([3, 2])
    with left:
        st.markdown(f"### {record.ticker}")
        st.caption(f"Analyzed {record.created_at[:19].replace('T', ' ')} UTC  ·  entry ${record.entry_price:.2f}")
    with right:
        rating_badge(record.overall_rating, record.overall_score)
        st.caption(
            f"Spike potential: **{synthesis['spike_potential']}**  ·  "
            f"Confidence: **{synthesis['confidence']}**"
        )


def _render_factor_cards(factors) -> None:
    order = ["valuation", "growth", "moat", "sentiment", "catalysts"]
    by_name = {f["factor"]: f for f in factors}
    row1 = st.columns(3)
    row2 = st.columns(3)
    slots = list(row1) + list(row2)
    for slot, name in zip(slots, order):
        f = by_name.get(name)
        if not f:
            continue
        with slot:
            factor_card(f)


def _render_reasoning(synthesis, factors) -> None:
    st.markdown("#### Thesis")
    st.write(synthesis["thesis"])

    if synthesis.get("risks"):
        st.markdown("#### Risks")
        for r in synthesis["risks"]:
            st.markdown(f"- {r}")

    if synthesis.get("catalysts_to_watch"):
        st.markdown("#### Catalysts to watch")
        for c in synthesis["catalysts_to_watch"]:
            st.markdown(f"- {c}")

    if synthesis.get("spike_rationale"):
        st.markdown("#### Spike rationale")
        st.write(synthesis["spike_rationale"])

    st.markdown("#### Per-factor reasoning")
    for f in factors:
        with st.expander(
            f"{f['factor'].capitalize()}  ·  {f['score']:.1f}/10  ·  {f['rating']}  ·  confidence: {f['confidence']}",
            expanded=False,
        ):
            st.write(f["reasoning"])
            if f.get("key_points"):
                st.markdown("**Key points**")
                for p in f["key_points"]:
                    st.markdown(f"- {p}")
            if f.get("data_gaps"):
                st.markdown("**Data gaps**")
                for g in f["data_gaps"]:
                    st.markdown(f"- {g}")


def _render_raw_data(raw) -> None:
    if raw is None:
        st.info(
            "Raw data is only retained for the freshly-run analysis "
            "(it's not saved to the DB). Re-run the analysis to inspect it."
        )
        return
    st.markdown("**Quote**")
    st.json(raw["quote"], expanded=False)
    st.markdown("**Fundamentals**")
    st.json(raw["fundamentals"], expanded=False)
    if raw.get("competitors"):
        st.markdown("**Competitors**")
        st.dataframe(pd.DataFrame(raw["competitors"]), use_container_width=True)
    if raw.get("news"):
        st.markdown(f"**News ({len(raw['news'])} items)**")
        st.dataframe(
            pd.DataFrame(
                [
                    {
                        "published": n["published_at"][:10],
                        "source": n["source"],
                        "headline": n["headline"],
                        "sentiment": n["sentiment_score"],
                    }
                    for n in raw["news"]
                ]
            ),
            use_container_width=True,
        )


def _render_backtest(record) -> None:
    snapshots = performance_repo.snapshots_for_analysis(record.id)
    by_interval = {s["interval"]: s for s in snapshots}

    rows = []
    entry_dt = datetime.fromisoformat(record.created_at)
    if entry_dt.tzinfo is None:
        entry_dt = entry_dt.replace(tzinfo=timezone.utc)

    for interval in ORDER:
        days = INTERVALS[interval]
        target = entry_dt + timedelta(days=days)
        snap = by_interval.get(interval)
        if snap and snap["return_pct"] is not None:
            rows.append(
                {
                    "interval": interval,
                    "elapsed": "✓",
                    "return": f"{snap['return_pct']:+.2f}%",
                    "SPY return": f"{snap['spy_return_pct']:+.2f}%" if snap["spy_return_pct"] is not None else "—",
                    "alpha": f"{snap['alpha_pct']:+.2f}%" if snap["alpha_pct"] is not None else "—",
                }
            )
        else:
            days_until = (target - datetime.now(timezone.utc)).days
            rows.append(
                {
                    "interval": interval,
                    "elapsed": f"in {days_until}d" if days_until > 0 else "pending refresh",
                    "return": "—",
                    "SPY return": "—",
                    "alpha": "—",
                }
            )

    st.dataframe(pd.DataFrame(rows), use_container_width=True, hide_index=True)
    st.caption("Returns and alpha vs SPY are computed by the daily refresh job once each interval has elapsed.")


def _render_cost(record) -> None:
    st.markdown("**Token usage for this analysis**")
    cols = st.columns(4)
    cols[0].metric("Input", f"{record.total_input_tokens:,}")
    cols[1].metric("Output", f"{record.total_output_tokens:,}")
    cols[2].metric("Cache read", f"{record.total_cache_read_tokens:,}")
    cols[3].metric("Cache write", f"{record.total_cache_write_tokens:,}")
    st.metric("Cost", f"${record.total_cost_usd:.4f}")
    st.caption(
        f"Factor model: {record.factor_model}  ·  Synthesis model: {record.synthesis_model}"
    )

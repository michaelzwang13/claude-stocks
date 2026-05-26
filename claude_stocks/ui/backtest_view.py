"""Backtest dashboard: aggregate performance + per-factor predictiveness."""
from __future__ import annotations

import pandas as pd
import streamlit as st

from claude_stocks.backtest.intervals import ORDER
from claude_stocks.db import performance_repo
from claude_stocks.db.connection import get_conn


def render() -> None:
    st.markdown("### Backtest dashboard")
    st.caption(
        "Forward-tracking: every analysis records entry price + timestamp; "
        "returns and SPY alpha are filled in by the daily refresh as intervals elapse."
    )

    _render_kpis()
    st.markdown("")

    st.markdown("#### Performance by rating × interval")
    df_rating = _aggregate_by_rating()
    if df_rating.empty:
        st.info(
            "No filled performance snapshots yet. The 1w window starts paying off "
            "a week after your first analysis."
        )
    else:
        st.dataframe(df_rating, use_container_width=True, hide_index=True)

    st.markdown("#### Per-factor predictiveness")
    df_factor = _aggregate_by_factor_bucket()
    if df_factor.empty:
        st.caption("Not enough filled snapshots yet to bucket by factor score.")
    else:
        st.dataframe(df_factor, use_container_width=True, hide_index=True)
        st.caption(
            "High = factor score ≥ 7, Mid = 4–6.9, Low = <4. Buckets with N<3 are noise."
        )

    st.markdown("#### Every analysis")
    df_all = _per_analysis_table()
    if not df_all.empty:
        st.dataframe(df_all, use_container_width=True, hide_index=True)

    last = performance_repo.last_refresh_at()
    st.caption(f"Last performance refresh: {last or 'never'}")


def _render_kpis() -> None:
    with get_conn() as conn:
        row = conn.execute(
            """
            SELECT
              COUNT(*) AS total_analyses,
              SUM(total_cost_usd) AS total_cost
            FROM analyses
            """
        ).fetchone()
        buys = conn.execute(
            """
            SELECT
              COUNT(*) AS n,
              AVG(return_pct) AS avg_return,
              AVG(alpha_pct)  AS avg_alpha,
              SUM(CASE WHEN return_pct > 0 THEN 1.0 ELSE 0 END) / COUNT(*) * 100 AS hit_rate,
              SUM(CASE WHEN alpha_pct  > 0 THEN 1.0 ELSE 0 END) / COUNT(*) * 100 AS hit_vs_spy
            FROM analyses a
            JOIN performance_snapshots ps ON ps.analysis_id = a.id
            WHERE a.overall_rating = 'BUY' AND ps.return_pct IS NOT NULL
            """
        ).fetchone()

    cols = st.columns(4)
    cols[0].metric("Analyses", str(row["total_analyses"] or 0))
    cols[1].metric("Total API spend", f"${(row['total_cost'] or 0):.2f}")
    if buys and buys["n"]:
        cols[2].metric("BUY hit rate", f"{buys['hit_rate']:.0f}%", help=f"N={buys['n']} (across all intervals)")
        cols[3].metric("BUY avg alpha", f"{(buys['avg_alpha'] or 0):+.2f}%", help=f"Mean alpha vs SPY across BUYs")
    else:
        cols[2].metric("BUY hit rate", "—")
        cols[3].metric("BUY avg alpha", "—")


def _aggregate_by_rating() -> pd.DataFrame:
    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT
              a.overall_rating AS rating,
              ps.interval AS interval,
              COUNT(*) AS n,
              ROUND(AVG(ps.return_pct), 2) AS avg_return_pct,
              ROUND(AVG(ps.alpha_pct), 2)  AS avg_alpha_pct,
              ROUND(SUM(CASE WHEN ps.return_pct > 0 THEN 1.0 ELSE 0 END) / COUNT(*) * 100, 0) AS hit_pct,
              ROUND(SUM(CASE WHEN ps.alpha_pct  > 0 THEN 1.0 ELSE 0 END) / COUNT(*) * 100, 0) AS hit_vs_spy_pct
            FROM analyses a
            JOIN performance_snapshots ps ON ps.analysis_id = a.id
            WHERE ps.return_pct IS NOT NULL
            GROUP BY a.overall_rating, ps.interval
            ORDER BY a.overall_rating, ps.interval
            """
        ).fetchall()
    df = pd.DataFrame([dict(r) for r in rows])
    if df.empty:
        return df
    df["interval"] = pd.Categorical(df["interval"], categories=ORDER, ordered=True)
    return df.sort_values(["rating", "interval"]).reset_index(drop=True)


def _aggregate_by_factor_bucket() -> pd.DataFrame:
    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT
              fs.factor AS factor,
              CASE
                WHEN fs.score >= 7 THEN 'high'
                WHEN fs.score >= 4 THEN 'mid'
                ELSE 'low'
              END AS bucket,
              ps.interval AS interval,
              COUNT(*) AS n,
              ROUND(AVG(ps.return_pct), 2) AS avg_return_pct,
              ROUND(AVG(ps.alpha_pct), 2)  AS avg_alpha_pct
            FROM factor_scores fs
            JOIN performance_snapshots ps ON ps.analysis_id = fs.analysis_id
            WHERE ps.return_pct IS NOT NULL
            GROUP BY fs.factor, bucket, ps.interval
            ORDER BY fs.factor, bucket, ps.interval
            """
        ).fetchall()
    df = pd.DataFrame([dict(r) for r in rows])
    if df.empty:
        return df
    df["interval"] = pd.Categorical(df["interval"], categories=ORDER, ordered=True)
    df["bucket"] = pd.Categorical(df["bucket"], categories=["high", "mid", "low"], ordered=True)
    return df.sort_values(["factor", "bucket", "interval"]).reset_index(drop=True)


def _per_analysis_table() -> pd.DataFrame:
    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT
              a.id AS id,
              substr(a.created_at, 1, 10) AS date,
              a.ticker AS ticker,
              a.overall_rating AS rating,
              ROUND(a.overall_score, 1) AS score,
              a.spike_potential AS spike,
              ROUND(a.entry_price, 2) AS entry,
              ROUND(MAX(CASE WHEN ps.interval = '1w' THEN ps.return_pct END), 2) AS r_1w,
              ROUND(MAX(CASE WHEN ps.interval = '1m' THEN ps.return_pct END), 2) AS r_1m,
              ROUND(MAX(CASE WHEN ps.interval = '3m' THEN ps.return_pct END), 2) AS r_3m,
              ROUND(MAX(CASE WHEN ps.interval = '6m' THEN ps.return_pct END), 2) AS r_6m,
              ROUND(MAX(CASE WHEN ps.interval = '1y' THEN ps.return_pct END), 2) AS r_1y
            FROM analyses a
            LEFT JOIN performance_snapshots ps ON ps.analysis_id = a.id
            GROUP BY a.id
            ORDER BY a.created_at DESC
            """
        ).fetchall()
    return pd.DataFrame([dict(r) for r in rows])

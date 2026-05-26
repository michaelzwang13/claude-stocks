"""Persistence layer for performance_snapshots."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from claude_stocks.db.connection import get_conn


def snapshot_exists(analysis_id: int, interval: str) -> bool:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT 1 FROM performance_snapshots WHERE analysis_id = ? AND interval = ?",
            (analysis_id, interval),
        ).fetchone()
    return row is not None


def insert_snapshot(
    *,
    analysis_id: int,
    interval: str,
    price_at_interval: float | None,
    return_pct: float | None,
    spy_price_at_analysis: float,
    spy_price_at_interval: float | None,
    spy_return_pct: float | None,
    alpha_pct: float | None,
) -> None:
    with get_conn() as conn:
        conn.execute(
            """
            INSERT OR REPLACE INTO performance_snapshots (
                analysis_id, interval, computed_at,
                price_at_interval, return_pct,
                spy_price_at_analysis, spy_price_at_interval, spy_return_pct, alpha_pct
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                analysis_id,
                interval,
                datetime.now(timezone.utc).isoformat(),
                price_at_interval,
                return_pct,
                spy_price_at_analysis,
                spy_price_at_interval,
                spy_return_pct,
                alpha_pct,
            ),
        )


def snapshots_for_analysis(analysis_id: int) -> list[dict[str, Any]]:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM performance_snapshots WHERE analysis_id = ? ORDER BY interval",
            (analysis_id,),
        ).fetchall()
    return [dict(r) for r in rows]


def last_refresh_at() -> str | None:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT MAX(computed_at) AS m FROM performance_snapshots"
        ).fetchone()
    return row["m"] if row and row["m"] else None

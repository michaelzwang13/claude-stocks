"""Per-ticker favorites — flat table keyed by uppercase ticker."""
from __future__ import annotations

from datetime import datetime, timezone

from claude_stocks.db.connection import get_conn


def list_favorites() -> list[str]:
    with get_conn() as conn:
        rows = conn.execute("SELECT ticker FROM favorites ORDER BY ticker").fetchall()
    return [r["ticker"] for r in rows]


def add_favorite(ticker: str) -> None:
    ticker = ticker.upper().strip()
    if not ticker:
        return
    now = datetime.now(timezone.utc).isoformat()
    with get_conn() as conn:
        conn.execute(
            "INSERT OR IGNORE INTO favorites (ticker, created_at) VALUES (?, ?)",
            (ticker, now),
        )


def remove_favorite(ticker: str) -> None:
    ticker = ticker.upper().strip()
    if not ticker:
        return
    with get_conn() as conn:
        conn.execute("DELETE FROM favorites WHERE ticker = ?", (ticker,))

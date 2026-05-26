"""Persistence layer for price_history (SPY benchmark + analyzed tickers)."""
from __future__ import annotations

from datetime import date
from typing import Iterable

from claude_stocks.db.connection import get_conn


def upsert_prices(ticker: str, rows: Iterable[dict]) -> None:
    """rows: iterable of {date, open, high, low, close, adj_close, volume}."""
    with get_conn() as conn:
        conn.executemany(
            """
            INSERT INTO price_history (ticker, date, open, high, low, close, adj_close, volume)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(ticker, date) DO UPDATE SET
                open=excluded.open, high=excluded.high, low=excluded.low,
                close=excluded.close, adj_close=excluded.adj_close, volume=excluded.volume
            """,
            [
                (
                    ticker.upper(),
                    r["date"].isoformat() if hasattr(r["date"], "isoformat") else r["date"],
                    r.get("open"),
                    r.get("high"),
                    r.get("low"),
                    r["close"],
                    r["adj_close"],
                    r.get("volume"),
                )
                for r in rows
            ],
        )


def get_last_cached_date(ticker: str) -> date | None:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT MAX(date) AS d FROM price_history WHERE ticker = ?", (ticker.upper(),)
        ).fetchone()
    if row and row["d"]:
        return date.fromisoformat(row["d"])
    return None


def nearest_trading_day_close(ticker: str, target: date) -> float | None:
    """Return adj_close for ticker on the nearest trading day on or after target.

    If no row exists on/after target (e.g. the future), return None.
    """
    with get_conn() as conn:
        row = conn.execute(
            """
            SELECT adj_close FROM price_history
            WHERE ticker = ? AND date >= ?
            ORDER BY date ASC LIMIT 1
            """,
            (ticker.upper(), target.isoformat()),
        ).fetchone()
    return float(row["adj_close"]) if row else None

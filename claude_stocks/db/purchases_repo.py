"""Tracked purchases — one row per buy lot, freestanding by ticker.

A row is "open" while `sell_date IS NULL` and "closed" once a sell is
recorded. v1 supports closing whole lots only — partial-share sells are
out of scope (DCA into multiple lots and close them individually).
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from claude_stocks.db.connection import get_conn


@dataclass
class PurchaseRecord:
    id: int
    ticker: str
    buy_date: str
    buy_price: float
    shares: float
    analysis_id: int | None
    notes: str | None
    created_at: str
    sell_date: str | None
    sell_price: float | None
    sell_notes: str | None

    @property
    def is_closed(self) -> bool:
        return self.sell_date is not None


def _row_to_record(row: Any) -> PurchaseRecord:
    return PurchaseRecord(
        id=row["id"],
        ticker=row["ticker"],
        buy_date=row["buy_date"],
        buy_price=row["buy_price"],
        shares=row["shares"],
        analysis_id=row["analysis_id"],
        notes=row["notes"],
        created_at=row["created_at"],
        sell_date=row["sell_date"],
        sell_price=row["sell_price"],
        sell_notes=row["sell_notes"],
    )


def list_all() -> list[PurchaseRecord]:
    # Open lots first (by buy_date desc), then closed lots (by sell_date desc).
    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT * FROM purchases
            ORDER BY
              CASE WHEN sell_date IS NULL THEN 0 ELSE 1 END,
              COALESCE(sell_date, buy_date) DESC,
              id DESC
            """
        ).fetchall()
    return [_row_to_record(r) for r in rows]


def list_by_ticker(ticker: str) -> list[PurchaseRecord]:
    ticker = ticker.upper().strip()
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM purchases WHERE ticker = ? ORDER BY buy_date DESC, id DESC",
            (ticker,),
        ).fetchall()
    return [_row_to_record(r) for r in rows]


def get_by_id(purchase_id: int) -> PurchaseRecord | None:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM purchases WHERE id = ?", (purchase_id,)
        ).fetchone()
    return _row_to_record(row) if row else None


def add(
    *,
    ticker: str,
    buy_date: str,
    buy_price: float,
    shares: float = 1.0,
    analysis_id: int | None = None,
    notes: str | None = None,
) -> int:
    ticker = ticker.upper().strip()
    now = datetime.now(timezone.utc).isoformat()
    with get_conn() as conn:
        cur = conn.execute(
            """
            INSERT INTO purchases (ticker, buy_date, buy_price, shares, analysis_id, notes, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (ticker, buy_date, buy_price, shares, analysis_id, notes, now),
        )
        return int(cur.lastrowid)


def sell(
    purchase_id: int,
    *,
    sell_date: str,
    sell_price: float,
    sell_notes: str | None = None,
) -> PurchaseRecord:
    """Close an open lot. Raises ValueError on invalid input or already-closed lot."""
    existing = get_by_id(purchase_id)
    if existing is None:
        raise ValueError(f"purchase {purchase_id} not found")
    if existing.is_closed:
        raise ValueError(f"purchase {purchase_id} is already closed")
    if sell_date < existing.buy_date:
        raise ValueError("sell_date must be on or after buy_date")
    if sell_price <= 0:
        raise ValueError("sell_price must be positive")

    with get_conn() as conn:
        conn.execute(
            """
            UPDATE purchases
            SET sell_date = ?, sell_price = ?, sell_notes = ?
            WHERE id = ?
            """,
            (sell_date, sell_price, sell_notes, purchase_id),
        )
    return get_by_id(purchase_id)  # type: ignore[return-value]


def delete(purchase_id: int) -> None:
    with get_conn() as conn:
        conn.execute("DELETE FROM purchases WHERE id = ?", (purchase_id,))

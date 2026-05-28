"""Tracked purchases — one row per buy lot, freestanding by ticker."""
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
    )


def list_all() -> list[PurchaseRecord]:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM purchases ORDER BY buy_date DESC, id DESC"
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


def delete(purchase_id: int) -> None:
    with get_conn() as conn:
        conn.execute("DELETE FROM purchases WHERE id = ?", (purchase_id,))

"""Idempotent schema apply — runs on app startup."""
from __future__ import annotations

from pathlib import Path

from claude_stocks.db.connection import get_conn

SCHEMA_PATH = Path(__file__).with_name("schema.sql")


def apply_schema() -> None:
    sql = SCHEMA_PATH.read_text()
    with get_conn() as conn:
        conn.executescript(sql)
        _ensure_columns(
            conn,
            "purchases",
            [
                ("sell_date", "TEXT"),
                ("sell_price", "REAL"),
                ("sell_notes", "TEXT"),
            ],
        )


def _ensure_columns(conn, table: str, columns: list[tuple[str, str]]) -> None:
    """Add columns that don't exist yet. Idempotent across restarts.

    Newer rows from `schema.sql` already include the columns; this catches
    DBs created before those columns were added.
    """
    existing = {row["name"] for row in conn.execute(f"PRAGMA table_info({table})")}
    for name, type_ in columns:
        if name not in existing:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {name} {type_}")

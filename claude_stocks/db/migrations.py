"""Idempotent schema apply — runs on app startup."""
from __future__ import annotations

from pathlib import Path

from claude_stocks.db.connection import get_conn

SCHEMA_PATH = Path(__file__).with_name("schema.sql")


def apply_schema() -> None:
    sql = SCHEMA_PATH.read_text()
    with get_conn() as conn:
        conn.executescript(sql)

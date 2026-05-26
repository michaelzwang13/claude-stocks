"""SQLite connection helper with WAL + foreign-key enforcement."""
from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from typing import Iterator

from claude_stocks import config


def _configure(conn: sqlite3.Connection) -> None:
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    conn.row_factory = sqlite3.Row


@contextmanager
def get_conn() -> Iterator[sqlite3.Connection]:
    conn = sqlite3.connect(config.DB_PATH, isolation_level=None)  # autocommit
    _configure(conn)
    try:
        yield conn
    finally:
        conn.close()

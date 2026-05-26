"""TTL'd SQLite k/v cache for raw provider responses.

Keeps free-tier API budgets safe during Streamlit's auto-rerun churn.
"""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timedelta, timezone
from typing import Any, Callable

from claude_stocks.db.connection import get_conn


def _key(method: str, ticker: str, extra: dict[str, Any]) -> str:
    h = hashlib.sha1(
        json.dumps({"m": method, "t": ticker.upper(), "x": extra}, sort_keys=True).encode()
    ).hexdigest()
    return f"{method}:{ticker.upper()}:{h[:12]}"


def get(method: str, ticker: str, extra: dict[str, Any] | None = None) -> Any | None:
    extra = extra or {}
    k = _key(method, ticker, extra)
    now = datetime.now(timezone.utc).isoformat()
    with get_conn() as conn:
        row = conn.execute(
            "SELECT value FROM provider_cache WHERE key = ? AND expires_at > ?",
            (k, now),
        ).fetchone()
    return json.loads(row["value"]) if row else None


def put(
    method: str,
    ticker: str,
    value: Any,
    ttl_seconds: int,
    extra: dict[str, Any] | None = None,
) -> None:
    extra = extra or {}
    k = _key(method, ticker, extra)
    expires = (datetime.now(timezone.utc) + timedelta(seconds=ttl_seconds)).isoformat()
    payload = json.dumps(value)
    with get_conn() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO provider_cache (key, value, expires_at) VALUES (?, ?, ?)",
            (k, payload, expires),
        )


def cached_call(
    method: str,
    ticker: str,
    ttl_seconds: int,
    fetch: Callable[[], Any],
    extra: dict[str, Any] | None = None,
) -> Any:
    hit = get(method, ticker, extra)
    if hit is not None:
        return hit
    value = fetch()
    put(method, ticker, value, ttl_seconds, extra)
    return value


def purge_expired() -> int:
    now = datetime.now(timezone.utc).isoformat()
    with get_conn() as conn:
        cur = conn.execute("DELETE FROM provider_cache WHERE expires_at <= ?", (now,))
    return cur.rowcount

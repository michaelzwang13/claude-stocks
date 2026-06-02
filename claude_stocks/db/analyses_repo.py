"""Persistence layer for analyses + factor scores."""
from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from claude_stocks.db.connection import get_conn


@dataclass
class AnalysisRecord:
    id: int
    ticker: str
    created_at: str
    entry_price: float
    overall_rating: str
    overall_score: float
    spike_potential: str
    confidence: str
    thesis: str
    full_json: dict[str, Any]
    factor_model: str
    synthesis_model: str
    total_input_tokens: int
    total_output_tokens: int
    total_cache_read_tokens: int
    total_cache_write_tokens: int
    total_cost_usd: float


def save_analysis(
    *,
    ticker: str,
    entry_price: float,
    synthesis: dict[str, Any],
    factor_outputs: list[dict[str, Any]],
    factor_model: str,
    synthesis_model: str,
    usage_totals: dict[str, int | float],
) -> int:
    """Insert a full analysis row + 5 factor_scores rows. Returns the new analysis id."""
    full_json = {"synthesis": synthesis, "factors": factor_outputs}
    created_at = datetime.now(timezone.utc).isoformat()

    with get_conn() as conn:
        cur = conn.execute(
            """
            INSERT INTO analyses (
                ticker, created_at, entry_price, overall_rating, overall_score,
                spike_potential, confidence, thesis, full_json,
                factor_model, synthesis_model,
                total_input_tokens, total_output_tokens,
                total_cache_read_tokens, total_cache_write_tokens, total_cost_usd
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                ticker.upper(),
                created_at,
                entry_price,
                synthesis["overall_rating"],
                synthesis["overall_score"],
                synthesis["spike_potential"],
                synthesis["confidence"],
                synthesis["thesis"],
                json.dumps(full_json),
                factor_model,
                synthesis_model,
                int(usage_totals.get("input_tokens", 0)),
                int(usage_totals.get("output_tokens", 0)),
                int(usage_totals.get("cache_read_tokens", 0)),
                int(usage_totals.get("cache_write_tokens", 0)),
                float(usage_totals.get("cost_usd", 0.0)),
            ),
        )
        analysis_id = cur.lastrowid

        for factor in factor_outputs:
            conn.execute(
                """
                INSERT INTO factor_scores (analysis_id, factor, score, rating, confidence)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    analysis_id,
                    factor["factor"],
                    factor["score"],
                    factor["rating"],
                    factor["confidence"],
                ),
            )

    return analysis_id


def _row_to_record(row) -> AnalysisRecord:
    return AnalysisRecord(
        id=row["id"],
        ticker=row["ticker"],
        created_at=row["created_at"],
        entry_price=row["entry_price"],
        overall_rating=row["overall_rating"],
        overall_score=row["overall_score"],
        spike_potential=row["spike_potential"],
        confidence=row["confidence"],
        thesis=row["thesis"],
        full_json=json.loads(row["full_json"]),
        factor_model=row["factor_model"],
        synthesis_model=row["synthesis_model"],
        total_input_tokens=row["total_input_tokens"],
        total_output_tokens=row["total_output_tokens"],
        total_cache_read_tokens=row["total_cache_read_tokens"],
        total_cache_write_tokens=row["total_cache_write_tokens"],
        total_cost_usd=row["total_cost_usd"],
    )


def list_recent(limit: int = 50) -> list[AnalysisRecord]:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM analyses ORDER BY created_at DESC LIMIT ?", (limit,)
        ).fetchall()
    return [_row_to_record(r) for r in rows]


def get_by_id(analysis_id: int) -> AnalysisRecord | None:
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM analyses WHERE id = ?", (analysis_id,)).fetchone()
    return _row_to_record(row) if row else None


def list_by_ticker(ticker: str) -> list[AnalysisRecord]:
    """All analyses for a ticker, chronological (oldest first)."""
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM analyses WHERE ticker = ? ORDER BY created_at ASC",
            (ticker.upper(),),
        ).fetchall()
    return [_row_to_record(r) for r in rows]


def distinct_tickers() -> list[str]:
    with get_conn() as conn:
        rows = conn.execute("SELECT DISTINCT ticker FROM analyses").fetchall()
    return [r["ticker"] for r in rows]


def todays_cost_usd() -> float:
    """Sum total_cost_usd for analyses created today UTC."""
    today = datetime.now(timezone.utc).date().isoformat()
    with get_conn() as conn:
        row = conn.execute(
            "SELECT COALESCE(SUM(total_cost_usd), 0.0) AS spent FROM analyses WHERE substr(created_at, 1, 10) = ?",
            (today,),
        ).fetchone()
    return float(row["spent"])

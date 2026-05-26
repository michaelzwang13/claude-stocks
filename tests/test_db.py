"""DB layer: schema apply, analysis persistence, today's cost rollup."""
from __future__ import annotations

import json
from datetime import datetime, timezone

import pytest

from claude_stocks.db import analyses_repo
from claude_stocks.db.connection import get_conn


def test_schema_creates_all_tables():
    expected = {
        "analyses",
        "factor_scores",
        "performance_snapshots",
        "price_history",
        "provider_cache",
    }
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        ).fetchall()
    names = {r["name"] for r in rows}
    assert expected.issubset(names)


def test_save_and_load_analysis_roundtrip():
    synthesis = {
        "ticker": "AAPL",
        "overall_rating": "BUY",
        "overall_score": 7.5,
        "factor_scores": {"valuation": 7.0, "growth": 8.0, "moat": 8.0, "sentiment": 7.0, "catalysts": 7.0},
        "thesis": "test thesis",
        "risks": ["a", "b"],
        "catalysts_to_watch": ["x"],
        "spike_potential": "moderate",
        "spike_rationale": "...",
        "confidence": "high",
    }
    factors = [
        {
            "factor": "valuation",
            "score": 7.0,
            "rating": "bullish",
            "key_points": ["pe low", "fcf strong"],
            "reasoning": "...",
            "confidence": "high",
            "data_gaps": [],
        },
        {"factor": "growth", "score": 8.0, "rating": "bullish", "key_points": ["a", "b"], "reasoning": ".", "confidence": "high", "data_gaps": []},
        {"factor": "moat", "score": 8.0, "rating": "bullish", "key_points": ["a", "b"], "reasoning": ".", "confidence": "high", "data_gaps": []},
        {"factor": "sentiment", "score": 7.0, "rating": "bullish", "key_points": ["a", "b"], "reasoning": ".", "confidence": "medium", "data_gaps": []},
        {"factor": "catalysts", "score": 7.0, "rating": "bullish", "key_points": ["a", "b"], "reasoning": ".", "confidence": "high", "data_gaps": []},
    ]
    aid = analyses_repo.save_analysis(
        ticker="AAPL",
        entry_price=189.42,
        synthesis=synthesis,
        factor_outputs=factors,
        factor_model="claude-sonnet-4-6",
        synthesis_model="claude-opus-4-7",
        usage_totals={
            "input_tokens": 1000,
            "output_tokens": 500,
            "cache_read_tokens": 0,
            "cache_write_tokens": 2000,
            "cost_usd": 0.12,
        },
    )
    rec = analyses_repo.get_by_id(aid)
    assert rec is not None
    assert rec.ticker == "AAPL"
    assert rec.overall_rating == "BUY"
    assert rec.full_json["synthesis"]["overall_score"] == 7.5
    assert len(rec.full_json["factors"]) == 5


def test_todays_cost_sums_correctly():
    synthesis = {
        "ticker": "AAPL",
        "overall_rating": "HOLD",
        "overall_score": 5.0,
        "factor_scores": {"valuation": 5.0, "growth": 5.0, "moat": 5.0, "sentiment": 5.0, "catalysts": 5.0},
        "thesis": ".",
        "risks": ["a", "b"],
        "catalysts_to_watch": [],
        "spike_potential": "low",
        "spike_rationale": ".",
        "confidence": "medium",
    }
    factors = [
        {"factor": f, "score": 5.0, "rating": "neutral", "key_points": ["a", "b"], "reasoning": ".", "confidence": "medium", "data_gaps": []}
        for f in ("valuation", "growth", "moat", "sentiment", "catalysts")
    ]
    for _ in range(3):
        analyses_repo.save_analysis(
            ticker="AAPL",
            entry_price=100.0,
            synthesis=synthesis,
            factor_outputs=factors,
            factor_model="claude-sonnet-4-6",
            synthesis_model="claude-opus-4-7",
            usage_totals={"input_tokens": 1, "output_tokens": 1, "cache_read_tokens": 0, "cache_write_tokens": 0, "cost_usd": 0.10},
        )
    assert analyses_repo.todays_cost_usd() == pytest.approx(0.30, rel=1e-6)

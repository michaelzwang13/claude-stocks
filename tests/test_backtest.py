"""Backtest math: return computation, SPY alpha, nearest-trading-day lookups."""
from __future__ import annotations

import json
from datetime import date, datetime, timedelta, timezone

import pytest

from claude_stocks.backtest.intervals import INTERVALS
from claude_stocks.backtest.refresh import _compute_one
from claude_stocks.db import analyses_repo, performance_repo, prices_repo
from claude_stocks.db.analyses_repo import AnalysisRecord


def _seed_prices(ticker: str, day_to_price: dict[date, float]) -> None:
    prices_repo.upsert_prices(
        ticker,
        ({"date": d, "close": p, "adj_close": p} for d, p in day_to_price.items()),
    )


def _make_analysis(
    *, ticker: str, entry_price: float, days_ago: int
) -> AnalysisRecord:
    created = datetime.now(timezone.utc) - timedelta(days=days_ago)
    synthesis = {
        "ticker": ticker,
        "overall_rating": "BUY",
        "overall_score": 7.5,
        "factor_scores": {"valuation": 7, "growth": 8, "moat": 8, "sentiment": 7, "catalysts": 7},
        "thesis": "test",
        "risks": ["a", "b"],
        "catalysts_to_watch": ["x"],
        "spike_potential": "moderate",
        "spike_rationale": "y",
        "confidence": "high",
    }
    factor_outputs = [
        {
            "factor": f,
            "score": 7.0,
            "rating": "bullish",
            "key_points": ["a", "b"],
            "reasoning": "...",
            "confidence": "high",
            "data_gaps": [],
        }
        for f in ("valuation", "growth", "moat", "sentiment", "catalysts")
    ]
    # Directly write via repo, but override created_at to days_ago.
    from claude_stocks.db.connection import get_conn

    full_json = json.dumps({"synthesis": synthesis, "factors": factor_outputs})
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
                ticker,
                created.isoformat(),
                entry_price,
                "BUY",
                7.5,
                "moderate",
                "high",
                "test",
                full_json,
                "claude-sonnet-4-6",
                "claude-opus-4-7",
                0,
                0,
                0,
                0,
                0.0,
            ),
        )
        aid = cur.lastrowid
        for f in factor_outputs:
            conn.execute(
                "INSERT INTO factor_scores (analysis_id, factor, score, rating, confidence) VALUES (?, ?, ?, ?, ?)",
                (aid, f["factor"], f["score"], f["rating"], f["confidence"]),
            )
    rec = analyses_repo.get_by_id(aid)
    assert rec is not None
    return rec


def test_nearest_trading_day_skips_weekend():
    _seed_prices("AAPL", {date(2026, 1, 5): 100.0, date(2026, 1, 6): 101.0})
    # Saturday Jan 3, Sunday Jan 4 — nothing seeded. Target = Jan 3 should land on Jan 5.
    got = prices_repo.nearest_trading_day_close("AAPL", date(2026, 1, 3))
    assert got == 100.0


def test_nearest_trading_day_returns_none_if_future():
    _seed_prices("AAPL", {date(2026, 1, 5): 100.0})
    assert prices_repo.nearest_trading_day_close("AAPL", date(2026, 6, 1)) is None


def test_return_and_alpha_math():
    # 10-day-old analysis at $100, ticker up 5%, SPY up 2% -> alpha = 3.
    entry_date = (datetime.now(timezone.utc) - timedelta(days=10)).date()
    target_date_1w = entry_date + timedelta(days=7)

    _seed_prices("AAPL", {entry_date: 100.0, target_date_1w: 105.0})
    _seed_prices("SPY", {entry_date: 400.0, target_date_1w: 408.0})

    rec = _make_analysis(ticker="AAPL", entry_price=100.0, days_ago=10)

    _compute_one(rec, "1w", INTERVALS["1w"])

    snaps = performance_repo.snapshots_for_analysis(rec.id)
    by_interval = {s["interval"]: s for s in snaps}
    assert "1w" in by_interval
    s = by_interval["1w"]
    assert s["price_at_interval"] == pytest.approx(105.0)
    assert s["return_pct"] == pytest.approx(5.0, rel=1e-6)
    assert s["spy_return_pct"] == pytest.approx(2.0, rel=1e-6)
    assert s["alpha_pct"] == pytest.approx(3.0, rel=1e-6)


def test_does_not_overwrite_existing_snapshot():
    entry_date = (datetime.now(timezone.utc) - timedelta(days=10)).date()
    target_date_1w = entry_date + timedelta(days=7)
    _seed_prices("AAPL", {entry_date: 100.0, target_date_1w: 105.0})
    _seed_prices("SPY", {entry_date: 400.0, target_date_1w: 408.0})

    rec = _make_analysis(ticker="AAPL", entry_price=100.0, days_ago=10)
    _compute_one(rec, "1w", INTERVALS["1w"])
    first = performance_repo.snapshots_for_analysis(rec.id)[0]
    # Re-running with different prices should not overwrite the existing snapshot.
    _seed_prices("AAPL", {target_date_1w: 999.0})
    _compute_one(rec, "1w", INTERVALS["1w"])
    second = performance_repo.snapshots_for_analysis(rec.id)[0]
    assert first["return_pct"] == second["return_pct"]


def test_does_not_compute_future_interval():
    rec = _make_analysis(ticker="AAPL", entry_price=100.0, days_ago=2)
    _compute_one(rec, "1w", INTERVALS["1w"])
    snaps = performance_repo.snapshots_for_analysis(rec.id)
    assert snaps == []

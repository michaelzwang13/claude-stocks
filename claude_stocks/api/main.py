"""FastAPI app. Wraps the existing analysis layer.

Run locally:  uvicorn claude_stocks.api.main:app --reload --port 8000
"""
from __future__ import annotations

import asyncio
import json
import logging
from contextlib import asynccontextmanager
from typing import Any, AsyncIterator

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from claude_stocks.analysis.pipeline import (
    CostCapExceeded,
    _competitor_summaries,
    _data_for_factor,
    _run_factor,
    _run_synthesis,
)
from claude_stocks.analysis.schemas import FACTORS
from claude_stocks.backtest.refresh import refresh_all
from claude_stocks.backtest.scheduler import init_scheduler, maybe_catchup, shutdown_scheduler
from claude_stocks.config import (
    ANTHROPIC_API_KEY,
    DAILY_COST_CAP_USD,
    FACTOR_MODEL,
    SYNTHESIS_MODEL,
)
from claude_stocks.data.base import dataclass_to_jsonable
from claude_stocks.data.composite import build_default_provider
from claude_stocks.db import analyses_repo, performance_repo, prices_repo, purchases_repo
from claude_stocks.db.connection import get_conn
from claude_stocks.db.migrations import apply_schema

log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    apply_schema()
    init_scheduler()
    # Run catchup off the event loop so startup doesn't block on yfinance.
    asyncio.create_task(asyncio.to_thread(maybe_catchup))
    try:
        yield
    finally:
        shutdown_scheduler()


app = FastAPI(title="Claude-Stocks API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=False,
)


# ---------- response models ---------------------------------------------------


class AnalysisSummary(BaseModel):
    id: int
    ticker: str
    created_at: str
    entry_price: float
    overall_rating: str
    overall_score: float
    spike_potential: str
    confidence: str
    total_cost_usd: float


class AnalysisDetail(AnalysisSummary):
    thesis: str
    factors: list[dict[str, Any]]
    synthesis: dict[str, Any]
    factor_model: str
    synthesis_model: str
    total_input_tokens: int
    total_output_tokens: int
    total_cache_read_tokens: int
    total_cache_write_tokens: int
    performance: list[dict[str, Any]] = Field(default_factory=list)


class AnalyzeRequest(BaseModel):
    ticker: str


class HealthResponse(BaseModel):
    status: str
    anthropic_key_set: bool
    daily_cost_cap_usd: float
    todays_spend_usd: float


# ---------- helpers -----------------------------------------------------------


def _summary_from_record(r) -> AnalysisSummary:
    return AnalysisSummary(
        id=r.id,
        ticker=r.ticker,
        created_at=r.created_at,
        entry_price=r.entry_price,
        overall_rating=r.overall_rating,
        overall_score=r.overall_score,
        spike_potential=r.spike_potential,
        confidence=r.confidence,
        total_cost_usd=r.total_cost_usd,
    )


def _detail_from_record(r) -> AnalysisDetail:
    snaps = performance_repo.snapshots_for_analysis(r.id)
    return AnalysisDetail(
        id=r.id,
        ticker=r.ticker,
        created_at=r.created_at,
        entry_price=r.entry_price,
        overall_rating=r.overall_rating,
        overall_score=r.overall_score,
        spike_potential=r.spike_potential,
        confidence=r.confidence,
        total_cost_usd=r.total_cost_usd,
        thesis=r.thesis,
        factors=r.full_json["factors"],
        synthesis=r.full_json["synthesis"],
        factor_model=r.factor_model,
        synthesis_model=r.synthesis_model,
        total_input_tokens=r.total_input_tokens,
        total_output_tokens=r.total_output_tokens,
        total_cache_read_tokens=r.total_cache_read_tokens,
        total_cache_write_tokens=r.total_cache_write_tokens,
        performance=snaps,
    )


# ---------- routes ------------------------------------------------------------


@app.get("/api/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(
        status="ok",
        anthropic_key_set=bool(ANTHROPIC_API_KEY),
        daily_cost_cap_usd=DAILY_COST_CAP_USD,
        todays_spend_usd=analyses_repo.todays_cost_usd(),
    )


@app.get("/api/analyses", response_model=list[AnalysisSummary])
def list_analyses(limit: int = Query(default=100, ge=1, le=500)) -> list[AnalysisSummary]:
    return [_summary_from_record(r) for r in analyses_repo.list_recent(limit=limit)]


class CurrentQuote(BaseModel):
    ticker: str
    price: float
    timestamp: str


@app.get("/api/logos")
def logos(tickers: str = Query(..., description="Comma-separated tickers")) -> dict[str, dict[str, str | None]]:
    """Logo URLs (Finnhub-hosted CDN) for the given tickers, cached 30 days.

    Returns {"logos": {TICKER: url-or-null}}. Frontend should fallback to an
    initial-letter badge on null.
    """
    symbols = sorted({t.strip().upper() for t in tickers.split(",") if t.strip()})
    if not symbols:
        return {"logos": {}}
    if len(symbols) > 100:
        raise HTTPException(status_code=400, detail="too many tickers (max 100)")

    provider = build_default_provider()
    out: dict[str, str | None] = {}
    for t in symbols:
        try:
            out[t] = provider.get_logo_url(t)
        except Exception:
            out[t] = None
    return {"logos": out}


@app.get("/api/quotes/current")
def current_quotes(tickers: str = Query(..., description="Comma-separated tickers")) -> dict[str, Any]:
    """Latest quotes for the given tickers, cached 15 min in provider_cache.

    Returns {"quotes": {TICKER: {price, timestamp}}, "errors": {TICKER: msg}}.
    Missing/failed tickers go into `errors`; partial responses are normal.
    """
    symbols = sorted({t.strip().upper() for t in tickers.split(",") if t.strip()})
    if not symbols:
        return {"quotes": {}, "errors": {}}
    if len(symbols) > 100:
        raise HTTPException(status_code=400, detail="too many tickers (max 100)")

    provider = build_default_provider()
    quotes: dict[str, dict[str, Any]] = {}
    errors: dict[str, str] = {}
    for t in symbols:
        try:
            q = provider.get_quote(t)
            quotes[t] = {"price": q.price, "timestamp": q.timestamp.isoformat()}
        except Exception as e:
            errors[t] = str(e)[:200]
    return {"quotes": quotes, "errors": errors}


@app.get("/api/analyses/{analysis_id}", response_model=AnalysisDetail)
def get_analysis(analysis_id: int) -> AnalysisDetail:
    rec = analyses_repo.get_by_id(analysis_id)
    if not rec:
        raise HTTPException(status_code=404, detail="analysis not found")
    return _detail_from_record(rec)


@app.post("/api/analyze")
async def analyze_stream(req: AnalyzeRequest) -> StreamingResponse:
    """SSE stream of analysis progress.

    Events:
      - {phase: 'data',     status: 'start'|'done'}
      - {phase: 'factor',   factor, status: 'start'|'done', output?}
      - {phase: 'synthesis',status: 'start'|'done'}
      - {phase: 'persist',  status: 'done', analysis_id}
      - {phase: 'error',    message}
    """
    return StreamingResponse(_analyze_event_stream(req.ticker), media_type="text/event-stream")


async def _analyze_event_stream(ticker: str) -> AsyncIterator[bytes]:
    def sse(payload: dict) -> bytes:
        return f"data: {json.dumps(payload)}\n\n".encode()

    try:
        if not ANTHROPIC_API_KEY:
            yield sse({"phase": "error", "message": "ANTHROPIC_API_KEY not set on server"})
            return

        today_cost = analyses_repo.todays_cost_usd()
        if today_cost >= DAILY_COST_CAP_USD:
            yield sse({
                "phase": "error",
                "message": (
                    f"Daily cost cap reached: ${today_cost:.2f} of ${DAILY_COST_CAP_USD:.2f}. "
                    f"Increase DAILY_COST_CAP_USD in .env to continue."
                ),
            })
            return

        ticker = ticker.upper().strip()
        if not ticker:
            yield sse({"phase": "error", "message": "ticker is required"})
            return

        provider = build_default_provider()

        yield sse({"phase": "data", "status": "start"})
        try:
            quote = provider.get_quote(ticker)
            fundamentals = provider.get_fundamentals(ticker)
            news = provider.get_news(ticker, days=14, limit=20)
            peers = provider.get_competitors(ticker, limit=5)
            competitors = _competitor_summaries(provider, peers)
            earnings_date = provider.get_earnings_calendar(ticker)
        except Exception as e:
            yield sse({"phase": "error", "message": f"data fetch failed: {e}"})
            return
        yield sse({
            "phase": "data",
            "status": "done",
            "quote": dataclass_to_jsonable(quote),
            "fundamentals_summary": {
                "pe_ratio": fundamentals.pe_ratio,
                "forward_pe": fundamentals.forward_pe,
                "sector": fundamentals.sector,
                "industry": fundamentals.industry,
            },
            "news_count": len(news),
            "competitor_count": len(competitors),
            "earnings_date": earnings_date.isoformat() if earnings_date else None,
        })

        # Run factor calls concurrently. Emit a start for each immediately,
        # then a done as each completes (out-of-order is fine).
        import anthropic

        client = anthropic.AsyncAnthropic(api_key=ANTHROPIC_API_KEY)

        for f in FACTORS:
            yield sse({"phase": "factor", "factor": f, "status": "start"})

        async def run(factor: str):
            data_slice = _data_for_factor(
                factor,
                quote=quote,
                fundamentals=fundamentals,
                news=news,
                competitor_summaries=competitors,
                earnings_date=earnings_date,
            )
            return factor, await _run_factor(client, factor, data_slice)

        # asyncio.as_completed lets us stream done events in completion order.
        pending = {asyncio.create_task(run(f)): f for f in FACTORS}
        factor_results: dict[str, tuple[dict[str, Any], dict[str, Any]]] = {}
        for coro in asyncio.as_completed(pending.keys()):
            try:
                factor, (output, usage) = await coro
            except Exception as e:
                yield sse({"phase": "error", "message": f"factor call failed: {e}"})
                return
            factor_results[factor] = (output, usage)
            yield sse({
                "phase": "factor",
                "factor": factor,
                "status": "done",
                "output": output,
                "usage": usage,
            })

        factor_outputs = [factor_results[f][0] for f in FACTORS]
        factor_usages = [factor_results[f][1] for f in FACTORS]

        yield sse({"phase": "synthesis", "status": "start"})
        try:
            synthesis, synthesis_usage = await _run_synthesis(
                client, ticker, quote, factor_outputs
            )
        except Exception as e:
            yield sse({"phase": "error", "message": f"synthesis failed: {e}"})
            return
        if synthesis.get("ticker", "").upper() != ticker:
            synthesis["ticker"] = ticker
        yield sse({
            "phase": "synthesis",
            "status": "done",
            "output": synthesis,
            "usage": synthesis_usage,
        })

        totals = {
            "input_tokens": sum(u["input_tokens"] for u in factor_usages) + synthesis_usage["input_tokens"],
            "output_tokens": sum(u["output_tokens"] for u in factor_usages) + synthesis_usage["output_tokens"],
            "cache_read_tokens": sum(u["cache_read_tokens"] for u in factor_usages) + synthesis_usage["cache_read_tokens"],
            "cache_write_tokens": sum(u["cache_write_tokens"] for u in factor_usages) + synthesis_usage["cache_write_tokens"],
            "cost_usd": sum(u["cost_usd"] for u in factor_usages) + synthesis_usage["cost_usd"],
        }
        analysis_id = analyses_repo.save_analysis(
            ticker=ticker,
            entry_price=quote.price,
            synthesis=synthesis,
            factor_outputs=factor_outputs,
            factor_model=FACTOR_MODEL,
            synthesis_model=SYNTHESIS_MODEL,
            usage_totals=totals,
        )

        yield sse({
            "phase": "persist",
            "status": "done",
            "analysis_id": analysis_id,
            "totals": totals,
        })

    except CostCapExceeded as e:
        yield sse({"phase": "error", "message": str(e)})
    except Exception as e:
        log.exception("unexpected error in /api/analyze stream")
        yield sse({"phase": "error", "message": f"unexpected error: {e}"})


# ---------- backtest ----------------------------------------------------------


@app.post("/api/backtest/refresh")
def backtest_refresh() -> dict[str, Any]:
    return refresh_all()


@app.get("/api/backtest/aggregates")
def backtest_aggregates() -> dict[str, Any]:
    """Aggregates used by the Backtest dashboard."""
    with get_conn() as conn:
        kpis_row = conn.execute(
            """
            SELECT
              COUNT(*) AS total_analyses,
              COALESCE(SUM(total_cost_usd), 0.0) AS total_cost
            FROM analyses
            """
        ).fetchone()

        buys_row = conn.execute(
            """
            SELECT
              COUNT(*) AS n,
              AVG(ps.return_pct) AS avg_return,
              AVG(ps.alpha_pct) AS avg_alpha,
              CAST(SUM(CASE WHEN ps.return_pct > 0 THEN 1 ELSE 0 END) AS FLOAT) / NULLIF(COUNT(*), 0) * 100 AS hit_rate,
              CAST(SUM(CASE WHEN ps.alpha_pct > 0 THEN 1 ELSE 0 END) AS FLOAT) / NULLIF(COUNT(*), 0) * 100 AS hit_vs_spy
            FROM analyses a
            JOIN performance_snapshots ps ON ps.analysis_id = a.id
            WHERE a.overall_rating = 'BUY' AND ps.return_pct IS NOT NULL
            """
        ).fetchone()

        by_rating = conn.execute(
            """
            SELECT
              a.overall_rating AS rating,
              ps.interval AS interval,
              COUNT(*) AS n,
              AVG(ps.return_pct) AS avg_return_pct,
              AVG(ps.alpha_pct) AS avg_alpha_pct,
              CAST(SUM(CASE WHEN ps.return_pct > 0 THEN 1 ELSE 0 END) AS FLOAT) / COUNT(*) * 100 AS hit_pct,
              CAST(SUM(CASE WHEN ps.alpha_pct > 0 THEN 1 ELSE 0 END) AS FLOAT) / COUNT(*) * 100 AS hit_vs_spy_pct
            FROM analyses a
            JOIN performance_snapshots ps ON ps.analysis_id = a.id
            WHERE ps.return_pct IS NOT NULL
            GROUP BY a.overall_rating, ps.interval
            ORDER BY a.overall_rating, ps.interval
            """
        ).fetchall()

        by_factor = conn.execute(
            """
            SELECT
              fs.factor AS factor,
              CASE
                WHEN fs.score >= 7 THEN 'high'
                WHEN fs.score >= 4 THEN 'mid'
                ELSE 'low'
              END AS bucket,
              ps.interval AS interval,
              COUNT(*) AS n,
              AVG(ps.return_pct) AS avg_return_pct,
              AVG(ps.alpha_pct) AS avg_alpha_pct
            FROM factor_scores fs
            JOIN performance_snapshots ps ON ps.analysis_id = fs.analysis_id
            WHERE ps.return_pct IS NOT NULL
            GROUP BY fs.factor, bucket, ps.interval
            """
        ).fetchall()

        per_analysis = conn.execute(
            """
            SELECT
              a.id, a.ticker, a.overall_rating, a.overall_score, a.spike_potential,
              a.confidence, a.created_at, a.entry_price,
              MAX(CASE WHEN ps.interval = '1w' THEN ps.return_pct END) AS r_1w,
              MAX(CASE WHEN ps.interval = '1m' THEN ps.return_pct END) AS r_1m,
              MAX(CASE WHEN ps.interval = '3m' THEN ps.return_pct END) AS r_3m,
              MAX(CASE WHEN ps.interval = '6m' THEN ps.return_pct END) AS r_6m,
              MAX(CASE WHEN ps.interval = '1y' THEN ps.return_pct END) AS r_1y,
              MAX(CASE WHEN ps.interval = '1w' THEN ps.alpha_pct  END) AS a_1w,
              MAX(CASE WHEN ps.interval = '1m' THEN ps.alpha_pct  END) AS a_1m,
              MAX(CASE WHEN ps.interval = '3m' THEN ps.alpha_pct  END) AS a_3m,
              MAX(CASE WHEN ps.interval = '6m' THEN ps.alpha_pct  END) AS a_6m,
              MAX(CASE WHEN ps.interval = '1y' THEN ps.alpha_pct  END) AS a_1y
            FROM analyses a
            LEFT JOIN performance_snapshots ps ON ps.analysis_id = a.id
            GROUP BY a.id
            ORDER BY a.created_at DESC
            """
        ).fetchall()

    return {
        "totals": {
            "analyses": kpis_row["total_analyses"] or 0,
            "total_cost_usd": kpis_row["total_cost"] or 0.0,
            "buy_hit_rate": (buys_row["hit_rate"] if buys_row and buys_row["n"] else None),
            "buy_hit_vs_spy": (buys_row["hit_vs_spy"] if buys_row and buys_row["n"] else None),
            "buy_avg_alpha": (buys_row["avg_alpha"] if buys_row and buys_row["n"] else None),
            "buy_avg_return": (buys_row["avg_return"] if buys_row and buys_row["n"] else None),
            "buy_n": (buys_row["n"] if buys_row else 0),
        },
        "by_rating": [dict(r) for r in by_rating],
        "by_factor": [dict(r) for r in by_factor],
        "per_analysis": [dict(r) for r in per_analysis],
        "last_refresh_at": performance_repo.last_refresh_at(),
    }


# ---------- purchases ---------------------------------------------------------


class PurchaseInput(BaseModel):
    ticker: str
    buy_date: str  # YYYY-MM-DD
    buy_price: float = Field(gt=0)
    shares: float = Field(default=1.0, gt=0)
    analysis_id: int | None = None
    notes: str | None = None


def _enrich_purchases(records: list[purchases_repo.PurchaseRecord]) -> list[dict[str, Any]]:
    """Attach current price, SPY-return-since-buy, P&L, alpha to each row."""
    from datetime import date as _date

    if not records:
        return []

    provider = build_default_provider()
    unique_tickers = sorted({r.ticker for r in records} | {"SPY"})

    current: dict[str, float | None] = {}
    for t in unique_tickers:
        try:
            current[t] = provider.get_quote(t).price
        except Exception:
            current[t] = None

    spy_now = current.get("SPY")

    out: list[dict[str, Any]] = []
    for r in records:
        cur = current.get(r.ticker)
        try:
            buy_d = _date.fromisoformat(r.buy_date)
            spy_at_buy = prices_repo.nearest_trading_day_close("SPY", buy_d)
        except Exception:
            spy_at_buy = None

        return_pct = None if cur is None else (cur / r.buy_price - 1) * 100
        spy_return_pct = (
            None
            if (spy_now is None or spy_at_buy is None)
            else (spy_now / spy_at_buy - 1) * 100
        )
        alpha_pct = (
            None
            if (return_pct is None or spy_return_pct is None)
            else return_pct - spy_return_pct
        )
        pnl_usd = None if cur is None else (cur - r.buy_price) * r.shares

        out.append(
            {
                "id": r.id,
                "ticker": r.ticker,
                "buy_date": r.buy_date,
                "buy_price": r.buy_price,
                "shares": r.shares,
                "analysis_id": r.analysis_id,
                "notes": r.notes,
                "created_at": r.created_at,
                "current_price": cur,
                "return_pct": return_pct,
                "spy_return_pct": spy_return_pct,
                "alpha_pct": alpha_pct,
                "pnl_usd": pnl_usd,
                "cost_basis_usd": r.buy_price * r.shares,
            }
        )
    return out


@app.get("/api/purchases")
def list_purchases(ticker: str | None = None) -> dict[str, list[dict[str, Any]]]:
    records = (
        purchases_repo.list_by_ticker(ticker) if ticker else purchases_repo.list_all()
    )
    return {"purchases": _enrich_purchases(records)}


@app.post("/api/purchases")
def create_purchase(req: PurchaseInput) -> dict[str, Any]:
    from datetime import date as _date

    try:
        _date.fromisoformat(req.buy_date)
    except ValueError:
        raise HTTPException(status_code=400, detail="buy_date must be YYYY-MM-DD")

    if req.analysis_id is not None and analyses_repo.get_by_id(req.analysis_id) is None:
        raise HTTPException(status_code=400, detail="analysis_id does not exist")

    purchase_id = purchases_repo.add(
        ticker=req.ticker,
        buy_date=req.buy_date,
        buy_price=req.buy_price,
        shares=req.shares,
        analysis_id=req.analysis_id,
        notes=req.notes,
    )
    return {"id": purchase_id}


@app.delete("/api/purchases/{purchase_id}")
def delete_purchase(purchase_id: int) -> dict[str, bool]:
    purchases_repo.delete(purchase_id)
    return {"ok": True}


@app.get("/api/cost/today")
def cost_today() -> dict[str, Any]:
    spent = analyses_repo.todays_cost_usd()
    return {
        "spent_usd": spent,
        "cap_usd": DAILY_COST_CAP_USD,
        "remaining_usd": max(0.0, DAILY_COST_CAP_USD - spent),
        "pct_used": (spent / DAILY_COST_CAP_USD * 100) if DAILY_COST_CAP_USD else 0,
    }

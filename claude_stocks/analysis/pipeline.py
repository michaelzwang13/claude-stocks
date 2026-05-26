"""Orchestrator for the 5-factor analysis chain + synthesis.

Anthropic structured output is implemented via a forced tool call:
- Each factor call has a single tool `submit_factor_analysis` with a JSON schema.
- `tool_choice={"type": "tool", "name": "..."}` forces the model to call it.
- The tool's `input` field is the structured output we want.

The framework system prompt is the cached prefix. Per-ticker data goes in the
user message (uncached, that's the variable input).
"""
from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import asdict
from datetime import date, datetime, timedelta
from typing import Any

import anthropic

from claude_stocks.analysis.prompts import FACTOR_PROMPTS, SYNTHESIS_PROMPT
from claude_stocks.analysis.schemas import (
    FACTOR_OUTPUT_SCHEMA,
    SYNTHESIS_OUTPUT_SCHEMA,
    FACTORS,
)
from claude_stocks.config import (
    ANTHROPIC_API_KEY,
    CACHE_TTL,
    DAILY_COST_CAP_USD,
    FACTOR_MODEL,
    PRICING,
    SYNTHESIS_MODEL,
)
from claude_stocks.data.base import (
    Fundamentals,
    NewsItem,
    Quote,
    dataclass_to_jsonable,
)
from claude_stocks.data.composite import CompositeProvider
from claude_stocks.db import analyses_repo

log = logging.getLogger(__name__)


class CostCapExceeded(RuntimeError):
    pass


class AnalysisError(RuntimeError):
    pass


# ----- Cost math ---------------------------------------------------------------


def _usage_cost(model: str, usage) -> float:
    p = PRICING[model]
    return (
        usage.input_tokens * p["input"]
        + getattr(usage, "cache_creation_input_tokens", 0) * p["cache_write_1h"]
        + getattr(usage, "cache_read_input_tokens", 0) * p["cache_read"]
        + usage.output_tokens * p["output"]
    ) / 1_000_000


def _usage_dict(model: str, usage) -> dict[str, Any]:
    return {
        "model": model,
        "input_tokens": usage.input_tokens,
        "output_tokens": usage.output_tokens,
        "cache_read_tokens": getattr(usage, "cache_read_input_tokens", 0),
        "cache_write_tokens": getattr(usage, "cache_creation_input_tokens", 0),
        "cost_usd": _usage_cost(model, usage),
    }


# ----- Data assembly per factor ------------------------------------------------


def _competitor_summaries(
    provider: CompositeProvider, peers: list[str]
) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for p in peers:
        try:
            f = provider.get_fundamentals(p)
            q = provider.get_quote(p)
            out.append(
                {
                    "ticker": p,
                    "company_name": q.company_name,
                    "market_cap": q.market_cap,
                    "pe_ratio": f.pe_ratio,
                    "price_to_sales": f.price_to_sales,
                    "operating_margin": f.operating_margin,
                    "return_on_equity": f.return_on_equity,
                    "revenue_growth_yoy": f.revenue_growth_yoy,
                }
            )
        except Exception as e:
            log.warning("competitor fetch failed for %s: %s", p, e)
    return out


def _data_for_factor(
    factor: str,
    *,
    quote: Quote,
    fundamentals: Fundamentals,
    news: list[NewsItem],
    competitor_summaries: list[dict[str, Any]],
    earnings_date: date | None,
) -> dict[str, Any]:
    q = dataclass_to_jsonable(quote)
    f = dataclass_to_jsonable(fundamentals)
    n = dataclass_to_jsonable(news)

    if factor == "valuation":
        return {
            "ticker": quote.ticker,
            "current_quote": q,
            "fundamentals": {
                k: f[k]
                for k in (
                    "pe_ratio",
                    "forward_pe",
                    "peg_ratio",
                    "price_to_sales",
                    "price_to_book",
                    "ev_to_ebitda",
                    "free_cash_flow",
                    "dividend_yield",
                    "sector",
                    "industry",
                )
            },
            "competitor_valuations": [
                {
                    "ticker": c["ticker"],
                    "market_cap": c["market_cap"],
                    "pe_ratio": c["pe_ratio"],
                    "price_to_sales": c["price_to_sales"],
                }
                for c in competitor_summaries
            ],
        }
    if factor == "growth":
        return {
            "ticker": quote.ticker,
            "fundamentals": {
                k: f[k]
                for k in (
                    "revenue_growth_yoy",
                    "earnings_growth_yoy",
                    "revenue_ttm",
                    "earnings_ttm",
                    "free_cash_flow",
                    "sector",
                    "industry",
                )
            },
            "historical_revenue": f["historical_revenue"],
            "historical_earnings": f["historical_earnings"],
            "competitor_growth": [
                {"ticker": c["ticker"], "revenue_growth_yoy": c["revenue_growth_yoy"]}
                for c in competitor_summaries
            ],
        }
    if factor == "moat":
        return {
            "ticker": quote.ticker,
            "company_name": quote.company_name,
            "description": f["description"],
            "sector": f["sector"],
            "industry": f["industry"],
            "employees": f["employees"],
            "operating_margin": f["operating_margin"],
            "profit_margin": f["profit_margin"],
            "return_on_equity": f["return_on_equity"],
            "debt_to_equity": f["debt_to_equity"],
            "competitors": competitor_summaries,
        }
    if factor == "sentiment":
        return {
            "ticker": quote.ticker,
            "current_price": q["price"],
            "day_change_pct": q["day_change_pct"],
            "recent_news": [
                {
                    "headline": i["headline"],
                    "summary": i["summary"],
                    "source": i["source"],
                    "published_at": i["published_at"],
                    "sentiment_score": i["sentiment_score"],
                }
                for i in n
            ],
        }
    if factor == "catalysts":
        return {
            "ticker": quote.ticker,
            "next_earnings_date": earnings_date.isoformat() if earnings_date else None,
            "recent_news": [
                {
                    "headline": i["headline"],
                    "summary": i["summary"],
                    "published_at": i["published_at"],
                }
                for i in n
            ],
            "today": date.today().isoformat(),
        }
    raise ValueError(f"unknown factor: {factor}")


# ----- Claude calls -------------------------------------------------------------


def _system_for_factor(factor: str) -> list[dict[str, Any]]:
    return [
        {
            "type": "text",
            "text": FACTOR_PROMPTS[factor],
            "cache_control": {"type": "ephemeral", "ttl": CACHE_TTL},
        }
    ]


def _system_for_synthesis() -> list[dict[str, Any]]:
    return [
        {
            "type": "text",
            "text": SYNTHESIS_PROMPT,
            "cache_control": {"type": "ephemeral", "ttl": CACHE_TTL},
        }
    ]


def _factor_tool() -> dict[str, Any]:
    return {
        "name": "submit_factor_analysis",
        "description": "Submit your structured factor analysis. Always call this once.",
        "input_schema": FACTOR_OUTPUT_SCHEMA,
    }


def _synthesis_tool() -> dict[str, Any]:
    return {
        "name": "submit_synthesis",
        "description": "Submit your final structured rating. Always call this once.",
        "input_schema": SYNTHESIS_OUTPUT_SCHEMA,
    }


def _extract_tool_input(response, expected_tool: str) -> dict[str, Any]:
    for block in response.content:
        if getattr(block, "type", None) == "tool_use" and block.name == expected_tool:
            return block.input
    raise AnalysisError(f"model did not call {expected_tool}; got {response.content!r}")


async def _run_factor(
    client: anthropic.AsyncAnthropic,
    factor: str,
    data_slice: dict[str, Any],
) -> tuple[dict[str, Any], dict[str, Any]]:
    payload = json.dumps(data_slice, sort_keys=True, default=str)
    resp = await client.messages.create(
        model=FACTOR_MODEL,
        max_tokens=2048,
        system=_system_for_factor(factor),
        tools=[_factor_tool()],
        tool_choice={"type": "tool", "name": "submit_factor_analysis"},
        messages=[{"role": "user", "content": payload}],
    )
    output = _extract_tool_input(resp, "submit_factor_analysis")
    output.setdefault("factor", factor)
    return output, _usage_dict(FACTOR_MODEL, resp.usage)


async def _run_synthesis(
    client: anthropic.AsyncAnthropic,
    ticker: str,
    quote: Quote,
    factor_outputs: list[dict[str, Any]],
) -> tuple[dict[str, Any], dict[str, Any]]:
    user_payload = {
        "ticker": ticker,
        "current_quote": dataclass_to_jsonable(quote),
        "factor_outputs": factor_outputs,
    }
    payload = json.dumps(user_payload, sort_keys=True, default=str)
    resp = await client.messages.create(
        model=SYNTHESIS_MODEL,
        max_tokens=2048,
        system=_system_for_synthesis(),
        tools=[_synthesis_tool()],
        tool_choice={"type": "tool", "name": "submit_synthesis"},
        messages=[{"role": "user", "content": payload}],
    )
    output = _extract_tool_input(resp, "submit_synthesis")
    return output, _usage_dict(SYNTHESIS_MODEL, resp.usage)


# ----- Public entry point ------------------------------------------------------


def analyze_sync(ticker: str, provider: CompositeProvider) -> dict[str, Any]:
    """Synchronous entrypoint wrapping the async pipeline (Streamlit-friendly)."""
    return asyncio.run(analyze(ticker, provider))


async def analyze(ticker: str, provider: CompositeProvider) -> dict[str, Any]:
    if not ANTHROPIC_API_KEY:
        raise AnalysisError("ANTHROPIC_API_KEY not set")

    today_cost = analyses_repo.todays_cost_usd()
    if today_cost >= DAILY_COST_CAP_USD:
        raise CostCapExceeded(
            f"Daily cost cap reached: spent ${today_cost:.2f} of ${DAILY_COST_CAP_USD:.2f}. "
            "Increase DAILY_COST_CAP_USD in .env to continue."
        )

    ticker = ticker.upper().strip()

    quote = provider.get_quote(ticker)
    fundamentals = provider.get_fundamentals(ticker)
    news = provider.get_news(ticker, days=14, limit=20)
    peers = provider.get_competitors(ticker, limit=5)
    competitor_summaries = _competitor_summaries(provider, peers)
    earnings_date = provider.get_earnings_calendar(ticker)

    client = anthropic.AsyncAnthropic(api_key=ANTHROPIC_API_KEY)

    factor_results: list[tuple[dict[str, Any], dict[str, Any]]] = await asyncio.gather(
        *[
            _run_factor(
                client,
                f,
                _data_for_factor(
                    f,
                    quote=quote,
                    fundamentals=fundamentals,
                    news=news,
                    competitor_summaries=competitor_summaries,
                    earnings_date=earnings_date,
                ),
            )
            for f in FACTORS
        ]
    )
    factor_outputs = [r[0] for r in factor_results]
    factor_usages = [r[1] for r in factor_results]

    synthesis, synthesis_usage = await _run_synthesis(client, ticker, quote, factor_outputs)
    if synthesis.get("ticker", "").upper() != ticker:
        synthesis["ticker"] = ticker  # don't trust the model with our identity

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

    return {
        "analysis_id": analysis_id,
        "ticker": ticker,
        "entry_price": quote.price,
        "quote": dataclass_to_jsonable(quote),
        "fundamentals": dataclass_to_jsonable(fundamentals),
        "news": dataclass_to_jsonable(news),
        "competitors": competitor_summaries,
        "earnings_date": earnings_date.isoformat() if earnings_date else None,
        "factor_outputs": factor_outputs,
        "synthesis": synthesis,
        "usage": totals,
        "factor_usages": factor_usages,
        "synthesis_usage": synthesis_usage,
    }

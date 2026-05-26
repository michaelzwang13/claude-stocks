"""Daily refresh job: extend price_history + compute performance_snapshots."""
from __future__ import annotations

import logging
from dataclasses import asdict
from datetime import date, datetime, timedelta, timezone

from claude_stocks.backtest.intervals import INTERVALS
from claude_stocks.data.composite import CompositeProvider, build_default_provider
from claude_stocks.db import analyses_repo, performance_repo, prices_repo

log = logging.getLogger(__name__)

BENCHMARK = "SPY"
PRICE_LOOKBACK_DAYS = 3 * 365 + 30  # bootstrap with ~3y of history


def _ensure_prices(provider: CompositeProvider, ticker: str) -> None:
    last = prices_repo.get_last_cached_date(ticker)
    today = date.today()
    if last is None:
        start = today - timedelta(days=PRICE_LOOKBACK_DAYS)
    elif last >= today:
        return
    else:
        start = last + timedelta(days=1)
    try:
        rows = provider.get_historical_prices(ticker, start, today)
    except Exception as e:
        log.warning("price fetch failed for %s: %s", ticker, e)
        return
    if not rows:
        return
    prices_repo.upsert_prices(
        ticker,
        (
            {
                "date": p.date,
                "open": p.open,
                "high": p.high,
                "low": p.low,
                "close": p.close,
                "adj_close": p.adj_close,
                "volume": p.volume,
            }
            for p in rows
        ),
    )


def _compute_one(analysis, interval: str, days: int) -> None:
    target = datetime.fromisoformat(analysis.created_at).date() + timedelta(days=days)
    if target > date.today():
        return

    if performance_repo.snapshot_exists(analysis.id, interval):
        return

    entry_date = datetime.fromisoformat(analysis.created_at).date()
    spy_at_entry = prices_repo.nearest_trading_day_close(BENCHMARK, entry_date)
    if spy_at_entry is None:
        log.warning(
            "no SPY price at entry %s for analysis %s; skipping", entry_date, analysis.id
        )
        return

    ticker_close = prices_repo.nearest_trading_day_close(analysis.ticker, target)
    spy_close = prices_repo.nearest_trading_day_close(BENCHMARK, target)

    if ticker_close is None or spy_close is None:
        return

    return_pct = (ticker_close / analysis.entry_price - 1) * 100
    spy_return_pct = (spy_close / spy_at_entry - 1) * 100
    alpha_pct = return_pct - spy_return_pct

    performance_repo.insert_snapshot(
        analysis_id=analysis.id,
        interval=interval,
        price_at_interval=ticker_close,
        return_pct=return_pct,
        spy_price_at_analysis=spy_at_entry,
        spy_price_at_interval=spy_close,
        spy_return_pct=spy_return_pct,
        alpha_pct=alpha_pct,
    )


def refresh_all(provider: CompositeProvider | None = None) -> dict[str, int]:
    """Pull fresh prices and compute any newly-elapsed performance snapshots.

    Returns counts for telemetry.
    """
    provider = provider or build_default_provider()

    analyses = analyses_repo.list_recent(limit=10_000)
    tickers = {BENCHMARK} | {a.ticker for a in analyses}

    for t in sorted(tickers):
        _ensure_prices(provider, t)

    written = 0
    for a in analyses:
        for interval, days in INTERVALS.items():
            before = performance_repo.snapshot_exists(a.id, interval)
            _compute_one(a, interval, days)
            after = performance_repo.snapshot_exists(a.id, interval)
            if after and not before:
                written += 1

    return {"analyses": len(analyses), "tickers": len(tickers), "snapshots_written": written}


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    print(refresh_all())

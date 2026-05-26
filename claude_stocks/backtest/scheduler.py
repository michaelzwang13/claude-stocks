"""APScheduler init.

The scheduler is a module-global singleton; on startup we also trigger a
catch-up refresh if the last one was > 24h ago (covers app-was-closed cases).
Callers must invoke `shutdown_scheduler()` on app exit — otherwise its
background thread leaks across uvicorn reloads.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from apscheduler.schedulers.background import BackgroundScheduler

from claude_stocks.backtest.refresh import refresh_all
from claude_stocks.db import performance_repo

log = logging.getLogger(__name__)

_scheduler: BackgroundScheduler | None = None


def _safe_refresh() -> None:
    try:
        result = refresh_all()
        log.info("scheduled refresh: %s", result)
    except Exception as e:
        log.exception("scheduled refresh failed: %s", e)


def init_scheduler() -> BackgroundScheduler:
    """Initialise (or return existing) BackgroundScheduler. Idempotent."""
    global _scheduler
    if _scheduler is None or not _scheduler.running:
        _scheduler = BackgroundScheduler(daemon=True)
        _scheduler.add_job(
            _safe_refresh, "cron", hour=18, minute=0, id="daily_refresh", replace_existing=True
        )
        _scheduler.start()
    return _scheduler


def shutdown_scheduler() -> None:
    """Stop the scheduler if running. Safe to call multiple times."""
    global _scheduler
    if _scheduler is not None and _scheduler.running:
        _scheduler.shutdown(wait=False)
    _scheduler = None


def maybe_catchup() -> bool:
    """If last refresh > 24h ago, trigger one. Returns True if fired.

    Skipped entirely when there are no analyses yet — otherwise every reload
    would refetch ~3y of SPY history.
    """
    from claude_stocks.db import analyses_repo

    if not analyses_repo.list_recent(limit=1):
        return False

    last = performance_repo.last_refresh_at()
    if last is None:
        _safe_refresh()
        return True
    try:
        last_dt = datetime.fromisoformat(last)
    except ValueError:
        return False
    if last_dt.tzinfo is None:
        last_dt = last_dt.replace(tzinfo=timezone.utc)
    age_hours = (datetime.now(timezone.utc) - last_dt).total_seconds() / 3600
    if age_hours > 24:
        _safe_refresh()
        return True
    return False

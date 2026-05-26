"""Backtest interval definitions."""
from __future__ import annotations

INTERVALS: dict[str, int] = {
    "1w": 7,
    "1m": 30,
    "3m": 90,
    "6m": 182,
    "1y": 365,
}

ORDER = list(INTERVALS.keys())

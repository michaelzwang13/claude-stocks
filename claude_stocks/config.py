"""Centralized config: env loading, model IDs, paths, cost caps."""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_ROOT / "data"
DB_PATH = DATA_DIR / "claude_stocks.db"

DATA_DIR.mkdir(exist_ok=True)

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")
FINNHUB_API_KEY = os.getenv("FINNHUB_API_KEY") or None
ALPHAVANTAGE_API_KEY = os.getenv("ALPHAVANTAGE_API_KEY") or None

FACTOR_MODEL = "claude-sonnet-4-6"
SYNTHESIS_MODEL = "claude-opus-4-7"

DAILY_COST_CAP_USD = float(os.getenv("DAILY_COST_CAP_USD", "5.00"))

# Per-MTok prices (input / cache_write / cache_read / output) — Anthropic published rates.
# Used only for the daily cost-cap calculation; not user-facing pricing.
PRICING = {
    "claude-sonnet-4-6": {
        "input": 3.00,
        "cache_write_1h": 6.00,
        "cache_read": 0.30,
        "output": 15.00,
    },
    "claude-opus-4-7": {
        "input": 15.00,
        "cache_write_1h": 30.00,
        "cache_read": 1.50,
        "output": 75.00,
    },
}

CACHE_TTL = "1h"

PROVIDER_CACHE_TTL_SECONDS = {
    "quote": 15 * 60,
    "fundamentals": 6 * 60 * 60,
    "news": 30 * 60,
    "competitors": 24 * 60 * 60,
    "earnings_calendar": 6 * 60 * 60,
}

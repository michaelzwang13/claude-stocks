# Claude-Stocks

Personal stock analysis tool: enter a ticker, get a structured BUY/HOLD/SELL rating with per-factor scores (valuation, growth, moat, sentiment, catalysts), backed by fresh financial data and Claude reasoning. Past analyses persist locally; a forward-tracking backtest measures actual returns vs. SPY at 1w/1m/3m/6m/1y.

**Personal research tool. Not financial advice. Past performance does not predict future results.**

## Setup

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env
# Fill in ANTHROPIC_API_KEY (required), FINNHUB_API_KEY + ALPHAVANTAGE_API_KEY (optional)
```

## Run

Backend (FastAPI, port 8000):

```bash
uvicorn claude_stocks.api.main:app --reload --port 8000
```

Frontend (Next.js, port 3000):

```bash
cd frontend
npm install
npm run dev
```

## Test

```bash
pytest
```

## Architecture

- `claude_stocks/data/` — `DataProvider` ABC and yfinance/Finnhub/Alpha Vantage implementations behind a `CompositeProvider` with primary/fallback routing.
- `claude_stocks/analysis/` — frozen system prompts, Pydantic output schemas, and the async pipeline that runs 5 factor calls in parallel (Sonnet 4.6) before a synthesis call (Opus 4.7).
- `claude_stocks/db/` — SQLite schema, repos, idempotent migration.
- `claude_stocks/backtest/` — daily refresh that computes ticker return + SPY alpha at each interval as time elapses.
- `claude_stocks/api/` — FastAPI app exposing analysis, backtest, and cost endpoints; `/api/analyze` streams progress via SSE.
- `frontend/` — Next.js + TypeScript + Tailwind UI that talks to the FastAPI backend.

Framework system prompts are cached with `cache_control: {"type": "ephemeral", "ttl": "1h"}`. Per-ticker data goes in the user message only (changing it would invalidate cache).

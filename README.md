# Claude-Stocks

Personal stock analysis tool: enter a ticker, get a structured BUY/HOLD/SELL rating with per-factor scores (valuation, growth, moat, sentiment, catalysts), backed by fresh financial data and Claude reasoning. Past analyses persist locally; a forward-tracking backtest measures actual returns vs. SPY at 1w/1m/3m/6m/1y.

**Personal research tool. Not financial advice. Past performance does not predict future results.**

## First-time setup

You'll need Python 3.11+ and Node.js 20+ installed.

1. Open Terminal and `cd` into this folder.
2. Create a Python environment and install dependencies:

   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   pip install -e ".[dev]"
   ```

3. Create your `.env` file from the template:

   ```bash
   cp .env.example .env
   ```

   Open `.env` in any text editor and paste in your `ANTHROPIC_API_KEY`
   (required — get one at https://console.anthropic.com).
   `FINNHUB_API_KEY` and `ALPHAVANTAGE_API_KEY` are optional and improve
   news/competitor data quality if set.

## Running the app

From this folder, run:

```bash
./dev.sh
```

That single command starts both the backend (port 8000) and the frontend
(port 3000), and installs frontend dependencies on first run. Once you
see startup logs from both, open **http://localhost:3000** in your
browser.

Press **Ctrl+C** in the terminal to stop everything cleanly.

### If `./dev.sh` won't run

- **"permission denied"** — run `chmod +x dev.sh` once, then try again.
- **".env not found"** or **".venv not found"** — finish the
  *First-time setup* steps above.

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

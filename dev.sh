#!/usr/bin/env bash
# Start the Claude-Stocks dev stack: FastAPI (:8000) + Next.js (:3000).
# Ctrl+C stops both.
set -euo pipefail

# On Apple Silicon, force arm64. The venv Python is universal2 and inherits
# arch from the parent shell — if that shell is under Rosetta (x86_64), the
# arm64-only pydantic_core wheel fails to load.
if [[ "$(uname -m)" == "arm64" && "$(arch)" != "arm64" ]]; then
  exec arch -arm64 /bin/bash "$0" "$@"
fi

cd "$(dirname "$0")"

if [[ ! -f .env ]]; then
  echo "error: .env not found. Run: cp .env.example .env  and fill in ANTHROPIC_API_KEY" >&2
  exit 1
fi

if [[ ! -d .venv ]]; then
  echo "error: .venv not found. Run: python3 -m venv .venv && source .venv/bin/activate && pip install -e '.[dev]'" >&2
  exit 1
fi

# shellcheck disable=SC1091
source .venv/bin/activate

if [[ ! -d frontend/node_modules ]]; then
  echo "Installing frontend deps (first run)..."
  (cd frontend && npm install)
fi

cleanup() {
  echo
  echo "Shutting down..."
  [[ -n "${BACKEND_PID:-}" ]] && kill "$BACKEND_PID" 2>/dev/null || true
  [[ -n "${FRONTEND_PID:-}" ]] && kill "$FRONTEND_PID" 2>/dev/null || true
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "Starting backend on http://localhost:8000 ..."
# --reload-dir limits the file watcher to backend source only.
# Watching the whole repo includes frontend/node_modules (~540MB), .venv (~200MB),
# and data/ (SQLite + WAL) — the latter triggers reload on every DB write.
uvicorn claude_stocks.api.main:app \
  --reload \
  --reload-dir claude_stocks \
  --port 8000 &
BACKEND_PID=$!

echo "Starting frontend on http://localhost:3000 ..."
(cd frontend && npm run dev) &
FRONTEND_PID=$!

wait -n "$BACKEND_PID" "$FRONTEND_PID"

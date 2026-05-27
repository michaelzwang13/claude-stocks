#!/usr/bin/env bash
# PostToolUse hook for Write|Edit|MultiEdit.
# Reads tool JSON on stdin; runs pytest if backend files changed and tsc if
# frontend files changed. Always exits 0 — surfaces a one-line summary, never
# blocks the edit on failure.
set -uo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"

input=$(cat)
file_path=$(printf '%s' "$input" | jq -r '.tool_input.file_path // .tool_response.filePath // empty')
[[ -z "$file_path" ]] && exit 0

# Resolve to a path relative to REPO so the same matchers work regardless of CWD.
rel="${file_path#"$REPO"/}"

run_pytest=0
run_tsc=0
case "$rel" in
  claude_stocks/*|tests/*) run_pytest=1 ;;
  frontend/*)              run_tsc=1 ;;
esac
[[ $run_pytest -eq 0 && $run_tsc -eq 0 ]] && exit 0

cd "$REPO"

# Detect Apple Silicon + universal2 venv → force arm64 to dodge Rosetta arch issues.
PY_PREFIX=""
if [[ "$(uname)" == "Darwin" && "$(uname -m)" == "arm64" ]]; then
  PY_PREFIX="arch -arm64"
fi

results=()

if [[ $run_pytest -eq 1 ]]; then
  if [[ -x .venv/bin/python ]]; then
    if out=$($PY_PREFIX ./.venv/bin/python -m pytest -q --no-header --tb=line 2>&1); then
      summary=$(printf '%s' "$out" | tail -1 | tr -d '=')
      results+=("✓ pytest: $summary")
    else
      summary=$(printf '%s' "$out" | tail -1 | tr -d '=')
      results+=("✗ pytest: $summary")
    fi
  else
    results+=("· pytest: skipped (.venv/bin/python missing)")
  fi
fi

if [[ $run_tsc -eq 1 ]]; then
  if out=$(cd frontend && npx --no-install tsc --noEmit 2>&1); then
    results+=("✓ tsc: clean")
  else
    n=$(printf '%s' "$out" | grep -c "error TS" || true)
    results+=("✗ tsc: $n type error(s)")
  fi
fi

for line in "${results[@]}"; do
  echo "$line"
done
exit 0

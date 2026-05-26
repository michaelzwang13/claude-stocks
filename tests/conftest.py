"""Test fixtures — redirects the SQLite DB into a temp file per test session."""
from __future__ import annotations

import os
import tempfile

import pytest

_tmpdir = tempfile.mkdtemp(prefix="claude_stocks_test_")
os.environ["CLAUDE_STOCKS_TEST_DB_DIR"] = _tmpdir


@pytest.fixture(autouse=True)
def _isolated_db(monkeypatch, tmp_path):
    """Each test gets a fresh DB path."""
    import importlib

    from claude_stocks import config

    db_path = tmp_path / "test.db"
    monkeypatch.setattr(config, "DB_PATH", db_path)

    # Re-apply schema to the new path.
    from claude_stocks.db import migrations

    migrations.apply_schema()
    yield

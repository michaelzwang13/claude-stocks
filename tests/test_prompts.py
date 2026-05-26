"""Prompt-caching invariants — the framework prompt must be byte-identical run-to-run."""
from __future__ import annotations

from claude_stocks.analysis.prompts import FACTOR_PROMPTS, FRAMEWORK_PROMPT, SYNTHESIS_PROMPT


def test_factor_prompts_have_all_five():
    assert set(FACTOR_PROMPTS) == {"valuation", "growth", "moat", "sentiment", "catalysts"}


def test_factor_prompts_share_framework_prefix():
    """The shared framework is the cache prefix — every factor prompt must start with it."""
    for name, text in FACTOR_PROMPTS.items():
        assert text.startswith(FRAMEWORK_PROMPT), f"{name} prompt does not start with FRAMEWORK_PROMPT"


def test_no_dynamic_interpolation_smell():
    """Sanity: nothing that looks like an f-string remained."""
    for name, text in FACTOR_PROMPTS.items():
        assert "{" not in text or "}" not in text or "json schema" in text.lower(), \
            f"{name} prompt contains suspicious braces"
    assert "{" not in SYNTHESIS_PROMPT or "}" not in SYNTHESIS_PROMPT

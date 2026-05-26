"""Validate Pydantic schemas + their JSON-schema export.

These exist to catch the failure mode where Anthropic's structured-output API
rejects our schema (e.g. recursive types, missing additionalProperties).
"""
from __future__ import annotations

import json

import pytest

from claude_stocks.analysis.schemas import (
    FACTOR_OUTPUT_SCHEMA,
    SYNTHESIS_OUTPUT_SCHEMA,
    FactorOutput,
    SynthesisOutput,
)


def test_factor_output_validates():
    f = FactorOutput(
        factor="valuation",
        score=7.5,
        rating="bullish",
        key_points=["P/E 18 vs sector 24", "FCF yield 5.1%"],
        reasoning="Cheap on every multiple relative to sector and own history. FCF yield supports the discount.",
        confidence="high",
        data_gaps=[],
    )
    assert f.factor == "valuation"


def test_factor_score_out_of_range_rejected():
    with pytest.raises(Exception):
        FactorOutput(
            factor="valuation",
            score=11,
            rating="bullish",
            key_points=["a", "b"],
            reasoning="...",
            confidence="high",
            data_gaps=[],
        )


def test_factor_schema_has_no_refs():
    s = json.dumps(FACTOR_OUTPUT_SCHEMA)
    assert "$ref" not in s
    assert "$defs" not in s


def test_factor_schema_objects_close_additional_props():
    def _walk(node):
        if isinstance(node, dict):
            if node.get("type") == "object":
                assert node.get("additionalProperties") is False, node
            for v in node.values():
                _walk(v)
        elif isinstance(node, list):
            for x in node:
                _walk(x)

    _walk(FACTOR_OUTPUT_SCHEMA)
    _walk(SYNTHESIS_OUTPUT_SCHEMA)


def test_synthesis_output_validates():
    s = SynthesisOutput(
        ticker="AAPL",
        overall_rating="BUY",
        overall_score=7.6,
        factor_scores={"valuation": 7.0, "growth": 8.0, "moat": 9.0, "sentiment": 6.5, "catalysts": 7.0},
        thesis="Solid blend across the board with momentum from services growth.",
        risks=["China exposure", "iPhone refresh cycle"],
        catalysts_to_watch=["WWDC June 2026", "Q3 earnings August 2026"],
        spike_potential="moderate",
        spike_rationale="Earnings + WWDC sit close together; either could drive a 5%+ move.",
        confidence="high",
    )
    assert s.overall_rating == "BUY"

"""Pydantic schemas for structured Claude outputs.

These define both the runtime validators AND the JSON schemas passed to the
Anthropic API as `output_config.format`. Keep them simple — recursive types and
some string/array constraints aren't supported by structured output.
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


FACTORS = ("valuation", "growth", "moat", "sentiment", "catalysts")
FactorName = Literal["valuation", "growth", "moat", "sentiment", "catalysts"]


class FactorOutput(BaseModel):
    factor: FactorName
    score: float = Field(ge=0, le=10)
    rating: Literal["bullish", "neutral", "bearish"]
    key_points: list[str] = Field(min_length=2, max_length=5)
    reasoning: str
    confidence: Literal["low", "medium", "high"]
    data_gaps: list[str]


class FactorScores(BaseModel):
    """Mirror of the five factor scores — explicit fields keep the JSON schema
    strict (no open dicts) which Anthropic structured output requires."""

    valuation: float = Field(ge=0, le=10)
    growth: float = Field(ge=0, le=10)
    moat: float = Field(ge=0, le=10)
    sentiment: float = Field(ge=0, le=10)
    catalysts: float = Field(ge=0, le=10)


class SynthesisOutput(BaseModel):
    ticker: str
    overall_rating: Literal["BUY", "HOLD", "SELL"]
    overall_score: float = Field(ge=0, le=10)
    factor_scores: FactorScores
    thesis: str
    risks: list[str] = Field(min_length=2, max_length=5)
    catalysts_to_watch: list[str]
    spike_potential: Literal["low", "moderate", "high"]
    spike_rationale: str
    confidence: Literal["low", "medium", "high"]


def _strip_unsupported(schema: dict) -> dict:
    """Anthropic structured output is strict about additionalProperties + a few
    keywords. Walk the schema and:
      - set additionalProperties=false on objects
      - drop a few keywords that Pydantic emits but the API rejects.
    """
    KILL = {"$defs", "definitions", "$ref"}  # we inline below

    def walk(node):
        if isinstance(node, dict):
            for k in list(node.keys()):
                if k in KILL:
                    node.pop(k, None)
            if node.get("type") == "object":
                node.setdefault("additionalProperties", False)
            for v in node.values():
                walk(v)
        elif isinstance(node, list):
            for x in node:
                walk(x)

    # Resolve $defs/$refs by inlining the referenced definitions.
    defs = schema.pop("$defs", {}) or schema.pop("definitions", {})

    def inline(node):
        if isinstance(node, dict):
            ref = node.get("$ref")
            if ref and ref.startswith("#/$defs/"):
                name = ref.split("/")[-1]
                target = defs.get(name)
                if target is not None:
                    node.clear()
                    node.update(inline(dict(target)))
            else:
                for k, v in list(node.items()):
                    node[k] = inline(v)
            return node
        if isinstance(node, list):
            return [inline(x) for x in node]
        return node

    schema = inline(schema)
    walk(schema)
    return schema


FACTOR_OUTPUT_SCHEMA = _strip_unsupported(FactorOutput.model_json_schema())
SYNTHESIS_OUTPUT_SCHEMA = _strip_unsupported(SynthesisOutput.model_json_schema())

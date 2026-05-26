"""Provider contract conformance.

Doesn't hit the network — instantiates providers and checks the interface shape.
Real network conformance is best validated by running the smoke test against AAPL.
"""
from __future__ import annotations

from claude_stocks.data.base import DataProvider, Fundamentals, NewsItem, PricePoint, Quote
from claude_stocks.data.yfinance_provider import YFinanceProvider


def test_yfinance_implements_interface():
    p = YFinanceProvider()
    assert isinstance(p, DataProvider)
    for method in (
        "get_quote",
        "get_fundamentals",
        "get_news",
        "get_competitors",
        "get_historical_prices",
        "get_earnings_calendar",
    ):
        assert callable(getattr(p, method))


def test_dataclasses_are_frozen():
    import dataclasses

    for cls in (Quote, Fundamentals, NewsItem, PricePoint):
        assert dataclasses.is_dataclass(cls)
        assert cls.__dataclass_params__.frozen, f"{cls.__name__} should be frozen"

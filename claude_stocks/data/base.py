"""DataProvider abstract base class + value-type dataclasses.

The contract here is what lets us swap free providers (yfinance/Finnhub) for paid
ones (Polygon/FMP) without touching analysis code.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import asdict, dataclass, field
from datetime import date, datetime
from typing import Any


@dataclass(frozen=True)
class Quote:
    ticker: str
    price: float
    timestamp: datetime
    day_change_pct: float | None
    volume: int | None
    market_cap: float | None
    company_name: str | None = None


@dataclass(frozen=True)
class Fundamentals:
    ticker: str
    as_of: date
    pe_ratio: float | None = None
    forward_pe: float | None = None
    peg_ratio: float | None = None
    price_to_sales: float | None = None
    price_to_book: float | None = None
    ev_to_ebitda: float | None = None
    profit_margin: float | None = None
    operating_margin: float | None = None
    revenue_growth_yoy: float | None = None
    earnings_growth_yoy: float | None = None
    return_on_equity: float | None = None
    debt_to_equity: float | None = None
    free_cash_flow: float | None = None
    dividend_yield: float | None = None
    sector: str | None = None
    industry: str | None = None
    description: str | None = None
    employees: int | None = None
    revenue_ttm: float | None = None
    earnings_ttm: float | None = None
    historical_revenue: list[dict[str, Any]] = field(default_factory=list)
    historical_earnings: list[dict[str, Any]] = field(default_factory=list)


@dataclass(frozen=True)
class NewsItem:
    headline: str
    summary: str
    url: str
    source: str
    published_at: datetime
    sentiment_score: float | None = None


@dataclass(frozen=True)
class PricePoint:
    date: date
    open: float | None
    high: float | None
    low: float | None
    close: float
    adj_close: float
    volume: int | None


def _to_jsonable(v: Any) -> Any:
    if isinstance(v, (date, datetime)):
        return v.isoformat()
    if isinstance(v, dict):
        return {k: _to_jsonable(x) for k, x in v.items()}
    if isinstance(v, list):
        return [_to_jsonable(x) for x in v]
    return v


def dataclass_to_jsonable(obj: Any) -> dict[str, Any]:
    """Convert a frozen dataclass (or list of them) to a JSON-safe dict."""
    if isinstance(obj, list):
        return [dataclass_to_jsonable(x) for x in obj]
    d = asdict(obj)
    return {k: _to_jsonable(v) for k, v in d.items()}


class DataProvider(ABC):
    """Contract for fetching market data. v1 implementations are free-tier;
    paid providers (Polygon, FMP) can implement the same interface."""

    @abstractmethod
    def get_quote(self, ticker: str) -> Quote: ...

    @abstractmethod
    def get_fundamentals(self, ticker: str) -> Fundamentals: ...

    @abstractmethod
    def get_news(self, ticker: str, days: int = 14, limit: int = 20) -> list[NewsItem]: ...

    @abstractmethod
    def get_competitors(self, ticker: str, limit: int = 5) -> list[str]: ...

    @abstractmethod
    def get_historical_prices(
        self, ticker: str, start: date, end: date
    ) -> list[PricePoint]: ...

    @abstractmethod
    def get_earnings_calendar(self, ticker: str) -> date | None: ...

    def get_logo_url(self, ticker: str) -> str | None:
        """Optional. Return a CDN URL for the company logo, or None."""
        return None

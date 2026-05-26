"""Alpha Vantage-backed DataProvider — fundamentals fallback only.

Free tier is 25 requests/day. Use only when yfinance fails.
"""
from __future__ import annotations

from datetime import date

from alpha_vantage.fundamentaldata import FundamentalData

from claude_stocks.config import ALPHAVANTAGE_API_KEY
from claude_stocks.data.base import (
    DataProvider,
    Fundamentals,
    NewsItem,
    PricePoint,
    Quote,
)


def _float(v) -> float | None:
    if v in (None, "None", "-", ""):
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _int(v) -> int | None:
    f = _float(v)
    return int(f) if f is not None else None


class AlphaVantageProvider(DataProvider):
    def __init__(self) -> None:
        if not ALPHAVANTAGE_API_KEY:
            raise RuntimeError("ALPHAVANTAGE_API_KEY not set")
        self.fd = FundamentalData(key=ALPHAVANTAGE_API_KEY, output_format="json")

    def get_quote(self, ticker: str) -> Quote:
        raise NotImplementedError("Quote routed to yfinance")

    def get_fundamentals(self, ticker: str) -> Fundamentals:
        data, _ = self.fd.get_company_overview(ticker.upper())
        if not data or "Symbol" not in data:
            raise RuntimeError(f"AlphaVantage returned no overview for {ticker}")
        return Fundamentals(
            ticker=ticker.upper(),
            as_of=date.today(),
            pe_ratio=_float(data.get("PERatio")),
            forward_pe=_float(data.get("ForwardPE")),
            peg_ratio=_float(data.get("PEGRatio")),
            price_to_sales=_float(data.get("PriceToSalesRatioTTM")),
            price_to_book=_float(data.get("PriceToBookRatio")),
            ev_to_ebitda=_float(data.get("EVToEBITDA")),
            profit_margin=_float(data.get("ProfitMargin")),
            operating_margin=_float(data.get("OperatingMarginTTM")),
            revenue_growth_yoy=_float(data.get("QuarterlyRevenueGrowthYOY")),
            earnings_growth_yoy=_float(data.get("QuarterlyEarningsGrowthYOY")),
            return_on_equity=_float(data.get("ReturnOnEquityTTM")),
            debt_to_equity=None,
            free_cash_flow=None,
            dividend_yield=_float(data.get("DividendYield")),
            sector=data.get("Sector"),
            industry=data.get("Industry"),
            description=data.get("Description"),
            employees=_int(data.get("FullTimeEmployees")),
            revenue_ttm=_float(data.get("RevenueTTM")),
            earnings_ttm=_float(data.get("EBITDA")),
            historical_revenue=[],
            historical_earnings=[],
        )

    def get_news(self, ticker: str, days: int = 14, limit: int = 20) -> list[NewsItem]:
        raise NotImplementedError("News routed to Finnhub / yfinance")

    def get_competitors(self, ticker: str, limit: int = 5) -> list[str]:
        raise NotImplementedError("Competitors routed to Finnhub")

    def get_historical_prices(self, ticker: str, start: date, end: date) -> list[PricePoint]:
        raise NotImplementedError("Historical prices routed to yfinance")

    def get_earnings_calendar(self, ticker: str) -> date | None:
        raise NotImplementedError("Earnings calendar routed to Finnhub / yfinance")

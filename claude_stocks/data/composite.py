"""CompositeProvider routes each method to the right provider with fallbacks.

Swap to paid providers (Polygon, FMP) by constructing CompositeProvider with
different providers — the analysis layer doesn't care which one returns the data.
"""
from __future__ import annotations

import logging
from dataclasses import asdict
from datetime import date

from claude_stocks.config import PROVIDER_CACHE_TTL_SECONDS
from claude_stocks.data import cache
from claude_stocks.data.base import (
    DataProvider,
    Fundamentals,
    NewsItem,
    PricePoint,
    Quote,
)
from claude_stocks.data.yfinance_provider import YFinanceProvider

log = logging.getLogger(__name__)


def _quote_from_cached(d: dict) -> Quote:
    from datetime import datetime

    return Quote(
        ticker=d["ticker"],
        price=d["price"],
        timestamp=datetime.fromisoformat(d["timestamp"]),
        day_change_pct=d.get("day_change_pct"),
        volume=d.get("volume"),
        market_cap=d.get("market_cap"),
        company_name=d.get("company_name"),
    )


def _fundamentals_from_cached(d: dict) -> Fundamentals:
    return Fundamentals(
        ticker=d["ticker"],
        as_of=date.fromisoformat(d["as_of"]),
        pe_ratio=d.get("pe_ratio"),
        forward_pe=d.get("forward_pe"),
        peg_ratio=d.get("peg_ratio"),
        price_to_sales=d.get("price_to_sales"),
        price_to_book=d.get("price_to_book"),
        ev_to_ebitda=d.get("ev_to_ebitda"),
        profit_margin=d.get("profit_margin"),
        operating_margin=d.get("operating_margin"),
        revenue_growth_yoy=d.get("revenue_growth_yoy"),
        earnings_growth_yoy=d.get("earnings_growth_yoy"),
        return_on_equity=d.get("return_on_equity"),
        debt_to_equity=d.get("debt_to_equity"),
        free_cash_flow=d.get("free_cash_flow"),
        dividend_yield=d.get("dividend_yield"),
        sector=d.get("sector"),
        industry=d.get("industry"),
        description=d.get("description"),
        employees=d.get("employees"),
        revenue_ttm=d.get("revenue_ttm"),
        earnings_ttm=d.get("earnings_ttm"),
        historical_revenue=d.get("historical_revenue", []),
        historical_earnings=d.get("historical_earnings", []),
    )


def _news_from_cached(items: list[dict]) -> list[NewsItem]:
    from datetime import datetime

    return [
        NewsItem(
            headline=i["headline"],
            summary=i["summary"],
            url=i["url"],
            source=i["source"],
            published_at=datetime.fromisoformat(i["published_at"]),
            sentiment_score=i.get("sentiment_score"),
        )
        for i in items
    ]


def _serialize_dc(obj) -> dict:
    d = asdict(obj)
    for k, v in list(d.items()):
        if hasattr(v, "isoformat"):
            d[k] = v.isoformat()
    return d


class CompositeProvider(DataProvider):
    def __init__(
        self,
        *,
        primary: DataProvider | None = None,
        news_provider: DataProvider | None = None,
        competitors_provider: DataProvider | None = None,
        fundamentals_fallback: DataProvider | None = None,
        earnings_provider: DataProvider | None = None,
    ) -> None:
        self.primary = primary or YFinanceProvider()
        self.news_provider = news_provider
        self.competitors_provider = competitors_provider
        self.fundamentals_fallback = fundamentals_fallback
        self.earnings_provider = earnings_provider

    def get_quote(self, ticker: str) -> Quote:
        def fetch():
            q = self.primary.get_quote(ticker)
            return _serialize_dc(q)

        cached = cache.cached_call(
            "quote", ticker, PROVIDER_CACHE_TTL_SECONDS["quote"], fetch
        )
        return _quote_from_cached(cached)

    def get_fundamentals(self, ticker: str) -> Fundamentals:
        def fetch():
            try:
                return _serialize_dc(self.primary.get_fundamentals(ticker))
            except Exception as e:
                log.warning("primary fundamentals failed for %s: %s", ticker, e)
                if self.fundamentals_fallback is None:
                    raise
                return _serialize_dc(self.fundamentals_fallback.get_fundamentals(ticker))

        cached = cache.cached_call(
            "fundamentals", ticker, PROVIDER_CACHE_TTL_SECONDS["fundamentals"], fetch
        )
        return _fundamentals_from_cached(cached)

    def get_news(self, ticker: str, days: int = 14, limit: int = 20) -> list[NewsItem]:
        def fetch():
            providers = [p for p in (self.news_provider, self.primary) if p]
            last_err: Exception | None = None
            for p in providers:
                try:
                    items = p.get_news(ticker, days=days, limit=limit)
                    return [_serialize_dc(i) for i in items]
                except NotImplementedError:
                    continue
                except Exception as e:
                    log.warning("news fetch via %s failed: %s", type(p).__name__, e)
                    last_err = e
            if last_err:
                log.warning("falling back to empty news for %s", ticker)
            return []

        cached = cache.cached_call(
            "news",
            ticker,
            PROVIDER_CACHE_TTL_SECONDS["news"],
            fetch,
            extra={"days": days, "limit": limit},
        )
        return _news_from_cached(cached)

    def get_competitors(self, ticker: str, limit: int = 5) -> list[str]:
        def fetch():
            providers = [p for p in (self.competitors_provider, self.primary) if p]
            for p in providers:
                try:
                    peers = p.get_competitors(ticker, limit=limit)
                    if peers:
                        return peers
                except NotImplementedError:
                    continue
                except Exception as e:
                    log.warning("competitors via %s failed: %s", type(p).__name__, e)
            return []

        return cache.cached_call(
            "competitors",
            ticker,
            PROVIDER_CACHE_TTL_SECONDS["competitors"],
            fetch,
            extra={"limit": limit},
        )

    def get_historical_prices(
        self, ticker: str, start: date, end: date
    ) -> list[PricePoint]:
        # Historical prices intentionally uncached at this layer — handled by price_history table.
        return self.primary.get_historical_prices(ticker, start, end)

    def get_logo_url(self, ticker: str) -> str | None:
        def fetch():
            # Finnhub is the only provider that exposes logos; fall through to
            # primary for completeness so a future yfinance-extension can work.
            providers = [p for p in (self.news_provider, self.primary) if p]
            for p in providers:
                try:
                    url = p.get_logo_url(ticker)
                    if url:
                        return url
                except NotImplementedError:
                    continue
                except Exception as e:
                    log.warning("logo via %s failed: %s", type(p).__name__, e)
            return None

        return cache.cached_call(
            "logo_url", ticker, PROVIDER_CACHE_TTL_SECONDS["logo_url"], fetch
        )

    def get_earnings_calendar(self, ticker: str) -> date | None:
        def fetch():
            providers = [p for p in (self.earnings_provider, self.primary) if p]
            for p in providers:
                try:
                    d = p.get_earnings_calendar(ticker)
                    if d is not None:
                        return d.isoformat()
                except NotImplementedError:
                    continue
                except Exception as e:
                    log.warning("earnings via %s failed: %s", type(p).__name__, e)
            return None

        cached = cache.cached_call(
            "earnings_calendar",
            ticker,
            PROVIDER_CACHE_TTL_SECONDS["earnings_calendar"],
            fetch,
        )
        return date.fromisoformat(cached) if cached else None


def build_default_provider() -> CompositeProvider:
    """Construct the v1 free-tier composite. Wires Finnhub for news/peers if key
    is present, and AlphaVantage as fundamentals fallback if key is present."""
    from claude_stocks.config import ALPHAVANTAGE_API_KEY, FINNHUB_API_KEY

    news = competitors = earnings = None
    if FINNHUB_API_KEY:
        try:
            from claude_stocks.data.finnhub_provider import FinnhubProvider

            fh = FinnhubProvider()
            news = competitors = earnings = fh
        except Exception as e:
            log.warning("Finnhub init failed: %s", e)

    fundamentals_fallback = None
    if ALPHAVANTAGE_API_KEY:
        try:
            from claude_stocks.data.alphavantage_provider import AlphaVantageProvider

            fundamentals_fallback = AlphaVantageProvider()
        except Exception as e:
            log.warning("AlphaVantage init failed: %s", e)

    return CompositeProvider(
        primary=YFinanceProvider(),
        news_provider=news,
        competitors_provider=competitors,
        fundamentals_fallback=fundamentals_fallback,
        earnings_provider=earnings,
    )

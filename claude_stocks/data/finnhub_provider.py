"""Finnhub-backed DataProvider (news + peers + earnings calendar).

Finnhub free tier: 60 requests/minute. Used for news (better than yfinance,
has sentiment scoring) and competitor peers (yfinance lacks this).
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

import finnhub

from claude_stocks.config import FINNHUB_API_KEY
from claude_stocks.data.base import (
    DataProvider,
    Fundamentals,
    NewsItem,
    PricePoint,
    Quote,
)


class FinnhubProvider(DataProvider):
    def __init__(self) -> None:
        if not FINNHUB_API_KEY:
            raise RuntimeError("FINNHUB_API_KEY not set")
        self.client = finnhub.Client(api_key=FINNHUB_API_KEY)

    def get_quote(self, ticker: str) -> Quote:
        raise NotImplementedError("Quote routed to yfinance")

    def get_fundamentals(self, ticker: str) -> Fundamentals:
        raise NotImplementedError("Fundamentals routed to yfinance / AlphaVantage")

    def get_news(self, ticker: str, days: int = 14, limit: int = 20) -> list[NewsItem]:
        end = date.today()
        start = end - timedelta(days=days)
        raw = self.client.company_news(ticker.upper(), _from=start.isoformat(), to=end.isoformat())

        # Best-effort sentiment fetch — Finnhub exposes an aggregate sentiment
        # endpoint; use it to bucket items if available.
        agg_sentiment: float | None = None
        try:
            sent = self.client.news_sentiment(ticker.upper())
            agg_sentiment = sent.get("sentiment", {}).get("bullishPercent")
            if agg_sentiment is not None:
                agg_sentiment = (float(agg_sentiment) - 0.5) * 2  # 0..1 -> -1..1
        except Exception:
            pass

        out: list[NewsItem] = []
        for r in raw[:limit]:
            ts = r.get("datetime", 0)
            published = datetime.fromtimestamp(int(ts), tz=timezone.utc) if ts else datetime.now(timezone.utc)
            out.append(
                NewsItem(
                    headline=r.get("headline", ""),
                    summary=r.get("summary", ""),
                    url=r.get("url", ""),
                    source=r.get("source", "Finnhub"),
                    published_at=published,
                    sentiment_score=agg_sentiment,
                )
            )
        return out

    def get_competitors(self, ticker: str, limit: int = 5) -> list[str]:
        peers = self.client.company_peers(ticker.upper()) or []
        peers = [p for p in peers if p.upper() != ticker.upper()]
        return peers[:limit]

    def get_historical_prices(self, ticker: str, start: date, end: date) -> list[PricePoint]:
        raise NotImplementedError("Historical prices routed to yfinance (free)")

    def get_logo_url(self, ticker: str) -> str | None:
        try:
            profile = self.client.company_profile2(symbol=ticker.upper()) or {}
        except Exception:
            return None
        url = profile.get("logo")
        return url if isinstance(url, str) and url.startswith("http") else None

    def get_earnings_calendar(self, ticker: str) -> date | None:
        end = date.today() + timedelta(days=120)
        try:
            res = self.client.earnings_calendar(
                _from=date.today().isoformat(), to=end.isoformat(), symbol=ticker.upper()
            )
            events = res.get("earningsCalendar", [])
            for ev in events:
                if ev.get("symbol", "").upper() == ticker.upper():
                    d = ev.get("date")
                    if d:
                        return date.fromisoformat(d)
        except Exception:
            return None
        return None

"""yfinance-backed DataProvider implementation.

yfinance is an unofficial Yahoo scraper — expect occasional breakage when Yahoo's
HTML changes. AlphaVantage is wired as the fundamentals fallback.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Any

import yfinance as yf

from claude_stocks.data.base import (
    DataProvider,
    Fundamentals,
    NewsItem,
    PricePoint,
    Quote,
)


def _safe(d: dict, key: str) -> Any:
    v = d.get(key)
    return None if v in (None, "None", "Infinity", "-Infinity") else v


class YFinanceProvider(DataProvider):
    def get_quote(self, ticker: str) -> Quote:
        t = yf.Ticker(ticker)
        info = t.info or {}
        price = _safe(info, "currentPrice") or _safe(info, "regularMarketPrice")
        prev = _safe(info, "regularMarketPreviousClose") or _safe(info, "previousClose")
        change_pct = None
        if price is not None and prev:
            change_pct = (price / prev - 1) * 100
        if price is None:
            hist = t.history(period="2d")
            if not hist.empty:
                price = float(hist["Close"].iloc[-1])
                if len(hist) >= 2:
                    change_pct = (price / float(hist["Close"].iloc[-2]) - 1) * 100
        if price is None:
            raise RuntimeError(f"Could not fetch quote for {ticker}")
        return Quote(
            ticker=ticker.upper(),
            price=float(price),
            timestamp=datetime.now(timezone.utc),
            day_change_pct=float(change_pct) if change_pct is not None else None,
            volume=_safe(info, "volume"),
            market_cap=_safe(info, "marketCap"),
            company_name=_safe(info, "longName") or _safe(info, "shortName"),
        )

    def get_fundamentals(self, ticker: str) -> Fundamentals:
        t = yf.Ticker(ticker)
        info = t.info or {}
        if not info:
            raise RuntimeError(f"yfinance returned no info for {ticker}")

        historical_revenue: list[dict[str, Any]] = []
        historical_earnings: list[dict[str, Any]] = []
        try:
            fin = t.financials
            if fin is not None and not fin.empty:
                if "Total Revenue" in fin.index:
                    historical_revenue = [
                        {"period": str(c.date() if hasattr(c, "date") else c), "value": float(v)}
                        for c, v in fin.loc["Total Revenue"].dropna().items()
                    ]
                if "Net Income" in fin.index:
                    historical_earnings = [
                        {"period": str(c.date() if hasattr(c, "date") else c), "value": float(v)}
                        for c, v in fin.loc["Net Income"].dropna().items()
                    ]
        except Exception:
            pass

        return Fundamentals(
            ticker=ticker.upper(),
            as_of=date.today(),
            pe_ratio=_safe(info, "trailingPE"),
            forward_pe=_safe(info, "forwardPE"),
            peg_ratio=_safe(info, "pegRatio") or _safe(info, "trailingPegRatio"),
            price_to_sales=_safe(info, "priceToSalesTrailing12Months"),
            price_to_book=_safe(info, "priceToBook"),
            ev_to_ebitda=_safe(info, "enterpriseToEbitda"),
            profit_margin=_safe(info, "profitMargins"),
            operating_margin=_safe(info, "operatingMargins"),
            revenue_growth_yoy=_safe(info, "revenueGrowth"),
            earnings_growth_yoy=_safe(info, "earningsGrowth"),
            return_on_equity=_safe(info, "returnOnEquity"),
            debt_to_equity=_safe(info, "debtToEquity"),
            free_cash_flow=_safe(info, "freeCashflow"),
            dividend_yield=_safe(info, "dividendYield"),
            sector=_safe(info, "sector"),
            industry=_safe(info, "industry"),
            description=_safe(info, "longBusinessSummary"),
            employees=_safe(info, "fullTimeEmployees"),
            revenue_ttm=_safe(info, "totalRevenue"),
            earnings_ttm=_safe(info, "netIncomeToCommon"),
            historical_revenue=historical_revenue,
            historical_earnings=historical_earnings,
        )

    def get_news(self, ticker: str, days: int = 14, limit: int = 20) -> list[NewsItem]:
        t = yf.Ticker(ticker)
        items_raw = getattr(t, "news", None) or []
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)
        out: list[NewsItem] = []
        for raw in items_raw:
            content = raw.get("content", raw)
            ts = content.get("pubDate") or raw.get("providerPublishTime")
            if isinstance(ts, (int, float)):
                published = datetime.fromtimestamp(ts, tz=timezone.utc)
            elif isinstance(ts, str):
                try:
                    published = datetime.fromisoformat(ts.replace("Z", "+00:00"))
                except ValueError:
                    continue
            else:
                continue
            if published < cutoff:
                continue
            headline = content.get("title") or raw.get("title") or ""
            summary = content.get("summary") or content.get("description") or ""
            url_obj = content.get("canonicalUrl") or content.get("clickThroughUrl") or {}
            url = url_obj.get("url") if isinstance(url_obj, dict) else (url_obj or raw.get("link", ""))
            provider = content.get("provider", {})
            source = provider.get("displayName") if isinstance(provider, dict) else raw.get("publisher", "Yahoo")
            out.append(
                NewsItem(
                    headline=headline,
                    summary=summary,
                    url=url or "",
                    source=source or "Yahoo",
                    published_at=published,
                    sentiment_score=None,
                )
            )
            if len(out) >= limit:
                break
        return out

    def get_competitors(self, ticker: str, limit: int = 5) -> list[str]:
        # yfinance has no robust peers endpoint; return empty so the composite
        # routes to Finnhub.
        return []

    def get_historical_prices(
        self, ticker: str, start: date, end: date
    ) -> list[PricePoint]:
        t = yf.Ticker(ticker)
        hist = t.history(start=start.isoformat(), end=(end + timedelta(days=1)).isoformat(), auto_adjust=False)
        out: list[PricePoint] = []
        for idx, row in hist.iterrows():
            d = idx.date() if hasattr(idx, "date") else idx
            adj = float(row.get("Adj Close", row["Close"])) if "Adj Close" in row else float(row["Close"])
            out.append(
                PricePoint(
                    date=d,
                    open=float(row["Open"]) if "Open" in row else None,
                    high=float(row["High"]) if "High" in row else None,
                    low=float(row["Low"]) if "Low" in row else None,
                    close=float(row["Close"]),
                    adj_close=adj,
                    volume=int(row["Volume"]) if "Volume" in row else None,
                )
            )
        return out

    def get_earnings_calendar(self, ticker: str) -> date | None:
        t = yf.Ticker(ticker)
        try:
            cal = t.calendar
            if cal is None:
                return None
            if isinstance(cal, dict):
                ev = cal.get("Earnings Date")
                if isinstance(ev, list) and ev:
                    val = ev[0]
                    if isinstance(val, datetime):
                        return val.date()
                    if isinstance(val, date):
                        return val
        except Exception:
            return None
        return None

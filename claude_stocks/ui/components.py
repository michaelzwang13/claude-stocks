"""Small Streamlit components shared across views."""
from __future__ import annotations

import streamlit as st


_RATING_STYLE = {
    "BUY":  {"bg": "#0a7d3c", "fg": "#ffffff"},
    "HOLD": {"bg": "#c08a00", "fg": "#ffffff"},
    "SELL": {"bg": "#a3231f", "fg": "#ffffff"},
}

_FACTOR_RATING_STYLE = {
    "bullish": {"bg": "#0a7d3c", "fg": "#ffffff"},
    "neutral": {"bg": "#5a5a5a", "fg": "#ffffff"},
    "bearish": {"bg": "#a3231f", "fg": "#ffffff"},
}


def rating_badge(rating: str, score: float | None = None) -> None:
    style = _RATING_STYLE.get(rating, {"bg": "#444", "fg": "#fff"})
    score_html = f" &nbsp; <span style='font-weight:400'>{score:.1f}/10</span>" if score is not None else ""
    st.markdown(
        f"""
        <div style="
            display:inline-block;
            background:{style['bg']};
            color:{style['fg']};
            padding:8px 18px;
            border-radius:8px;
            font-weight:700;
            font-size:1.3rem;
            letter-spacing:0.04em;
        ">{rating}{score_html}</div>
        """,
        unsafe_allow_html=True,
    )


def factor_card(factor: dict) -> None:
    """One factor card: label, big score, rating chip, top key point."""
    style = _FACTOR_RATING_STYLE.get(factor["rating"], _FACTOR_RATING_STYLE["neutral"])
    top_point = factor["key_points"][0] if factor.get("key_points") else ""
    label = factor["factor"].capitalize()
    st.markdown(
        f"""
        <div style="
            border:1px solid rgba(120,120,120,0.25);
            border-radius:10px;
            padding:12px 14px;
            background:rgba(120,120,120,0.06);
            height:130px;
            display:flex;
            flex-direction:column;
            justify-content:space-between;
        ">
            <div style="display:flex;align-items:center;justify-content:space-between;">
                <span style="font-weight:600;font-size:0.95rem;">{label}</span>
                <span style="background:{style['bg']};color:{style['fg']};font-size:0.7rem;padding:2px 8px;border-radius:99px;text-transform:uppercase;">{factor['rating']}</span>
            </div>
            <div style="font-size:2.2rem;font-weight:700;line-height:1;">
                {factor['score']:.1f}<span style="font-size:1rem;font-weight:400;opacity:0.6;"> /10</span>
            </div>
            <div style="font-size:0.82rem;opacity:0.85;line-height:1.25;max-height:2.5em;overflow:hidden;">
                {top_point}
            </div>
        </div>
        """,
        unsafe_allow_html=True,
    )


def metric_row(items: list[tuple[str, str]]) -> None:
    cols = st.columns(len(items))
    for c, (label, value) in zip(cols, items):
        c.metric(label, value)

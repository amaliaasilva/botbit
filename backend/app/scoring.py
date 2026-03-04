from __future__ import annotations

from dataclasses import dataclass
from typing import Any


def clamp(value: float, min_value: float, max_value: float) -> float:
    return max(min_value, min(value, max_value))


def resolve_regime(
    close: float,
    ema50: float,
    ema200: float,
    rsi14: float,
    *,
    rsi_alta_min: float = 45.0,
    rsi_alta_max: float = 70.0,
) -> str:
    if close > ema200 and ema50 > ema200 and rsi_alta_min <= rsi14 <= rsi_alta_max:
        return "Alta"
    if close < ema200 or ema50 < ema200:
        return "Baixa"
    return "Neutro"


def resolve_signal(
    regime: str,
    prev_close: float,
    prev_ema50: float,
    prev_rsi14: float,
    close: float,
    ema50: float,
    rsi14: float,
    breakout_reference: float,
    *,
    rsi_breakout_min: float = 50.0,
    rsi_pullback_threshold: float = 45.0,
) -> str:
    if regime == "Baixa":
        return "AVOID"
    if regime == "Neutro":
        return "WAIT"

    pullback_retake = (
        prev_close <= prev_ema50
        and close > ema50
        and prev_rsi14 < rsi_pullback_threshold <= rsi14
    )
    breakout_simple = close > breakout_reference and rsi14 >= rsi_breakout_min
    if pullback_retake or breakout_simple:
        return "BUY"
    return "WAIT"


def resolve_score(close: float, ema50: float, ema200: float, rsi14: float, atr14: float, ret_30d: float, regime: str) -> int:
    base = 50

    trend_component = 0
    if close > ema200:
        trend_component += 15
    if ema50 > ema200:
        trend_component += 10
    if close > ema50:
        trend_component += 10
    trend_component = clamp(trend_component, 0, 35)

    rsi_component = 0
    if 50 <= rsi14 <= 65:
        rsi_component = 20
    elif 45 <= rsi14 < 50:
        rsi_component = 10
    elif rsi14 > 75:
        rsi_component = -10
    rsi_component = clamp(rsi_component, 0, 20)

    vol_component = 15
    atr_pct = atr14 / close if close else 0
    if atr_pct > 0.04:
        vol_component -= 10
    vol_component = clamp(vol_component, 0, 15)

    return_component = 0
    if ret_30d > 0.10:
        return_component = 15
    elif ret_30d > 0:
        return_component = 10
    elif ret_30d > -0.10:
        return_component = 5
    else:
        return_component = -5
    return_component = clamp(return_component, 0, 15)

    regime_penalty = -30 if regime == "Baixa" else 0

    score = base + trend_component + rsi_component + vol_component + return_component + regime_penalty
    return int(round(clamp(score, 0, 100)))


def resolve_explanation(signal: str, regime: str, close: float, ema50: float, ema200: float, rsi14: float) -> str:
    trend_state = "acima" if close > ema200 else "abaixo"
    ema_state = "EMA50>EMA200" if ema50 > ema200 else "EMA50<=EMA200"
    return (
        f"{signal} em regime {regime}: preço {trend_state} da EMA200, {ema_state}, RSI14={rsi14:.1f}."
    )


@dataclass
class ScoredRow:
    symbol: str
    asset_type: str
    ts: Any
    date: Any
    ema50: float
    ema200: float
    rsi14: float
    atr14: float
    regime: str
    signal: str
    stop_price: float | None
    score: int
    explanation: str

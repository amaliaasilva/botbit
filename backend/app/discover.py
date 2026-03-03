from __future__ import annotations

import re
from datetime import datetime
from statistics import mean
from typing import Any

import pandas as pd

from app.config import get_logger, get_settings, log_event
from app.indicators import atr, ema, rsi
from app.sources.binance import BinanceClient
from app.storage.firestore_client import FirestoreNotificationStorage

logger = get_logger(__name__)
SYMBOL_RE = re.compile(r"^[A-Z0-9]{3,12}USDT$")

STABLE_PREFIXES = (
    "USDC",
    "USDT",
    "FDUSD",
    "TUSD",
    "USDP",
    "BUSD",
    "DAI",
    "USD",
)


def _safe_float(value: Any) -> float:
    try:
        return float(value)
    except Exception:
        return 0.0


def _valid_symbol(symbol: str) -> bool:
    text = str(symbol or "").upper()
    if not SYMBOL_RE.match(text):
        return False
    if any(text.startswith(prefix) for prefix in STABLE_PREFIXES):
        return False
    return True


def _build_universe(binance: BinanceClient) -> list[dict[str, Any]]:
    settings = get_settings()
    exchange_info = binance.fetch_exchange_info()
    trading_spot = {
        str(item.get("symbol") or "").upper()
        for item in (exchange_info.get("symbols") or [])
        if item.get("status") == "TRADING" and item.get("isSpotTradingAllowed") is True
    }

    tickers = binance.fetch_ticker_24h_all()
    rows = []
    for ticker in tickers:
        symbol = str(ticker.get("symbol") or "").upper()
        if symbol not in trading_spot:
            continue
        if not _valid_symbol(symbol):
            continue

        quote_volume = _safe_float(ticker.get("quoteVolume"))
        if quote_volume < settings.discover_liquidity_min_quote_volume:
            continue

        rows.append(
            {
                "symbol": symbol,
                "quoteVolume": quote_volume,
                "priceChangePercent": _safe_float(ticker.get("priceChangePercent")),
                "lastPrice": _safe_float(ticker.get("lastPrice")),
            }
        )

    rows.sort(key=lambda item: item["quoteVolume"], reverse=True)
    return rows[: settings.discover_top_n]


def _calc_features(symbol: str, klines: pd.DataFrame, btc_returns: pd.Series) -> dict[str, Any] | None:
    if klines.empty or len(klines) < 220:
        return None

    df = klines.copy().sort_values("time").reset_index(drop=True)
    df["ema50"] = ema(df["close"], 50)
    df["ema200"] = ema(df["close"], 200)
    df["rsi14"] = rsi(df["close"], 14)
    df["atr14"] = atr(df, 14)
    df["ret_4h"] = df["close"].pct_change(1)
    df["ret_24h"] = df["close"].pct_change(6)
    df["ret_7d"] = df["close"].pct_change(42)
    df["ret_30d"] = df["close"].pct_change(180)
    df["volume_mean_30d"] = df["volume"].rolling(180).mean()
    df["volume_std_30d"] = df["volume"].rolling(180).std()
    df["volume_z"] = (df["volume"] - df["volume_mean_30d"]) / df["volume_std_30d"].replace(0, pd.NA)
    df["atr_pct"] = (df["atr14"] / df["close"]).replace([pd.NA], 0)
    df["ema50_slope"] = df["ema50"].diff(5)

    latest = df.iloc[-1]
    max_20d = df["high"].tail(120).max()
    max_90d = df["high"].tail(540).max()
    drawdown_90d = (_safe_float(max_90d) - _safe_float(latest["close"])) / max(_safe_float(max_90d), 1e-9)

    returns = df["ret_4h"].tail(180).fillna(0)
    btc_tail = btc_returns.tail(180).fillna(0)
    corr_btc = _safe_float(returns.corr(btc_tail))

    rs_7d = _safe_float(latest["ret_7d"]) - _safe_float(btc_returns.tail(42).sum())
    rs_30d = _safe_float(latest["ret_30d"]) - _safe_float(btc_returns.tail(180).sum())

    breakout_volume = _safe_float(latest["close"]) >= _safe_float(max_20d) * 0.995 and _safe_float(latest["volume_z"]) >= 2

    atr_pct_series = df["atr_pct"].tail(84)
    atr_recent_mean = _safe_float(mean(atr_pct_series.tail(21))) if len(atr_pct_series.tail(21)) > 0 else 0
    atr_old_mean = _safe_float(mean(atr_pct_series.head(21))) if len(atr_pct_series.head(21)) > 0 else 0
    squeeze_release = atr_old_mean > 0 and atr_recent_mean <= atr_old_mean * 0.8 and _safe_float(latest["close"]) > _safe_float(latest["ema50"])

    rotation_rs = rs_7d > 0 and rs_30d > 0 and corr_btc < 0.6

    rsi_prev = _safe_float(df.iloc[-3]["rsi14"]) if len(df) >= 3 else _safe_float(latest["rsi14"])
    reversal_safe = drawdown_90d > 0.25 and rsi_prev < 35 <= _safe_float(latest["rsi14"]) and _safe_float(latest["close"]) >= _safe_float(latest["ema50"])

    tags: list[str] = []
    if breakout_volume:
        tags.append("BREAKOUT_VOLUME")
    if squeeze_release:
        tags.append("SQUEEZE_RELEASE")
    if rotation_rs:
        tags.append("ROTATION_RS")
    if reversal_safe:
        tags.append("REVERSAL_SAFE")

    potential_score = 50
    potential_score += 20 if breakout_volume else 0
    potential_score += 15 if rotation_rs else 0
    potential_score += 10 if squeeze_release else 0
    potential_score += 10 if reversal_safe else 0
    potential_score += min(10, int(max(_safe_float(latest["volume_z"]), 0) * 3))
    if _safe_float(latest["atr_pct"]) > 0.06:
        potential_score -= 15
    if _safe_float(latest["close"]) < _safe_float(latest["ema200"]) and _safe_float(latest["ema50_slope"]) < 0:
        potential_score -= 20
    potential_score = max(0, min(100, potential_score))

    explanation = (
        f"tags={','.join(tags) if tags else 'NONE'}; "
        f"volume_z={_safe_float(latest['volume_z']):.2f}; rs_30d={rs_30d:.3f}; corr_btc={corr_btc:.2f}"
    )

    return {
        "symbol": symbol,
        "potentialScore": potential_score,
        "tags": tags,
        "explanation": explanation,
        "keyMetrics": {
            "ret_24h": _safe_float(latest["ret_24h"]),
            "ret_7d": _safe_float(latest["ret_7d"]),
            "ret_30d": _safe_float(latest["ret_30d"]),
            "atr_pct": _safe_float(latest["atr_pct"]),
            "rsi14": _safe_float(latest["rsi14"]),
            "volume_z": _safe_float(latest["volume_z"]),
            "rs_7d": rs_7d,
            "rs_30d": rs_30d,
            "corr_btc": corr_btc,
        },
    }


def run_discover_pipeline() -> dict[str, Any]:
    settings = get_settings()
    fs_storage = FirestoreNotificationStorage(settings.gcp_project_id)
    binance = BinanceClient()

    run_id = datetime.utcnow().strftime("%Y%m%dT%H%M%S")
    started_at = datetime.utcnow()

    universe = _build_universe(binance)
    candidate_limit = min(settings.discover_candidate_kline_n, len(universe))
    candidates = universe[:candidate_limit]

    btc_klines = binance.fetch_klines("BTCUSDT", settings.btc_interval, 300)
    btc_returns = btc_klines["close"].pct_change(1).fillna(0)

    items: list[dict[str, Any]] = []
    failures = 0

    for item in candidates:
        symbol = item["symbol"]
        try:
            klines = binance.fetch_klines(symbol, settings.btc_interval, 300)
            features = _calc_features(symbol, klines, btc_returns)
            if not features:
                continue
            items.append(features)
            log_event(logger, "discover_symbol_ok", symbol=symbol, potentialScore=features["potentialScore"])
        except Exception as exc:
            failures += 1
            log_event(logger, "discover_symbol_error", symbol=symbol, error=str(exc))

    items.sort(key=lambda row: row["potentialScore"], reverse=True)
    top = items[:20]

    date_key = datetime.utcnow().strftime("%Y-%m-%d")
    for row in items:
        fs_storage.upsert_discovery_latest(row["symbol"], row)
    for row in top:
        fs_storage.upsert_discovery_top_item(date_key, row["symbol"], row)

    fs_storage.upsert_discovery_run(
        run_id,
        {
            "startedAt": started_at,
            "finishedAt": datetime.utcnow(),
            "universeCount": len(universe),
            "candidateCount": len(candidates),
            "topCount": len(top),
            "errorsCount": failures,
            "status": "ok" if failures == 0 else "partial",
        },
    )

    return {
        "ok": failures == 0,
        "runId": run_id,
        "universeCount": len(universe),
        "candidateCount": len(candidates),
        "topCount": len(top),
        "failed": failures,
    }


def get_discover_latest(limit_size: int = 20) -> list[dict[str, Any]]:
    settings = get_settings()
    fs_storage = FirestoreNotificationStorage(settings.gcp_project_id)
    return fs_storage.list_discovery_latest(limit_size)

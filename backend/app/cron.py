from __future__ import annotations

import hashlib
from datetime import datetime, timezone
from typing import Any

import pandas as pd

from app.alerts.appscript_email import AppScriptEmailAlerter
from app.config import get_logger, get_secret, get_settings, log_event
from app.indicators import enrich_btc_features
from app.scoring import resolve_explanation, resolve_regime, resolve_score, resolve_signal
from app.sources.binance import BinanceClient
from app.storage.bigquery_client import BigQueryStorage
from app.storage.firestore_client import FirestoreNotificationStorage

logger = get_logger(__name__)


def _safe_float(value: Any) -> float:
    try:
        return float(value)
    except Exception:
        return 0.0


def _normalize_symbol(symbol: str) -> str:
    return str(symbol or "").upper().strip()


def _is_supported_symbol(symbol: str) -> bool:
    symbol = _normalize_symbol(symbol)
    if not symbol.endswith("USDT"):
        return False
    base_asset = symbol[:-4]
    if len(base_asset) < 2:
        return False
    blocked_prefixes = ("USDC", "USDT", "FDUSD", "TUSD", "USDP", "BUSD", "DAI", "USD")
    if any(symbol.startswith(prefix) for prefix in blocked_prefixes):
        return False
    return True


def _build_rows_crypto(symbol: str, df: pd.DataFrame, asset_type: str = "CRYPTO") -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    if len(df) < 220:
        return rows

    recent = df[df["time"] >= (df["time"].max() - pd.Timedelta(days=90))].copy()
    for idx in range(1, len(recent)):
        current = recent.iloc[idx]
        prev = recent.iloc[idx - 1]
        if pd.isna(current["ema50"]) or pd.isna(current["ema200"]) or pd.isna(current["rsi14"]) or pd.isna(current["atr14"]):
            continue

        breakout_ref = recent.iloc[max(0, idx - 20) : idx]["high"].max()
        regime = resolve_regime(current["close"], current["ema50"], current["ema200"], current["rsi14"])
        signal = resolve_signal(
            regime,
            _safe_float(prev["close"]),
            _safe_float(prev["ema50"]),
            _safe_float(prev["rsi14"]),
            _safe_float(current["close"]),
            _safe_float(current["ema50"]),
            _safe_float(current["rsi14"]),
            _safe_float(breakout_ref),
        )

        score = resolve_score(
            _safe_float(current["close"]),
            _safe_float(current["ema50"]),
            _safe_float(current["ema200"]),
            _safe_float(current["rsi14"]),
            _safe_float(current["atr14"]),
            _safe_float(current["ret_30d"]),
            regime,
        )
        stop_price = _safe_float(current["close"]) - 1.5 * _safe_float(current["atr14"]) if signal == "BUY" else None

        rows.append(
            {
                "ts": current["time"].to_pydatetime().isoformat(),
                "date": None,
                "asset_type": asset_type,
                "symbol": symbol,
                "ema50": _safe_float(current["ema50"]),
                "ema200": _safe_float(current["ema200"]),
                "rsi14": _safe_float(current["rsi14"]),
                "atr14": _safe_float(current["atr14"]),
                "regime": regime,
                "signal": signal,
                "stop_price": stop_price,
                "score": score,
                "explanation": resolve_explanation(
                    signal,
                    regime,
                    _safe_float(current["close"]),
                    _safe_float(current["ema50"]),
                    _safe_float(current["ema200"]),
                    _safe_float(current["rsi14"]),
                ),
                "created_at": datetime.utcnow().isoformat(),
                "close": _safe_float(current["close"]),
            }
        )
    return rows


def _build_rows_btc(symbol: str, df: pd.DataFrame) -> list[dict[str, Any]]:
    return _build_rows_crypto(symbol, df, asset_type="BTC")


def _build_rows_b3(symbol: str, df: pd.DataFrame) -> list[dict[str, Any]]:
    return []


def _normalize_state(row: dict[str, Any]) -> tuple[int, str, str, str]:
    score = int(row.get("score") or 0)
    regime = str(row.get("regime") or "Neutro").capitalize()
    signal = str(row.get("signal") or "WAIT").upper()
    rsi14 = _safe_float(row.get("rsi14"))

    if rsi14 <= 0:
        return score, regime, "WAIT", "INSUFFICIENT_DATA"

    if regime == "Baixa":
        # Score já recebe -30 de penalty em resolve_score; não clicar em 59
        # pois elimina diferenciação entre ativos em queda (ex.: 65 vs 35).
        signal = "AVOID"

    # AVOID nunca pode virar BUY, mas mantém score real para o ranking.
    if signal == "BUY" and score < 70:
        signal = "WAIT"

    return score, regime, signal, "OK"


def _alert_id(symbol: str, signal: str, ts_text: str) -> str:
    key = f"{symbol}|{signal}|{ts_text}"
    return hashlib.sha256(key.encode("utf-8")).hexdigest()


def _send_alert_if_needed(
    storage: BigQueryStorage,
    fs_storage: FirestoreNotificationStorage | None,
    alerter: AppScriptEmailAlerter,
    destination_email: str | list[str],
    owner_uid: str,
    symbol: str,
    previous: dict[str, Any] | None,
    latest: dict[str, Any],
) -> bool:
    latest_signal = latest.get("signal")
    latest_regime = latest.get("regime")
    previous_regime = previous.get("regime") if previous else None
    current_score = int(latest.get("score") or 0)
    previous_score = int(previous.get("score") or 0) if previous else 0
    score_jump = current_score - previous_score

    should_send = (
        latest_signal == "BUY"
        or (previous_regime is not None and latest_regime != previous_regime)
        or (previous is not None and score_jump >= 10)
    )
    if not should_send:
        return False

    ts_text = str(latest.get("ts") or datetime.now(timezone.utc).isoformat())
    alert_type = "BUY" if latest_signal == "BUY" else ("REGIME_CHANGE" if previous_regime != latest_regime else "SCORE_JUMP")
    alert_id = _alert_id(symbol, f"{latest_signal}|{alert_type}", ts_text)
    if storage.has_alert(alert_id):
        return False

    stop_value = latest.get("stop_price")
    stop_text = f"{float(stop_value):.2f}" if stop_value is not None else "N/A"
    message = (
        f"SINAL: {latest_signal} | {symbol} | score={latest.get('score')} | "
        f"stop={stop_text} | regime={latest_regime} | RSI={float(latest.get('rsi14') or 0):.1f} | evento={alert_type}"
    )
    subject = f"[BotBit] {alert_type} - {symbol}"

    # Always persist in BigQuery + Firestore regardless of email outcome
    storage.insert_alert(alert_id, symbol, str(latest_signal), datetime.fromisoformat(str(latest.get("ts")).replace("Z", "+00:00")))
    email_ok, email_err = alerter.send_email(destination_email, subject, message, {"symbol": symbol, "event": alert_type})
    if fs_storage and owner_uid:
        fs_storage.add_notification(
            owner_uid,
            alert_id,
            {
                "type": "MARKET_ALERT",
                "symbol": symbol,
                "signal": latest_signal,
                "regime": latest_regime,
                "score": current_score,
                "message": message,
                "emailSent": email_ok,
                "emailError": email_err or None,
            },
        )
    return True


def _resolve_universe(binance: BinanceClient, fs_storage: FirestoreNotificationStorage | None = None) -> list[str]:
    """Resolve the score/quotes universe.

    Priority:
    1. config/score_universe_current.symbols   (if it exists and is non-empty)
    2. Fallback: DEFAULT_BINANCE_SYMBOLS + Binance top-N   (legacy behaviour)
    """
    settings = get_settings()

    # ── 1. Try governed universe ──────────────────────────────────────────────
    if fs_storage:
        try:
            universe_doc = fs_storage.get_score_universe()
            if universe_doc:
                symbols = universe_doc.get("symbols") or []
                if isinstance(symbols, list) and len(symbols) >= 3:
                    normalized = []
                    for s in symbols:
                        ns = _normalize_symbol(s)
                        if _is_supported_symbol(ns) and ns not in normalized:
                            normalized.append(ns)
                    if normalized:
                        log_event(logger, "universe_source", source="score_universe_current", count=len(normalized))
                        return normalized
        except Exception as exc:
            log_event(logger, "score_universe_read_error", error=str(exc))

    # ── 2. Fallback: legacy behaviour ─────────────────────────────────────────
    discovered: list[str] = []
    try:
        discovered = binance.fetch_top_usdt_symbols(settings.binance_universe_size)
    except Exception as exc:
        log_event(logger, "binance_discovery_error", error=str(exc))

    merged: list[str] = []
    for symbol in [settings.btc_symbol, *settings.binance_symbols, *discovered]:
        normalized = _normalize_symbol(symbol)
        if not _is_supported_symbol(normalized):
            continue
        if normalized in merged:
            continue
        merged.append(normalized)

    log_event(logger, "universe_source", source="legacy_fallback", count=len(merged[:max(1, settings.binance_universe_size)]))
    return merged[: max(1, settings.binance_universe_size)]


def run_quotes_pipeline() -> dict[str, Any]:
    settings = get_settings()
    binance = BinanceClient()
    fs_storage = FirestoreNotificationStorage(settings.gcp_project_id) if settings.gcp_project_id else None
    symbols = _resolve_universe(binance, fs_storage)

    # Clean stale quote docs no longer in the universe
    if fs_storage:
        try:
            stale_deleted = fs_storage.delete_stale_quote_docs(symbols)
            if stale_deleted:
                log_event(logger, "stale_quotes_cleaned", deleted=stale_deleted)
        except Exception as exc:
            log_event(logger, "stale_quotes_clean_error", error=str(exc))

    updated = 0
    failed = 0
    failed_symbols: list[str] = []

    for symbol in symbols:
        try:
            ticker = binance.fetch_ticker_24h(symbol)
            if not ticker:
                raise RuntimeError("empty_ticker")
            if fs_storage:
                fs_storage.upsert_quote(
                    symbol,
                    {
                        "price": _safe_float(ticker.get("lastPrice")),
                        "change24hPct": _safe_float(ticker.get("priceChangePercent")),
                        "volume24h": _safe_float(ticker.get("quoteVolume")),
                        "source": "binance",
                    },
                )
            updated += 1
            log_event(logger, "quote_ok", symbol=symbol)
        except Exception as exc:
            failed += 1
            failed_symbols.append(symbol)
            if fs_storage:
                fs_storage.upsert_quote(symbol, {"status": "ERROR", "error": str(exc), "source": "binance"})
            log_event(logger, "quote_error", symbol=symbol, error=str(exc))

    if fs_storage:
        fs_storage.upsert_system_status(
            "cron_quotes",
            {
                "ok": failed == 0,
                "updated": updated,
                "failed": failed,
                "symbols_failed": failed_symbols,
                "last_cron_ok_at": datetime.utcnow(),
            },
        )

    return {
        "ok": failed == 0,
        "updated": updated,
        "failed": failed,
        "symbols": symbols,
    }


def run_score_pipeline() -> dict[str, Any]:
    settings = get_settings()
    storage = BigQueryStorage(settings.gcp_project_id, settings.bq_dataset, settings.bq_location)
    storage.ensure_dataset_and_tables()

    fs_storage = FirestoreNotificationStorage(settings.gcp_project_id) if settings.gcp_project_id else None
    binance = BinanceClient()

    app_script_webhook_url = get_secret("APP_SCRIPT_WEBHOOK_URL")
    alert_webhook_token = get_secret("ALERT_WEBHOOK_TOKEN")
    alert_owner_email = get_secret("ALERT_OWNER_EMAIL") or ""
    alert_owner_uid = get_secret("FIREBASE_OWNER_UID") or ""
    alerter = AppScriptEmailAlerter(app_script_webhook_url, alert_webhook_token)

    # Also collect alertEmail from Firestore users who opted in
    extra_emails: list[str] = []
    if fs_storage:
        try:
            for uid in fs_storage.list_user_ids(limit_size=20):
                doc = fs_storage.client.collection("users").document(uid).get()
                if doc.exists:
                    d = doc.to_dict() or {}
                    user_email = str(d.get("alertEmail") or "").strip()
                    if user_email and user_email != alert_owner_email and user_email not in extra_emails:
                        extra_emails.append(user_email)
        except Exception as exc:
            log_event(logger, "extra_emails_fetch_failed", error=str(exc))
    all_alert_emails = [e for e in [alert_owner_email] + extra_emails if e]

    symbols = _resolve_universe(binance, fs_storage)

    # Clean stale market docs no longer in the universe
    if fs_storage:
        try:
            stale_deleted = fs_storage.delete_stale_market_docs(symbols)
            if stale_deleted:
                log_event(logger, "stale_market_docs_cleaned", deleted=stale_deleted)
        except Exception as exc:
            log_event(logger, "stale_market_clean_error", error=str(exc))

    updated = 0
    failed = 0
    failed_symbols: list[str] = []
    features_inserted = 0
    alerts_sent = 0

    for symbol in symbols:
        asset_type = "BTC" if symbol == settings.btc_symbol else "CRYPTO"
        try:
            klines = binance.fetch_klines(symbol, settings.btc_interval, 1000)
            if klines.empty:
                raise RuntimeError("empty_klines")

            if symbol == settings.btc_symbol:
                storage.insert_raw_btc(
                    [
                        {
                            "time": row["time"].to_pydatetime().isoformat(),
                            "open": _safe_float(row["open"]),
                            "high": _safe_float(row["high"]),
                            "low": _safe_float(row["low"]),
                            "close": _safe_float(row["close"]),
                            "volume": _safe_float(row["volume"]),
                            "source": "binance",
                        }
                        for _, row in klines.iterrows()
                    ]
                )

            features = enrich_btc_features(klines)
            rows = _build_rows_crypto(symbol, features, asset_type=asset_type)

            if not rows:
                if fs_storage:
                    fs_storage.upsert_market_score(
                        symbol,
                        {
                            "asset_type": asset_type,
                            "status": "INSUFFICIENT_DATA",
                            "signal": "WAIT",
                            "regime": "Neutro",
                            "score": 0,
                            "source": "binance",
                        },
                    )
                updated += 1
                continue

            for row in rows:
                row.pop("close", None)
            # Inserir apenas o snapshot mais recente (evita re-inserir histórico a cada run)
            storage.insert_feature_rows(rows[-1:])
            features_inserted += 1

            previous = storage.get_previous_feature(asset_type, symbol)
            latest = storage.get_latest_feature(asset_type, symbol)
            if not latest:
                raise RuntimeError("latest_feature_missing")

            score, regime, signal, status = _normalize_state(latest)
            close_value = _safe_float(features.iloc[-1].get("close")) if not features.empty else 0.0

            if fs_storage:
                fs_storage.upsert_market_score(
                    symbol,
                    {
                        "asset_type": asset_type,
                        "score": score,
                        "regime": regime,
                        "signal": signal,
                        "rsi14": _safe_float(latest.get("rsi14")),
                        "ema50": _safe_float(latest.get("ema50")),
                        "ema200": _safe_float(latest.get("ema200")),
                        "atr14": _safe_float(latest.get("atr14")),
                        "price_close": close_value,
                        "close": close_value,
                        "stop_price": latest.get("stop_price"),
                        "ts": latest.get("ts"),
                        "status": status,
                        "explanation": latest.get("explanation") or "",
                        "source": "binance",
                    },
                )

            if symbol == settings.btc_symbol:
                latest_for_alert = {**latest, "score": score, "regime": regime, "signal": signal}
                if _send_alert_if_needed(
                    storage,
                    fs_storage,
                    alerter,
                    all_alert_emails,
                    alert_owner_uid,
                    symbol,
                    previous,
                    latest_for_alert,
                ):
                    alerts_sent += 1

            updated += 1
            log_event(logger, "score_ok", symbol=symbol, score=score, regime=regime, signal=signal)
        except Exception as exc:
            failed += 1
            failed_symbols.append(symbol)
            if fs_storage:
                fs_storage.upsert_market_score(
                    symbol,
                    {
                        "asset_type": asset_type,
                        "status": "ERROR",
                        "signal": "WAIT",
                        "regime": "Neutro",
                        "score": 0,
                        "error": str(exc),
                        "source": "binance",
                    },
                )
            log_event(logger, "score_error", symbol=symbol, error=str(exc))

    if fs_storage:
        fs_storage.upsert_system_status(
            "cron_score",
            {
                "ok": failed == 0,
                "updated": updated,
                "failed": failed,
                "symbols_failed": failed_symbols,
                "features_inserted": features_inserted,
                "alerts_sent": alerts_sent,
                "last_cron_ok_at": datetime.utcnow(),
                "symbols_ok": updated,
            },
        )

    return {
        "ok": failed == 0,
        "updated": updated,
        "failed": failed,
        "features_inserted": features_inserted,
        "alerts_sent": alerts_sent,
        "symbols": symbols,
    }


def run_pipeline() -> dict[str, Any]:
    return run_score_pipeline()

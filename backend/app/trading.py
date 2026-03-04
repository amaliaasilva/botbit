from __future__ import annotations

import hashlib
import math
import re
from datetime import datetime, timedelta
from typing import Any

import requests as _requests

from app.alerts.appscript_email import AppScriptEmailAlerter
from app.config import get_logger, get_secret, get_settings, log_event
from app.sources.binance import BinanceClient
from app.sources.binance_trade import BinanceTradeClient
from app.storage.bigquery_client import BigQueryStorage
from app.storage.firestore_client import FirestoreNotificationStorage

try:
    from app.explain.explainer import build_explanation
except Exception:
    def build_explanation(event_type: str, symbol: str, facts: dict[str, Any] | None = None) -> dict[str, Any]:
        return {
            "level": "LEIGO",
            "decisionOneLiner": f"{event_type}: {symbol}",
            "levels": {
                "LEIGO": f"{event_type}: {symbol}",
                "INTERMEDIARIO": f"{event_type}: {symbol}",
                "TECNICO": {"eventType": event_type, "symbol": symbol, "facts": facts or {}},
            },
            "disclaimer": "Explicação educacional indisponível temporariamente.",
        }

logger = get_logger(__name__)


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except Exception:
        return default


def _safe_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except Exception:
        return default


def _now() -> datetime:
    return datetime.utcnow()


def _parse_ts(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        if value.tzinfo is not None:
            return value.astimezone(tz=None).replace(tzinfo=None)
        return value
    text = str(value or "").strip()
    if not text:
        return None
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00")).replace(tzinfo=None)
    except Exception:
        return None


def _dedupe_order_id(run_id: str, symbol: str, side: str, mode: str) -> str:
    base = f"{run_id}|{symbol}|{side}|{mode}"
    digest = hashlib.sha256(base.encode("utf-8")).hexdigest()[:18]
    return f"BB{digest}"[:32]


def _valid_symbol(symbol: str, regex_text: str) -> bool:
    try:
        return bool(re.match(regex_text, symbol))
    except Exception:
        return False


def _notify(
    fs: FirestoreNotificationStorage,
    alerts: dict[str, Any],
    owner_uid: str,
    event_type: str,
    priority: str,
    title: str,
    message: str,
    symbol: str = "",
    direction: str = "",
    payload: dict[str, Any] | None = None,
) -> None:
    cooldown_by_priority = {"P0": 0, "P1": 60, "P2": 180, "P3": 1440}
    cooldown_minutes = cooldown_by_priority.get(priority, _safe_int((alerts or {}).get("cooldownMinutes"), 180))
    ts_bucket = _now().strftime("%Y-%m-%dT%H") if priority in {"P2", "P3"} else _now().strftime("%Y-%m-%dT%H:%M")
    dedupe_hash = fs.build_alert_hash(event_type, symbol, direction, ts_bucket, key_fields=title)
    if not fs.should_send_alert(dedupe_hash, cooldown_minutes=cooldown_minutes):
        return

    if bool((alerts or {}).get("inAppEnabled", True)):
        recipients: list[str] = []
        known_users = set(fs.list_user_ids(limit_size=50))
        if owner_uid and owner_uid in known_users:
            recipients = [owner_uid]
        elif known_users:
            recipients = sorted(known_users)

        explanation = build_explanation(event_type=event_type, symbol=symbol or "SYSTEM", facts=payload or {})
        notification_payload = {
            "type": event_type,
            "priority": priority,
            "symbol": symbol,
            "title": title,
            "summary_leigo": message,
            "details": payload or {},
            "action_items": (payload or {}).get("action_items", ""),
            "dedupeHash": dedupe_hash,
            "explanation": explanation,
            **(payload or {}),
        }
        for uid in recipients:
            fs.add_notification(uid, dedupe_hash, notification_payload)

    fs.register_sent_alert(
        dedupe_hash,
        {
            "eventType": event_type,
            "priority": priority,
            "symbol": symbol,
            "direction": direction,
            "title": title,
        },
    )


def _load_universe(config: dict[str, Any], discover_rows: list[dict[str, Any]]) -> list[str]:
    universe_mode = str(config.get("symbolsUniverse") or "DISCOVER_TOP50").upper()
    if universe_mode == "FIXED_LIST":
        fixed = config.get("fixedSymbols") or []
        return [str(item).upper() for item in fixed if str(item).upper().endswith("USDT")]
    return [str(row.get("symbol") or "").upper() for row in discover_rows if row.get("symbol")]


def _entry_filter(
    config: dict[str, Any],
    discover_rows: list[dict[str, Any]],
    market_rows: list[dict[str, Any]],
    quotes_rows: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    entry = config.get("entry") or {}
    guards = config.get("guards") or {}
    universe = set(_load_universe(config, discover_rows))
    min_score = _safe_float(entry.get("minScore"), 70)
    min_potential = _safe_float(entry.get("minPotentialScore"), 75)
    require_regime = str(entry.get("requireRegime") or "Alta")
    require_signal = str(entry.get("requireSignal") or "BUY").upper()
    min_quote_volume = _safe_float(entry.get("minQuoteVolume24hUSDT"), 5_000_000)
    max_atr_pct = _safe_float(guards.get("maxAtrPct"), 6.0)
    regex_text = str(guards.get("symbolRegex") or r"^[A-Z0-9]{3,12}USDT$")

    market_map = {str(row.get("symbol") or "").upper(): row for row in market_rows}
    discover_map = {str(row.get("symbol") or "").upper(): row for row in discover_rows}
    quotes_map = {str(row.get("symbol") or "").upper(): row for row in quotes_rows}

    candidates: list[dict[str, Any]] = []
    for symbol in universe:
        if not _valid_symbol(symbol, regex_text):
            continue
        market = market_map.get(symbol) or {}
        discover = discover_map.get(symbol) or {}
        quote = quotes_map.get(symbol) or {}

        score = _safe_float(market.get("score"))
        potential = _safe_float(discover.get("potentialScore"))
        regime = str(market.get("regime") or "Neutro")
        signal = str(market.get("signal") or "WAIT").upper()
        atr = _safe_float(market.get("atr14"))
        price = _safe_float(quote.get("price") or market.get("price_close"), 0)
        atr_pct = (atr / price * 100.0) if price > 0 else 999
        quote_volume = _safe_float(quote.get("volume24h"), 0)

        if score < min_score:
            continue
        if potential < min_potential:
            continue
        if regime != require_regime:
            continue
        if signal != require_signal:
            continue
        if atr_pct > max_atr_pct:
            continue
        if quote_volume < min_quote_volume:
            continue

        candidates.append(
            {
                "symbol": symbol,
                "score": score,
                "potentialScore": potential,
                "regime": regime,
                "signal": signal,
                "atr": atr,
                "atrPct": atr_pct,
                "price": price,
                "quoteVolume": quote_volume,
            }
        )

    candidates.sort(key=lambda row: (row["potentialScore"], row["score"], row["quoteVolume"]), reverse=True)
    return candidates


def _symbol_filters(exchange_info: dict[str, Any], symbol: str) -> tuple[float, float]:
    symbols = exchange_info.get("symbols") or []
    current = None
    for item in symbols:
        if str(item.get("symbol") or "").upper() == symbol:
            current = item
            break
    if not current:
        return 0.000001, 10.0

    min_notional = 10.0
    step_size = 0.000001
    for f in current.get("filters") or []:
        f_type = str(f.get("filterType") or "")
        if f_type in {"NOTIONAL", "MIN_NOTIONAL"}:
            min_notional = _safe_float(f.get("minNotional"), min_notional)
        if f_type == "LOT_SIZE":
            step_size = _safe_float(f.get("stepSize"), step_size)
    return step_size, min_notional


def _round_step(quantity: float, step: float) -> float:
    if step <= 0:
        return quantity
    precision = max(0, int(round(-math.log10(step), 0))) if step < 1 else 0
    qty = math.floor(quantity / step) * step
    return round(max(0.0, qty), precision)


def _mark_fail_safe(
    fs: FirestoreNotificationStorage,
    alerts: dict[str, Any],
    owner_uid: str,
    reason: str,
) -> None:
    fs.disable_trading(reason)
    _notify(
        fs,
        alerts,
        owner_uid,
        event_type="FAILSAFE",
        priority="P0",
        title="TRADING DESARMADO",
        message=reason,
        direction="SYSTEM",
        payload={"severity": "high", "action_items": "Verificar configuração/secrets e rearmar manualmente"},
    )
    email = get_secret("ALERT_OWNER_EMAIL")
    webhook_url = get_secret("APP_SCRIPT_WEBHOOK_URL")
    token = get_secret("ALERT_WEBHOOK_TOKEN")
    alerter = AppScriptEmailAlerter(webhook_url, token)
    if bool((alerts or {}).get("emailEnabled", True)) and email:
        try:
            alerter.send_email(email, "[BotBit] Trading desarmado", reason, {"reason": reason})
        except Exception:
            pass


def _paper_open_position(
    fs: FirestoreNotificationStorage,
    bq: BigQueryStorage,
    run_id: str,
    candidate: dict[str, Any],
    config: dict[str, Any],
    state: dict[str, Any],
) -> tuple[bool, str, dict[str, Any]]:
    symbol = candidate["symbol"]
    price = max(_safe_float(candidate.get("price"), 0), 0.0000001)
    equity = _safe_float(state.get("equityUSDT"), _safe_float(config.get("paperInitialCashUSDT"), 1000))
    cash = _safe_float(state.get("cashUSDT"), equity)

    max_notional_pct = _safe_float(config.get("maxNotionalPerTradePct"), 35) / 100.0
    risk_pct = _safe_float(config.get("riskPerTradePct"), 0.75) / 100.0
    min_notional = _safe_float(config.get("minNotionalUSDT"), 10)

    notional = min(equity * max_notional_pct, cash * 0.98)
    notional = max(0.0, notional)
    if notional < min_notional:
        return False, "min_notional", state

    atr = max(_safe_float(candidate.get("atr"), 0), price * 0.003)
    stop_mult = _safe_float(((config.get("exit") or {}).get("stopAtrMult")), 1.5)
    take_mult = _safe_float(((config.get("exit") or {}).get("takeAtrMult")), 2.5)
    stop_price = max(0.0, price - stop_mult * atr)
    take_price = max(price, price + take_mult * atr)

    qty = notional / price
    qty = _round_step(qty, 0.000001)
    if qty <= 0:
        return False, "qty_zero", state

    order_id = _dedupe_order_id(run_id, symbol, "BUY", "PAPER")
    trade_cost = qty * price
    state["cashUSDT"] = max(0.0, cash - trade_cost)

    position = {
        "symbol": symbol,
        "mode": "PAPER",
        "status": "OPEN",
        "qty": qty,
        "avgEntry": price,
        "lastPrice": price,
        "allocationPct": (trade_cost / max(equity, 1e-9)) * 100.0,
        "pnlUnrealized": 0.0,
        "stopPrice": stop_price,
        "takePrice": take_price,
        "ocoStatus": "SIMULATED",
        "initialRisk": max(price - stop_price, 0.0000001),
        "openedAt": _now(),
        "updatedAt": _now(),
    }
    fs.upsert_trading_position(symbol, position)

    order_row = {
        "run_id": run_id,
        "symbol": symbol,
        "side": "BUY",
        "order_type": "LIMIT",
        "mode": "PAPER",
        "status": "FILLED",
        "error": "",
        "created_at": _now().isoformat(),
    }
    fs.upsert_trading_order(order_id, {"orderId": order_id, **order_row})
    bq.insert_trade_orders([order_row])
    return True, order_id, state


def _close_position_paper(
    fs: FirestoreNotificationStorage,
    bq: BigQueryStorage,
    run_id: str,
    position: dict[str, Any],
    last_price: float,
    reason: str,
    state: dict[str, Any],
) -> None:
    symbol = str(position.get("symbol") or "")
    qty = _safe_float(position.get("qty"), 0)
    avg_entry = _safe_float(position.get("avgEntry"), 0)
    pnl = (last_price - avg_entry) * qty
    cash = _safe_float(state.get("cashUSDT"), 0)
    state["cashUSDT"] = cash + qty * last_price
    state["realizedPnlUSDT"] = _safe_float(state.get("realizedPnlUSDT"), 0) + pnl

    fs.upsert_trading_position(
        symbol,
        {
            "status": "CLOSED",
            "closedAt": _now(),
            "closeReason": reason,
            "lastPrice": last_price,
            "pnlRealized": pnl,
        },
    )
    row = {
        "run_id": run_id,
        "symbol": symbol,
        "side": "SELL",
        "order_type": "MARKET",
        "mode": "PAPER",
        "status": "FILLED",
        "error": reason,
        "created_at": _now().isoformat(),
    }
    bq.insert_trade_orders([row])


def _live_gate_ok(config: dict[str, Any]) -> tuple[bool, str]:
    """Triple gate for LIVE trading. ALL conditions must pass.

    Gate 1 — Firestore config (UI-side confirmation):
      liveGuard.liveConfirmed == True AND typedText matches doubleConfirmText
      AND liveConfirmedAt is set AND cooldown has elapsed.

    Gate 2 — Feature flag secret (infra-side, must be set via gcloud):
      Secret LIVE_TRADING_ENABLED == "true"

    Gate 3 — Arming secret (hard requirement, set ONLY when intentionally arming):
      Secret LIVE_TRADING_ARMED == "YES_I_KNOW_WHAT_IM_DOING"
      Must be EXPLICITLY set — omitted/empty/wrong always blocks LIVE.
    """
    # Gate 1A: Firestore UI confirmation
    guard = config.get("liveGuard") or {}
    if not bool(guard.get("liveConfirmed", False)):
        return False, "LIVE_NOT_CONFIRMED"

    confirm_text = str(guard.get("doubleConfirmText") or "LIVE").upper()
    typed = str(guard.get("typedText") or "").upper()
    if typed != confirm_text:
        return False, "LIVE_CONFIRM_TEXT_INVALID"

    # Gate 1B: Confirmation timestamp + cooldown
    confirmed_at = _parse_ts(guard.get("liveConfirmedAt"))
    if not confirmed_at:
        return False, "LIVE_CONFIRM_TIME_MISSING"

    cooldown_minutes = _safe_int(guard.get("cooldownMinutes"), 1)  # default 1 min
    if _now() < confirmed_at + timedelta(minutes=max(1, cooldown_minutes)):
        return False, "LIVE_COOLDOWN_PENDING"

    # Gate 2: Feature flag secret (gcloud secrets must be set explicitly)
    feature_flag = str(get_secret("LIVE_TRADING_ENABLED") or "false").lower() == "true"
    if not feature_flag:
        return False, "LIVE_FEATURE_FLAG_OFF"

    # Gate 3: Hard arming secret — only opens when exact phrase is set
    armed_secret = str(get_secret("LIVE_TRADING_ARMED") or "").strip()
    if armed_secret != "YES_I_KNOW_WHAT_IM_DOING":
        return False, "LIVE_NOT_ARMED"

    return True, "OK"


def run_trade_pipeline() -> dict[str, Any]:
    settings = get_settings()
    fs = FirestoreNotificationStorage(settings.gcp_project_id)
    owner_uid = get_secret("FIREBASE_OWNER_UID")
    fs.ensure_trading_templates(owner_uid)

    bq = BigQueryStorage(settings.gcp_project_id, settings.bq_dataset, settings.bq_location)
    bq.ensure_dataset_and_tables()

    run_id = datetime.utcnow().strftime("trade-%Y%m%dT%H%M%S")
    lock_owner = f"{run_id}-{abs(hash(run_id))%1000}"
    locked, lock_data = fs.acquire_trade_lock(lock_owner, ttl_seconds=240)
    if not locked:
        reason = "LOCK_ACTIVE"
        fs.upsert_trading_state({"lastRunAt": _now(), "lastError": reason, "enabled": False})
        bq.insert_trade_run(
            {
                "run_id": run_id,
                "mode": "N/A",
                "enabled": False,
                "executed": 0,
                "skipped": 0,
                "candidates": 0,
                "error": reason,
                "created_at": _now().isoformat(),
            }
        )
        return {"ok": False, "runId": run_id, "error": reason, "lock": lock_data}

    try:
        config = fs.get_trading_config()
        alerts = fs.get_alerts_config()
        log_event(logger, "trade_config_loaded", source=config.get("_configSource", "unknown"))

        enabled = bool(config.get("enabled", False))
        mode = str(config.get("mode") or "PAPER").upper()
        if mode not in {"PAPER", "TESTNET", "LIVE", "LIVE_VALIDATE_ONLY"}:
            mode = "PAPER"

        discover_rows = fs.list_discovery_latest(limit_size=100)
        market_rows = fs.list_market_latest(limit_size=200)
        quotes_rows = fs.list_quotes(limit_size=300)
        state = fs.get_trading_state()

        if not enabled:
            result = {
                "ok": True,
                "runId": run_id,
                "mode": mode,
                "enabled": False,
                "executed": 0,
                "skipped": 0,
                "candidates": 0,
                "reason": "disabled",
            }
            fs.upsert_trading_state({
                "enabled": False,
                "mode": mode,
                "lastRunAt": _now(),
                "lastSummary": "skipped=0 reason=disabled",
                "lastError": "",
                "openPositionsCount": len(fs.list_trading_positions(status="OPEN", limit_size=200)),
            })
            bq.insert_trade_run(
                {
                    "run_id": run_id,
                    "mode": mode,
                    "enabled": False,
                    "executed": 0,
                    "skipped": 0,
                    "candidates": 0,
                    "error": "",
                    "created_at": _now().isoformat(),
                }
            )
            log_event(logger, "trade_run_skipped", enabled=False, skipped=0, reason="disabled")
            return result

        if mode == "LIVE":
            gate_ok, gate_reason = _live_gate_ok(config)
            if not gate_ok:
                _mark_fail_safe(fs, alerts, owner_uid, gate_reason)
                bq.insert_trade_run(
                    {
                        "run_id": run_id,
                        "mode": mode,
                        "enabled": False,
                        "executed": 0,
                        "skipped": 0,
                        "candidates": 0,
                        "error": gate_reason,
                        "created_at": _now().isoformat(),
                    }
                )
                return {"ok": False, "runId": run_id, "error": gate_reason, "mode": mode}

        api_key = get_secret("BINANCE_API_KEY")
        api_secret = get_secret("BINANCE_API_SECRET")
        if mode == "TESTNET":
            api_key = get_secret("BINANCE_TESTNET_API_KEY") or api_key
            api_secret = get_secret("BINANCE_TESTNET_API_SECRET") or api_secret

        if mode in {"TESTNET", "LIVE", "LIVE_VALIDATE_ONLY"} and (not api_key or not api_secret):
            reason = "MISSING_BINANCE_KEYS"
            _mark_fail_safe(fs, alerts, owner_uid, reason)
            bq.insert_trade_run(
                {
                    "run_id": run_id,
                    "mode": mode,
                    "enabled": False,
                    "executed": 0,
                    "skipped": 0,
                    "candidates": 0,
                    "error": reason,
                    "created_at": _now().isoformat(),
                }
            )
            return {"ok": False, "runId": run_id, "error": reason, "mode": mode}

        # Log resolved execution context (NEVER log values of secrets)
        secret_origin = "TESTNET" if mode == "TESTNET" else "LIVE"
        effective_base_url = BinanceTradeClient.TESTNET_BASE_URL if mode == "TESTNET" else BinanceTradeClient.LIVE_BASE_URL
        log_event(
            logger,
            "trade_mode_resolved",
            run_id=run_id,
            mode=mode,
            base_url=effective_base_url,
            secret_origin=secret_origin,
            api_key_present=bool(api_key),
            api_secret_present=bool(api_secret),
        )

        if mode == "LIVE_VALIDATE_ONLY":
            try:
                client = BinanceTradeClient(api_key=api_key, api_secret=api_secret, mode="LIVE")
                account = client.get_account()
                can_trade = bool(account.get("canTrade", False))
                balances = account.get("balances") if isinstance(account.get("balances"), list) else []
                result = {
                    "ok": True,
                    "runId": run_id,
                    "mode": mode,
                    "enabled": True,
                    "executed": 0,
                    "skipped": 0,
                    "candidates": 0,
                    "reason": "validate_only",
                    "canTrade": can_trade,
                    "balancesCount": len(balances),
                }
                fs.upsert_trading_state(
                    {
                        "enabled": True,
                        "mode": mode,
                        "lastRunAt": _now(),
                        "lastSummary": "validate_only",
                        "lastError": "" if can_trade else "CAN_TRADE_FALSE",
                        "openPositionsCount": len(fs.list_trading_positions(status="OPEN", limit_size=200)),
                    }
                )
                bq.insert_trade_run(
                    {
                        "run_id": run_id,
                        "mode": mode,
                        "enabled": True,
                        "executed": 0,
                        "skipped": 0,
                        "candidates": 0,
                        "error": "validate_only" if can_trade else "validate_only_can_trade_false",
                        "created_at": _now().isoformat(),
                    }
                )
                return result
            except Exception as exc:
                bq.insert_trade_run(
                    {
                        "run_id": run_id,
                        "mode": mode,
                        "enabled": True,
                        "executed": 0,
                        "skipped": 0,
                        "candidates": 0,
                        "error": f"validate_only_failed:{str(exc)[:120]}",
                        "created_at": _now().isoformat(),
                    }
                )
                return {
                    "ok": False,
                    "runId": run_id,
                    "mode": mode,
                    "enabled": True,
                    "executed": 0,
                    "skipped": 0,
                    "candidates": 0,
                    "reason": "validate_only",
                    "error": str(exc),
                }

        candidates = _entry_filter(config, discover_rows, market_rows, quotes_rows)
        open_positions = fs.list_trading_positions(status="OPEN", limit_size=200)
        quote_map = {str(row.get("symbol") or "").upper(): row for row in quotes_rows}
        market_map = {str(row.get("symbol") or "").upper(): row for row in market_rows}
        exit_cfg = config.get("exit") or {}
        entry_cfg = config.get("entry") or {}

        executed = 0
        skipped = 0
        errors: list[dict[str, Any]] = []

        for position in open_positions:
            symbol = str(position.get("symbol") or "")
            quote = quote_map.get(symbol) or {}
            market = market_map.get(symbol) or {}
            last_price = _safe_float(quote.get("price") or position.get("lastPrice"), 0)
            if last_price <= 0:
                continue

            avg_entry = _safe_float(position.get("avgEntry"), 0)
            stop_price = _safe_float(position.get("stopPrice"), 0)
            take_price = _safe_float(position.get("takePrice"), 0)
            initial_risk = max(_safe_float(position.get("initialRisk"), avg_entry - stop_price), 1e-9)
            atr = _safe_float(market.get("atr14"), initial_risk)
            opened_at = _parse_ts(position.get("openedAt")) or _now()
            hours_open = (_now() - opened_at).total_seconds() / 3600.0

            regime = str(market.get("regime") or "")
            signal = str(market.get("signal") or "WAIT").upper()
            reason = ""

            if last_price >= take_price > 0:
                reason = "take_hit"
            elif 0 < stop_price >= last_price:
                reason = "stop_hit"
            elif regime == "Baixa" or signal == "AVOID":
                reason = "regime_or_signal_exit"
            elif hours_open >= _safe_float(exit_cfg.get("timeStopHours"), 48):
                reason = "time_stop"

            rr = (last_price - avg_entry) / initial_risk if initial_risk > 0 else 0
            if rr >= _safe_float(exit_cfg.get("moveStopToBreakevenAtR"), 1.0):
                stop_price = max(stop_price, avg_entry)
            trail_mult = _safe_float(exit_cfg.get("trailAtrMult"), 1.2)
            trailing_stop = max(avg_entry, last_price - atr * trail_mult)
            if trailing_stop > stop_price:
                stop_price = trailing_stop

            fs.upsert_trading_position(symbol, {"lastPrice": last_price, "pnlUnrealized": (last_price - avg_entry) * _safe_float(position.get("qty"), 0), "stopPrice": stop_price})

            if not reason:
                continue

            if mode == "PAPER":
                _close_position_paper(fs, bq, run_id, position, last_price, reason, state)
                event_type = "STOP_HIT" if reason == "stop_hit" else ("TAKE_HIT" if reason == "take_hit" else "POSITION_EXIT")
                _notify(
                    fs,
                    alerts,
                    owner_uid,
                    event_type=event_type,
                    priority="P1",
                    title=f"Saída {symbol}",
                    message=f"{symbol} fechado por {reason}",
                    symbol=symbol,
                    direction="SELL",
                    payload={"reason": reason, "lastPrice": last_price, "action_items": "Revisar regras de saída"},
                )
            else:
                # SELL — always write intent first (audit + idempotency)
                sell_intent_id = _dedupe_order_id(run_id, symbol, "SELL", mode)
                fs.write_trade_intent(sell_intent_id, {
                    "runId": run_id,
                    "symbol": symbol,
                    "side": "SELL",
                    "orderType": "MARKET",
                    "quantity": _safe_float(position.get("qty"), 0),
                    "price": last_price,
                    "mode": mode,
                    "reason": reason,
                })
                try:
                    client = BinanceTradeClient(api_key=api_key, api_secret=api_secret, mode=mode)
                    sell = client.place_order(symbol=symbol, side="SELL", order_type="MARKET", quantity=_safe_float(position.get("qty"), 0), newClientOrderId=sell_intent_id)
                    sell_order_id = str(sell.get("orderId") or sell_intent_id)
                    sell_status = str(sell.get("status") or "SENT")
                    fs.update_trade_intent(sell_intent_id, {"status": "SUBMITTED", "orderId": sell_order_id, "orderStatus": sell_status})
                    fs.upsert_trading_order(sell_order_id, {"runId": run_id, "symbol": symbol, "side": "SELL", "status": sell_status, "mode": mode, "price": _safe_float(sell.get("price"), last_price), "qty": _safe_float(position.get("qty"), 0), "reason": reason})
                    fs.upsert_trading_position(symbol, {"status": "CLOSED", "closedAt": _now(), "closeReason": reason, "lastPrice": last_price})
                    fs.update_trade_intent(sell_intent_id, {"status": "FILLED"})
                    event_type = "STOP_HIT" if reason == "stop_hit" else ("TAKE_HIT" if reason == "take_hit" else "POSITION_EXIT")
                    _notify(
                        fs,
                        alerts,
                        owner_uid,
                        event_type=event_type,
                        priority="P1",
                        title=f"Saída {symbol}",
                        message=f"{symbol} fechado por {reason}",
                        symbol=symbol,
                        direction="SELL",
                        payload={"reason": reason, "lastPrice": last_price, "mode": mode, "orderId": sell_order_id, "action_items": "Checar motivo da saída"},
                    )
                except Exception as exc:
                    fs.update_trade_intent(sell_intent_id, {"status": "REJECTED", "error": str(exc)})
                    errors.append({"symbol": symbol, "error": str(exc)})
                    if "451" in str(exc) or (isinstance(exc, _requests.HTTPError) and getattr(getattr(exc, "response", None), "status_code", 0) == 451):
                        _mark_fail_safe(fs, alerts, owner_uid, "BINANCE_451")
                    else:
                        _mark_fail_safe(fs, alerts, owner_uid, f"EXIT_FAIL_{symbol}")

        open_positions = fs.list_trading_positions(status="OPEN", limit_size=200)
        max_open = _safe_int(config.get("maxOpenPositions"), 2)
        capacity = max(0, max_open - len(open_positions))
        if capacity <= 0:
            skipped += len(candidates)
            candidates = []

        date_key = _now().strftime("%Y-%m-%d")
        trades_today = fs.get_daily_trade_counter(date_key)
        max_per_day = _safe_int(config.get("maxTradesPerDay"), 2)
        remaining_daily = max(0, max_per_day - trades_today)
        if remaining_daily <= 0:
            skipped += len(candidates)
            candidates = []

        candidates = candidates[: min(capacity, remaining_daily)]

        exchange_info = BinanceClient().fetch_exchange_info()

        for candidate in candidates:
            symbol = candidate["symbol"]
            if any(str(pos.get("symbol") or "") == symbol for pos in open_positions):
                skipped += 1
                continue

            cooldown_hours = _safe_float(config.get("cooldownHours"), 24)
            existing = fs.client.collection("trading_positions").document(symbol).get()
            if existing.exists:
                data = existing.to_dict() or {}
                closed_at = _parse_ts(data.get("closedAt"))
                close_reason = str(data.get("closeReason") or "")
                if close_reason.startswith("stop") and closed_at and _now() < closed_at + timedelta(hours=cooldown_hours):
                    skipped += 1
                    continue

            try:
                step, min_notional_exchange = _symbol_filters(exchange_info, symbol)
                min_notional_cfg = _safe_float(config.get("minNotionalUSDT"), 10)
                min_notional = max(min_notional_cfg, min_notional_exchange)

                price = max(_safe_float(candidate.get("price"), 0), 0.0000001)
                equity = _safe_float(state.get("equityUSDT"), _safe_float(config.get("paperInitialCashUSDT"), 1000))
                cash = _safe_float(state.get("cashUSDT"), equity)
                max_notional_pct = _safe_float(config.get("maxNotionalPerTradePct"), 35) / 100.0
                notional = min(equity * max_notional_pct, cash * 0.98)
                if notional < min_notional:
                    skipped += 1
                    continue

                qty = _round_step(notional / price, step)
                if qty <= 0:
                    skipped += 1
                    continue

                if mode == "PAPER":
                    ok, _, state = _paper_open_position(fs, bq, run_id, candidate, config, state)
                    if ok:
                        executed += 1
                        fs.increment_daily_trade_counter(date_key, 1)
                        _notify(
                            fs,
                            alerts,
                            owner_uid,
                            event_type="TRADE_EXECUTED",
                            priority="P1",
                            title="PAPER BUY",
                            message=f"{symbol} executado em PAPER",
                            symbol=symbol,
                            direction="BUY",
                            payload={"symbol": symbol, "mode": mode, "action_items": "Acompanhar evolução da posição"},
                        )
                    else:
                        skipped += 1
                    continue

                # BUY — write intent BEFORE placing order (audit + idempotency)
                buy_intent_id = _dedupe_order_id(run_id, symbol, "BUY", mode)
                atr_i = max(_safe_float(candidate.get("atr"), 0), price * 0.003)
                stop_i = max(0.0, price - _safe_float(exit_cfg.get("stopAtrMult"), 1.5) * atr_i)
                take_i = max(price, price + _safe_float(exit_cfg.get("takeAtrMult"), 2.5) * atr_i)
                fs.write_trade_intent(buy_intent_id, {
                    "runId": run_id,
                    "symbol": symbol,
                    "side": "BUY",
                    "orderType": "LIMIT",
                    "quantity": qty,
                    "price": price,
                    "stopPrice": stop_i,
                    "takePrice": take_i,
                    "mode": mode,
                    "score": candidate.get("score"),
                    "regime": candidate.get("regime"),
                    "signal": candidate.get("signal"),
                })
                try:
                    client = BinanceTradeClient(api_key=api_key, api_secret=api_secret, mode=mode)
                    order = client.place_order(
                        symbol=symbol,
                        side="BUY",
                        order_type="LIMIT",
                        quantity=qty,
                        price=round(price, 8),
                        timeInForce="GTC",
                        newClientOrderId=buy_intent_id,
                    )

                    order_id = str(order.get("orderId") or buy_intent_id)
                    status = str(order.get("status") or "NEW")
                    log_event(logger, "order_submitted", run_id=run_id, symbol=symbol, mode=mode, order_id=order_id, status=status)
                    fs.update_trade_intent(buy_intent_id, {"status": "SUBMITTED", "orderId": order_id, "orderStatus": status})
                    fs.upsert_trading_order(order_id, {"runId": run_id, "symbol": symbol, "side": "BUY", "status": status, "mode": mode, "price": price, "qty": qty})

                    atr = max(_safe_float(candidate.get("atr"), 0), price * 0.003)
                    stop_price = max(0.0, price - _safe_float(exit_cfg.get("stopAtrMult"), 1.5) * atr)
                    take_price = max(price, price + _safe_float(exit_cfg.get("takeAtrMult"), 2.5) * atr)
                    stop_limit = max(0.0, stop_price * 0.999)

                    oco_status = "DISABLED"
                    if bool(exit_cfg.get("useOCO", True)):
                        try:
                            oco = client.place_oco_order(
                                symbol=symbol,
                                side="SELL",
                                quantity=qty,
                                price=round(take_price, 8),
                                stop_price=round(stop_price, 8),
                                stop_limit_price=round(stop_limit, 8),
                                listClientOrderId=_dedupe_order_id(run_id, symbol, "OCO", mode),
                            )
                            oco_status = "OK" if oco else "UNKNOWN"
                            oco_list_id = str((oco or {}).get("orderListId", ""))
                            fs.update_trade_intent(buy_intent_id, {"status": "FILL_PENDING", "ocoStatus": oco_status, "ocoOrderListId": oco_list_id})
                        except Exception as exc:
                            fs.update_trade_intent(buy_intent_id, {"status": "OCO_FAILED", "error": f"OCO_FAIL: {exc}"})
                            errors.append({"symbol": symbol, "error": f"OCO_FAIL: {exc}"})
                            _mark_fail_safe(fs, alerts, owner_uid, f"OCO_FAIL_{symbol}")
                            return {
                                "ok": False,
                                "runId": run_id,
                                "mode": mode,
                                "enabled": False,
                                "executed": executed,
                                "skipped": skipped,
                                "candidates": len(candidates),
                                "errors": errors[:5],
                                "error": "OCO_FAILSAFE_TRIGGERED",
                            }

                    fs.upsert_trading_position(
                        symbol,
                        {
                            "intentId": buy_intent_id,
                            "mode": mode,
                            "status": "OPEN",
                            "qty": qty,
                            "avgEntry": price,
                            "lastPrice": price,
                            "pnlUnrealized": 0.0,
                            "allocationPct": (notional / max(equity, 1e-9)) * 100.0,
                            "stopPrice": stop_price,
                            "takePrice": take_price,
                            "ocoStatus": oco_status,
                            "openedAt": _now(),
                            "initialRisk": max(price - stop_price, 1e-9),
                        },
                    )

                    bq.insert_trade_orders(
                        [
                            {
                                "run_id": run_id,
                                "symbol": symbol,
                                "side": "BUY",
                                "order_type": "LIMIT",
                                "mode": mode,
                                "status": status,
                                "error": "",
                                "created_at": _now().isoformat(),
                            }
                        ]
                    )
                    executed += 1
                    fs.increment_daily_trade_counter(date_key, 1)
                    _notify(
                        fs,
                        alerts,
                        owner_uid,
                        event_type="TRADE_EXECUTED",
                        priority="P1",
                        title="TRADE EXECUTADO",
                        message=f"{symbol} BUY {mode}",
                        symbol=symbol,
                        direction="BUY",
                        payload={"symbol": symbol, "mode": mode, "orderId": order_id, "intentId": buy_intent_id, "action_items": "Monitorar stop/take"},
                    )
                except Exception as exc:
                    if not str(exc).startswith("OCO_FAIL"):
                        fs.update_trade_intent(buy_intent_id, {"status": "REJECTED", "error": str(exc)})
                    raise
            except Exception as exc:
                skipped += 1
                err_str = str(exc)
                errors.append({"symbol": symbol, "error": err_str})
                is_451 = "451" in err_str or (
                    isinstance(exc, _requests.HTTPError)
                    and getattr(getattr(exc, "response", None), "status_code", 0) == 451
                )
                if is_451:
                    _mark_fail_safe(fs, alerts, owner_uid, "BINANCE_451")
                    bq.insert_trade_run(
                        {
                            "run_id": run_id,
                            "mode": mode,
                            "enabled": False,
                            "executed": executed,
                            "skipped": skipped,
                            "candidates": len(candidates),
                            "error": "BINANCE_451",
                            "created_at": _now().isoformat(),
                        }
                    )
                    return {
                        "ok": False,
                        "runId": run_id,
                        "mode": mode,
                        "enabled": False,
                        "executed": executed,
                        "skipped": skipped,
                        "candidates": len(candidates),
                        "errors": errors[:5],
                        "error": "BINANCE_451",
                    }

        open_positions = fs.list_trading_positions(status="OPEN", limit_size=300)
        position_rows = []
        exposure = 0.0
        unrealized = 0.0
        for position in open_positions:
            symbol = str(position.get("symbol") or "")
            last_price = _safe_float((quote_map.get(symbol) or {}).get("price"), _safe_float(position.get("lastPrice"), 0))
            qty = _safe_float(position.get("qty"), 0)
            entry = _safe_float(position.get("avgEntry"), 0)
            pnl = (last_price - entry) * qty
            unrealized += pnl
            exposure += max(0.0, qty * last_price)
            position_rows.append(
                {
                    "symbol": symbol,
                    "entry_price": entry,
                    "quantity": qty,
                    "stop_price": _safe_float(position.get("stopPrice"), 0),
                    "take_price": _safe_float(position.get("takePrice"), 0),
                    "status": str(position.get("status") or "OPEN"),
                    "updated_at": _now().isoformat(),
                }
            )
        bq.insert_trade_positions(position_rows)

        state_cash = _safe_float(state.get("cashUSDT"), _safe_float(config.get("paperInitialCashUSDT"), 1000))
        equity = state_cash + exposure + unrealized

        max_daily_loss_pct = _safe_float(config.get("maxDailyLossPct"), 2.5)
        daily_pnl = _safe_float(state.get("realizedPnlUSDT"), 0) + unrealized
        daily_loss_pct = abs(min(0.0, daily_pnl)) / max(equity, 1e-9) * 100.0
        if daily_loss_pct >= max_daily_loss_pct:
            _mark_fail_safe(fs, alerts, owner_uid, "DAILY_LOSS_CUT")

        summary = f"executed={executed} skipped={skipped} candidates={len(candidates)} mode={mode}"
        fs.upsert_trading_state(
            {
                "enabled": bool(config.get("enabled", False)),
                "mode": mode,
                "lastRunAt": _now(),
                "lastSummary": summary,
                "lastError": errors[0]["error"] if errors else "",
                "openPositionsCount": len(open_positions),
                "cashUSDT": round(state_cash, 6),
                "equityUSDT": round(equity, 6),
                "exposureUSDT": round(exposure, 6),
                "dailyPnlUSDT": round(daily_pnl, 6),
            }
        )

        bq.insert_trade_run(
            {
                "run_id": run_id,
                "mode": mode,
                "enabled": bool(config.get("enabled", False)),
                "executed": executed,
                "skipped": skipped,
                "candidates": len(candidates),
                "error": errors[0]["error"] if errors else "",
                "created_at": _now().isoformat(),
            }
        )

        return {
            "ok": len(errors) == 0,
            "runId": run_id,
            "mode": mode,
            "enabled": bool(config.get("enabled", False)),
            "executed": executed,
            "skipped": skipped,
            "candidates": len(candidates),
            "errors": errors[:5],
            "configSource": config.get("_configSource", "unknown"),
        }
    finally:
        fs.release_trade_lock(lock_owner)

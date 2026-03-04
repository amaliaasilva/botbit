from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import requests

from app.auth import AuthContext, require_auth
from app.config import get_logger, get_secret, get_settings, log_event
from app.cron import _build_rows_btc, run_pipeline, run_quotes_pipeline, run_score_pipeline
from app.discover import get_discover_latest, run_discover_pipeline
from app.indicators import enrich_btc_features
from app.sources.binance import BinanceClient
from app.sources.binance_trade import BinanceTradeClient
from app.storage.bigquery_client import BigQueryStorage
from app.storage.firestore_client import FirestoreNotificationStorage
from app.trading import run_trade_pipeline, _live_gate_ok, _parse_ts, _now

app = FastAPI(title="Market AI Scoring", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://botbit.web.app",
        "https://botbit-489114.web.app",
        "http://localhost:3000",
        "http://localhost:3001",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

logger = get_logger(__name__)


def _storage() -> BigQueryStorage:
    settings = get_settings()
    storage = BigQueryStorage(settings.gcp_project_id, settings.bq_dataset, settings.bq_location)
    storage.ensure_dataset_and_tables()
    return storage


def _firestore() -> FirestoreNotificationStorage | None:
    settings = get_settings()
    if not settings.gcp_project_id:
        return None
    return FirestoreNotificationStorage(settings.gcp_project_id)


@app.get("/health")
def health() -> dict[str, Any]:
    fs = _firestore()
    score_status = fs.get_system_status("cron_score") if fs else None
    quotes_status = fs.get_system_status("cron_quotes") if fs else None
    return {
        "status": "ok",
        "last_cron_ok_at": (score_status or {}).get("last_cron_ok_at"),
        "last_cron_symbols_ok": (score_status or {}).get("symbols_ok", 0),
        "last_cron_symbols_failed": (score_status or {}).get("symbols_failed", []),
        "quotes_last_ok_at": (quotes_status or {}).get("last_cron_ok_at"),
    }


@app.get("/score/btc")
def score_btc() -> dict[str, Any]:
    settings = get_settings()
    storage = _storage()

    latest = storage.get_latest_feature("BTC", settings.btc_symbol)
    if latest:
        return {"source": "bigquery", "data": latest}

    binance = BinanceClient()
    btc_df = binance.fetch_klines(settings.btc_symbol, settings.btc_interval, 1000)
    features = enrich_btc_features(btc_df)
    rows = _build_rows_btc(settings.btc_symbol, features)
    if not rows:
        raise HTTPException(status_code=500, detail="Não foi possível calcular score BTC")

    latest_row = rows[-1]
    storage.insert_feature_rows([latest_row])
    return {"source": "on-demand", "data": latest_row}


@app.get("/public/score/btc")
def public_score_btc() -> dict[str, Any]:
    return score_btc()


@app.get("/score/b3/{ticker}")
def score_b3(ticker: str) -> dict[str, Any]:
    raise HTTPException(status_code=410, detail="B3 desativado nesta versão (Binance-only)")


@app.get("/public/score/b3/{ticker}")
def public_score_b3(ticker: str) -> dict[str, Any]:
    raise HTTPException(status_code=410, detail="B3 desativado nesta versão (Binance-only)")


@app.get("/binance/time")
def binance_time() -> dict[str, Any]:
    client = BinanceClient()
    return {"serverTime": client.fetch_server_time()}


@app.post("/cron/discover")
def cron_discover() -> dict[str, Any]:
    started_at = datetime.utcnow().isoformat()
    result = run_discover_pipeline()
    log_event(logger, "cron_discover_finished", started_at=started_at, **result)
    return result


@app.get("/public/discover")
def public_discover() -> dict[str, Any]:
    return {"items": get_discover_latest(20)}


@app.get("/public/discover/top")
def public_discover_top() -> dict[str, Any]:
    settings = get_settings()
    fs = FirestoreNotificationStorage(settings.gcp_project_id)
    return {"items": fs.list_discovery_latest(50)}


@app.get("/public/market/top")
def public_market_top() -> dict[str, Any]:
    settings = get_settings()
    fs = FirestoreNotificationStorage(settings.gcp_project_id)
    return {"items": fs.list_market_latest(50)}


@app.get("/public/quotes/top")
def public_quotes_top() -> dict[str, Any]:
    settings = get_settings()
    fs = FirestoreNotificationStorage(settings.gcp_project_id)
    return {"items": fs.list_quotes(50)}


@app.get("/api/discover")
def api_discover() -> dict[str, Any]:
    return {"items": get_discover_latest(50)}


@app.post("/cron/trade-run")
def cron_trade_run() -> dict[str, Any]:
    started_at = datetime.utcnow().isoformat()
    result = run_trade_pipeline()
    log_event(logger, "cron_trade_run_finished", started_at=started_at, **result)
    return result


@app.get("/trade/status")
def trade_status(auth: AuthContext = Depends(require_auth)) -> dict[str, Any]:
    settings = get_settings()
    fs = FirestoreNotificationStorage(settings.gcp_project_id)
    state = fs.get_trading_state()
    config = fs.get_trading_config()
    positions = fs.list_trading_positions(status="OPEN", limit_size=100)
    return {
        "uid": auth.uid,
        "enabled": bool(config.get("enabled", False)),
        "mode": str(config.get("mode") or "PAPER").upper(),
        "lastRunAt": state.get("lastRunAt"),
        "lastSummary": state.get("lastSummary", ""),
        "lastError": state.get("lastError", ""),
        "openPositionsCount": len(positions),
        "limits": {
            "maxOpenPositions": config.get("maxOpenPositions"),
            "maxTradesPerDay": config.get("maxTradesPerDay"),
            "maxDailyLossPct": config.get("maxDailyLossPct"),
            "riskPerTradePct": config.get("riskPerTradePct"),
            "maxNotionalPerTradePct": config.get("maxNotionalPerTradePct"),
            "cooldownHours": config.get("cooldownHours"),
        },
    }


@app.get("/portfolio")
def portfolio(auth: AuthContext = Depends(require_auth)) -> dict[str, Any]:
    settings = get_settings()
    fs = FirestoreNotificationStorage(settings.gcp_project_id)
    state = fs.get_trading_state()
    config = fs.get_trading_config()
    positions = fs.list_trading_positions(status="OPEN", limit_size=200)
    orders = fs.list_trading_orders(limit_size=200)

    mode = str(config.get("mode") or "PAPER").upper()
    cash_usdt = float(state.get("cashUSDT") or config.get("paperInitialCashUSDT") or 0)
    binance_balances: list[dict] = []
    if mode in {"TESTNET", "LIVE"}:
        api_key = get_secret("BINANCE_TESTNET_API_KEY") if mode == "TESTNET" else get_secret("BINANCE_API_KEY")
        api_secret = get_secret("BINANCE_TESTNET_API_SECRET") if mode == "TESTNET" else get_secret("BINANCE_API_SECRET")
        if api_key and api_secret:
            try:
                client = BinanceTradeClient(api_key=api_key, api_secret=api_secret, mode=mode)
                account = client.get_account()
                raw_balances = account.get("balances") or []
                usdt = next((item for item in raw_balances if str(item.get("asset") or "") == "USDT"), {})
                cash_usdt = float(usdt.get("free") or cash_usdt)
                # Keep non-zero balances for display
                binance_balances = [
                    {
                        "asset": str(b.get("asset") or ""),
                        "free": float(b.get("free") or 0),
                        "locked": float(b.get("locked") or 0),
                    }
                    for b in raw_balances
                    if float(b.get("free") or 0) > 0 or float(b.get("locked") or 0) > 0
                ]
            except Exception:
                pass

    exposure = 0.0
    pnl_unrealized = 0.0
    for position in positions:
        qty = float(position.get("qty") or 0)
        last_price = float(position.get("lastPrice") or 0)
        avg_entry = float(position.get("avgEntry") or 0)
        exposure += qty * last_price
        pnl_unrealized += (last_price - avg_entry) * qty

    equity = cash_usdt + exposure + pnl_unrealized
    return {
        "uid": auth.uid,
        "mode": mode,
        "enabled": bool(config.get("enabled", False)),
        "cashUSDT": round(cash_usdt, 6),
        "equityUSDT": round(equity, 6),
        "exposureUSDT": round(exposure, 6),
        "cashPct": round((cash_usdt / max(equity, 1e-9)) * 100.0, 3),
        "exposurePct": round((exposure / max(equity, 1e-9)) * 100.0, 3),
        "pnlUnrealizedUSDT": round(pnl_unrealized, 6),
        "binanceBalances": binance_balances,
        "positions": positions,
        "openOrders": [row for row in orders if str(row.get("status") or "").upper() in {"NEW", "OPEN", "PARTIALLY_FILLED"}],
        "lastRun": {
            "lastRunAt": state.get("lastRunAt"),
            "lastSummary": state.get("lastSummary", ""),
            "lastError": state.get("lastError", ""),
        },
    }


@app.get("/portfolio/balance")
def portfolio_balance(
    account: str = "live",  # "live" | "testnet"
    auth_ctx: AuthContext = Depends(require_auth),
) -> dict[str, Any]:
    """Lê saldo real da Binance (LIVE ou TESTNET) independente do modo de trading."""
    account = account.lower()
    if account not in {"live", "testnet"}:
        raise HTTPException(status_code=400, detail="account must be 'live' or 'testnet'")

    if account == "testnet":
        api_key = get_secret("BINANCE_TESTNET_API_KEY")
        api_secret = get_secret("BINANCE_TESTNET_API_SECRET")
        mode = "TESTNET"
    else:
        api_key = get_secret("BINANCE_API_KEY")
        api_secret = get_secret("BINANCE_API_SECRET")
        mode = "LIVE"

    if not api_key or not api_secret:
        raise HTTPException(status_code=503, detail=f"BINANCE_{mode.upper()}_API_KEY não configurada")

    try:
        client = BinanceTradeClient(api_key=api_key, api_secret=api_secret, mode=mode)
        acct = client.get_account()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Binance error: {str(exc)}")

    raw_balances = acct.get("balances") or []
    non_zero = [
        {
            "asset": str(b.get("asset") or ""),
            "free": float(b.get("free") or 0),
            "locked": float(b.get("locked") or 0),
            "total": float(b.get("free") or 0) + float(b.get("locked") or 0),
        }
        for b in raw_balances
        if float(b.get("free") or 0) > 0 or float(b.get("locked") or 0) > 0
    ]
    non_zero.sort(key=lambda x: x["total"], reverse=True)

    usdt = next((b for b in non_zero if b["asset"] == "USDT"), {"free": 0, "locked": 0, "total": 0})
    return {
        "account": mode,
        "canTrade": bool(acct.get("canTrade", False)),
        "balances": non_zero,
        "usdtFree": usdt["free"],
        "usdtLocked": usdt["locked"],
        "totalAssets": len(non_zero),
    }


@app.get("/trading/intents")
def get_trade_intents(
    limit: int = 100,
    status: str | None = None,
    auth_ctx: AuthContext = Depends(require_auth),
) -> dict[str, Any]:
    """Retorna trilha de auditoria das trade intents (PENDING/SUBMITTED/FILLED/REJECTED/OCO_FAILED)."""
    if limit < 1 or limit > 500:
        limit = 100
    settings = get_settings()
    fs = FirestoreNotificationStorage(settings.gcp_project_id)
    intents = fs.list_trade_intents(limit_size=limit, status=status or None)
    return {"intents": intents, "total": len(intents)}


@app.get("/api/trading/live-gate-status")
def api_trading_live_gate_status(auth: AuthContext = Depends(require_auth)) -> dict[str, Any]:
    """Retorna status real de cada gate de proteção LIVE sem expor valores dos secrets."""
    settings = get_settings()
    fs = FirestoreNotificationStorage(settings.gcp_project_id)
    config = fs.get_trading_config()
    guard = config.get("liveGuard") or {}

    # Check each gate individually
    g1_enabled = bool(config.get("enabled", False))
    g1_mode_live = str(config.get("mode") or "").upper() == "LIVE"

    confirm_text = str(guard.get("doubleConfirmText") or "LIVE").upper()
    typed = str(guard.get("typedText") or "").upper()
    g2_confirmed = bool(guard.get("liveConfirmed", False))
    g2_text_ok = typed == confirm_text

    cooldown_minutes = int(guard.get("cooldownMinutes") or 5)
    cooldown_remaining = 0.0
    confirmed_at = _parse_ts(guard.get("liveConfirmedAt"))
    if confirmed_at:
        elapsed = (_now() - confirmed_at).total_seconds() / 60.0
        cooldown_remaining = max(0.0, cooldown_minutes - elapsed)
    g2_cooldown_ok = confirmed_at is not None and cooldown_remaining == 0.0

    g3_feature_flag = str(get_secret("LIVE_TRADING_ENABLED") or "false").lower() == "true"
    armed_secret = str(get_secret("LIVE_TRADING_ARMED") or "").strip()
    g4_armed = armed_secret == "YES_I_KNOW_WHAT_IM_DOING"

    gate_ok, gate_reason = _live_gate_ok(config)

    return {
        "ok": gate_ok,
        "reason": gate_reason,
        "mode": str(config.get("mode") or "PAPER").upper(),
        "enabled": g1_enabled,
        "cooldownRemainingMinutes": round(cooldown_remaining, 1),
        "gates": {
            "g1_enabled": g1_enabled,
            "g1_mode_live": g1_mode_live,
            "g2_confirmed": g2_confirmed,
            "g2_text_ok": g2_text_ok,
            "g2_cooldown_ok": g2_cooldown_ok,
            "g2_cooldown_remaining_minutes": round(cooldown_remaining, 1),
            "g3_feature_flag_enabled": g3_feature_flag,
            "g4_armed": g4_armed,
        },
    }


@app.post("/api/trading/emergency-stop")
def api_trading_emergency_stop(auth: AuthContext = Depends(require_auth)) -> dict[str, Any]:
    settings = get_settings()
    fs = FirestoreNotificationStorage(settings.gcp_project_id)
    config = fs.get_trading_config()
    owner_uid = str(config.get("ownerUid") or get_secret("FIREBASE_OWNER_UID") or "")
    if owner_uid and auth.uid != owner_uid:
        raise HTTPException(status_code=403, detail="owner_only")

    fs.disable_trading("EMERGENCY_STOP_API")
    fs.client.collection("config").document("trading_global").set(
        {
            "liveGuard": {
                "liveConfirmed": False,
                "typedText": "",
                "liveConfirmedAt": None,
            }
        },
        merge=True,
    )
    return {"ok": True, "enabled": False, "reason": "EMERGENCY_STOP_API"}


@app.get("/internal/egress-ip")
def internal_egress_ip() -> dict[str, Any]:
    response = requests.get("https://ifconfig.me/ip", timeout=10)
    response.raise_for_status()
    return {"egressIp": response.text.strip()}


def _get_egress_ip() -> str:
    """Best-effort egress IP; never raises."""
    try:
        return requests.get("https://ifconfig.me/ip", timeout=5).text.strip()
    except Exception:
        return "unknown"


@app.post("/internal/binance/testnet/ping")
def internal_testnet_ping() -> dict[str, Any]:
    """Diagnóstico: chama GET /api/v3/time no TESTNET sem credenciais.
    Prova que o Cloud Run alcança testnet.binance.vision.
    """
    base_url = BinanceTradeClient.TESTNET_BASE_URL
    endpoint = "/api/v3/time"
    egress_ip = _get_egress_ip()
    try:
        resp = requests.get(f"{base_url}{endpoint}", timeout=15)
        ok = resp.status_code == 200
        body_snippet = resp.text[:300] if resp.content else ""
        log_event(
            logger,
            "testnet_ping",
            status_code=resp.status_code,
            ok=ok,
            egress_ip=egress_ip,
        )
        return {
            "ok": ok,
            "status_code": resp.status_code,
            "base_url": base_url,
            "endpoint": endpoint,
            "body_snippet": body_snippet,
            "egress_ip": egress_ip,
        }
    except Exception as exc:
        log_event(logger, "testnet_ping_error", error=str(exc)[:200], egress_ip=egress_ip)
        return {
            "ok": False,
            "status_code": 0,
            "base_url": base_url,
            "endpoint": endpoint,
            "body_snippet": str(exc)[:200],
            "egress_ip": egress_ip,
        }


@app.post("/internal/binance/testnet/account")
def internal_testnet_account() -> dict[str, Any]:
    """Diagnóstico: chama GET /api/v3/account assinado com as TESTNET keys.
    Prova que as credenciais TESTNET funcionam a partir deste Cloud Run.
    Nunca vaza valores de secret na resposta.
    """
    api_key = get_secret("BINANCE_TESTNET_API_KEY")
    api_secret = get_secret("BINANCE_TESTNET_API_SECRET")
    egress_ip = _get_egress_ip()

    if not api_key or not api_secret:
        raise HTTPException(
            status_code=400,
            detail={
                "ok": False,
                "error": "MISSING_TESTNET_KEYS",
                "message": "Secrets BINANCE_TESTNET_API_KEY / BINANCE_TESTNET_API_SECRET não encontrados.",
                "egress_ip": egress_ip,
            },
        )

    try:
        client = BinanceTradeClient(api_key=api_key, api_secret=api_secret, mode="TESTNET")
        account = client.get_account()
        can_trade = bool(account.get("canTrade", False))
        permissions = account.get("permissions") if isinstance(account.get("permissions"), list) else []
        balances = account.get("balances") if isinstance(account.get("balances"), list) else []
        log_event(
            logger,
            "testnet_account_ok",
            can_trade=can_trade,
            balances_count=len(balances),
            egress_ip=egress_ip,
        )
        return {
            "ok": True,
            "status_code": 200,
            "base_url": BinanceTradeClient.TESTNET_BASE_URL,
            "canTrade": can_trade,
            "permissions": permissions,
            "balancesCount": len(balances),
            "egress_ip": egress_ip,
        }
    except requests.HTTPError as exc:
        resp = exc.response
        status_code = int(resp.status_code) if resp is not None else 502
        raw = (resp.text if resp is not None else str(exc)) or str(exc)
        message = raw[:300]
        try:
            payload = resp.json() if resp is not None else {}
            if isinstance(payload, dict) and payload.get("code"):
                message = f"code={payload['code']} msg={payload.get('msg', '')}"
        except Exception:
            pass
        log_event(
            logger,
            "testnet_account_http_error",
            status_code=status_code,
            message=message,
            egress_ip=egress_ip,
        )
        raise HTTPException(
            status_code=status_code,
            detail={
                "ok": False,
                "error": "BINANCE_HTTP_ERROR",
                "status_code": status_code,
                "message": message,
                "egress_ip": egress_ip,
            },
        )
    except Exception as exc:
        log_event(logger, "testnet_account_error", error=str(exc)[:200], egress_ip=egress_ip)
        raise HTTPException(
            status_code=500,
            detail={"ok": False, "error": str(exc)[:300], "egress_ip": egress_ip},
        )


@app.post("/internal/binance/validate")
def internal_binance_validate(auth: AuthContext = Depends(require_auth)) -> dict[str, Any]:
    settings = get_settings()
    fs = FirestoreNotificationStorage(settings.gcp_project_id)
    config = fs.get_trading_config()
    mode = str(config.get("mode") or "TESTNET").upper()

    if mode == "LIVE_VALIDATE_ONLY":
        mode = "LIVE"
    if mode not in {"TESTNET", "LIVE"}:
        mode = "LIVE"

    api_key = get_secret("BINANCE_API_KEY")
    api_secret = get_secret("BINANCE_API_SECRET")
    if mode == "TESTNET":
        api_key = get_secret("BINANCE_TESTNET_API_KEY") or api_key
        api_secret = get_secret("BINANCE_TESTNET_API_SECRET") or api_secret

    if not api_key or not api_secret:
        raise HTTPException(status_code=400, detail={"ok": False, "error": "MISSING_BINANCE_KEYS", "mode": mode})

    try:
        client = BinanceTradeClient(api_key=api_key, api_secret=api_secret, mode=mode)
        account = client.get_account()
        permissions = account.get("permissions") if isinstance(account.get("permissions"), list) else []
        balances = account.get("balances") if isinstance(account.get("balances"), list) else []
        can_trade = bool(account.get("canTrade", False))
        log_event(logger, "binance_validate_ok", uid=auth.uid, mode=mode, canTrade=can_trade, permissions=len(permissions), balancesCount=len(balances))
        return {
            "ok": True,
            "uid": auth.uid,
            "mode": mode,
            "canTrade": can_trade,
            "permissions": permissions,
            "balancesCount": len(balances),
        }
    except requests.HTTPError as exc:
        response = exc.response
        status_code = int(response.status_code) if response is not None else 502
        raw_text = (response.text if response is not None else str(exc)) or str(exc)
        message = raw_text[:300]
        try:
            payload = response.json() if response is not None else {}
            if isinstance(payload, dict):
                code = payload.get("code")
                msg = payload.get("msg")
                message = f"{code}: {msg}" if code is not None else str(msg or message)
        except Exception:
            pass
        log_event(logger, "binance_validate_http_error", uid=auth.uid, mode=mode, statusCode=status_code, message=message)
        raise HTTPException(
            status_code=status_code,
            detail={"ok": False, "mode": mode, "error": "BINANCE_VALIDATE_FAILED", "message": message},
        )
    except Exception as exc:
        log_event(logger, "binance_validate_error", uid=auth.uid, mode=mode, message=str(exc)[:300])
        raise HTTPException(
            status_code=500,
            detail={"ok": False, "mode": mode, "error": "BINANCE_VALIDATE_FAILED", "message": str(exc)[:300]},
        )


@app.post("/cron/quotes")
def cron_quotes() -> dict[str, Any]:
    started_at = datetime.utcnow().isoformat()
    result = run_quotes_pipeline()
    log_event(logger, "cron_quotes_finished", started_at=started_at, **result)
    return result


@app.get("/api/live-quotes")
def api_live_quotes(symbols: str = "") -> dict[str, Any]:
    """Fetch live ticker data from Binance for arbitrary symbols.
    Usage: /api/live-quotes?symbols=DOTUSDT,ADAUSDT
    """
    raw = [s.strip().upper() for s in symbols.split(",") if s.strip()]
    if not raw:
        return {"items": []}
    raw = raw[:20]  # limit
    binance = BinanceClient()
    items: list[dict[str, Any]] = []
    for sym in raw:
        try:
            ticker = binance.fetch_ticker_24h(sym)
            if ticker:
                items.append({
                    "symbol": sym,
                    "price": float(ticker.get("lastPrice") or 0),
                    "change24hPct": float(ticker.get("priceChangePercent") or 0),
                    "volume24h": float(ticker.get("quoteVolume") or 0),
                    "source": "binance_live",
                })
        except Exception:
            pass
    return {"items": items}


@app.get("/internal/executor/status")
def internal_executor_status(auth: AuthContext = Depends(require_auth)) -> dict[str, Any]:
    """Status do executor externo TESTNET (heartbeat + intents pendentes)."""
    settings = get_settings()
    fs = FirestoreNotificationStorage(settings.gcp_project_id)
    hb = fs.get_executor_heartbeat()
    online = fs.is_executor_online(max_age_seconds=120)
    pending = fs.list_pending_trade_intents(limit_size=20)
    return {
        "online": online,
        "lastHeartbeat": hb.get("lastHeartbeat"),
        "version": hb.get("version", "unknown"),
        "mode": hb.get("mode", "TESTNET"),
        "pendingIntents": len(pending),
        "intents": [
            {
                "intentId": i.get("intentId"),
                "symbol": i.get("symbol"),
                "side": i.get("side"),
                "status": i.get("status"),
                "createdAt": i.get("createdAt"),
            }
            for i in pending[:5]
        ],
    }


@app.post("/cron/score")
def cron_score() -> dict[str, Any]:
    started_at = datetime.utcnow().isoformat()
    result = run_score_pipeline()
    log_event(logger, "cron_score_finished", started_at=started_at, **result)
    return result


@app.post("/cron/run")
def cron_run() -> dict[str, Any]:
    started_at = datetime.utcnow().isoformat()
    result = run_score_pipeline()
    log_event(logger, "cron_run_finished", started_at=started_at, **result)
    return result


@app.get("/api/explain/{symbol}")
def api_explain(symbol: str) -> dict[str, Any]:
    """Generate a 3-level AI explanation for an asset using Gemini.
    Falls back to deterministic explanation if Gemini is unavailable.
    """
    from app.explain.explainer import gemini_explain

    symbol = symbol.strip().upper()
    if not symbol:
        raise HTTPException(status_code=400, detail="symbol is required")

    settings = get_settings()
    fs = _firestore()

    # Gather facts from Firestore
    facts: dict[str, Any] = {}
    if fs:
        # Market score data
        market_ref = fs.client.collection("public").document("market_top").collection("items").document(symbol)
        market_snap = market_ref.get()
        if market_snap.exists:
            md = market_snap.to_dict() or {}
            facts.update({
                "score": md.get("score"),
                "signal": md.get("signal"),
                "regime": md.get("regime"),
                "rsi14": md.get("rsi14"),
                "atr14": md.get("atr14"),
                "ema50": md.get("ema50"),
                "ema200": md.get("ema200"),
            })

        # Discover data
        disc_ref = fs.client.collection("public").document("discover_top").collection("items").document(symbol)
        disc_snap = disc_ref.get()
        if disc_snap.exists:
            dd = disc_snap.to_dict() or {}
            facts["potentialScore"] = dd.get("potentialScore")
            km = dd.get("keyMetrics") or {}
            facts["volume_z"] = km.get("volume_z")
            facts["corr_btc"] = km.get("corr_btc")
            facts["trend_strength"] = km.get("trend_strength")

        # Quote data
        quote_ref = fs.client.collection("public").document("quotes_top").collection("items").document(symbol)
        quote_snap = quote_ref.get()
        if quote_snap.exists:
            qd = quote_snap.to_dict() or {}
            facts["price"] = qd.get("price")
            facts["change24hPct"] = qd.get("change24hPct")
            facts["volume24h"] = qd.get("volume24h")

    # If no price from Firestore, try live Binance
    if not facts.get("price"):
        try:
            binance = BinanceClient()
            ticker = binance.fetch_ticker_24h(symbol)
            if ticker:
                facts["price"] = float(ticker.get("lastPrice") or 0)
                facts["change24hPct"] = float(ticker.get("priceChangePercent") or 0)
                facts["volume24h"] = float(ticker.get("quoteVolume") or 0)
        except Exception:
            pass

    # Remove None values
    facts = {k: v for k, v in facts.items() if v is not None}

    # Try Gemini via Vertex AI (service account auth)
    gemini_result = gemini_explain(symbol, facts, settings.gcp_project_id)

    if gemini_result and gemini_result.get("leigo"):
        return {
            "ok": True,
            "symbol": symbol,
            "source": "gemini",
            "model": gemini_result.get("model", "gemini-2.0-flash"),
            "facts": facts,
            **gemini_result,
        }

    # Fallback to deterministic
    from app.explain.explainer import build_explanation
    fallback = build_explanation("EXPLAIN", symbol, facts)
    score = int(float(facts.get("score") or 0))
    signal = str(facts.get("signal") or "WAIT")
    regime = str(facts.get("regime") or "Neutro")

    return {
        "ok": True,
        "symbol": symbol,
        "source": "deterministic",
        "facts": facts,
        "leigo": [
            fallback.get("decisionOneLiner", ""),
            *[r["plain"] for r in fallback.get("reasons", [])],
        ],
        "intermediario": fallback["levels"].get("INTERMEDIARIO", ""),
        "tecnico": str(fallback["levels"].get("TECNICO", "")),
        "significado": f"Score {score}/100, sinal {signal}, regime {regime}.",
        "riscoPrincipal": fallback.get("riskNote", ""),
        "condicaoMudar": "Score subir acima de 70 com regime favorável.",
        "miniLicao": fallback.get("miniLesson", {}),
    }

#!/usr/bin/env python3
"""
BotBit TESTNET External Executor
=================================
Roda LOCALMENTE (notebook, PC, VPS) — fora do Google Cloud.
Lê trade_intents do Firestore e executa na Binance TESTNET.

Por que externo?
  Binance retorna 451 para IPs de datacenters (GCP/AWS/Azure).
  Execução a partir de IP residencial/VPS comercial funciona normalmente.

Pré-requisitos
--------------
  pip install google-cloud-firestore google-cloud-bigquery requests python-dotenv

Variáveis de ambiente (ou .env):
  GCP_PROJECT_ID             = botbit-489114
  BINANCE_TESTNET_API_KEY    = <sua chave testnet>
  BINANCE_TESTNET_API_SECRET = <seu secret testnet>
  GOOGLE_APPLICATION_CREDENTIALS = /path/para/service-account.json  (opcional se já autenticado)

Uso:
  python tools/testnet_executor.py
  # Ctrl+C para parar

Outputs:
  - Firestore: trade_intents/{id} atualizado (EXECUTED / FAILED)
  - Firestore: trading_positions/{symbol}  upserted
  - Firestore: trading_orders/{orderId}    upserted
  - Firestore: executor_heartbeat/current  heartbeat a cada 30s
  - BigQuery:  trade_orders inserido
  - stdout:    logs estruturados
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import math
import os
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any
from urllib.parse import urlencode, quote

import requests

# ── Optional: carrega .env se disponível ─────────────────────────────────────
try:
    from dotenv import load_dotenv
    _env = Path(__file__).parent.parent / ".env"
    if _env.exists():
        load_dotenv(_env)
        print(f"[executor] .env carregado de {_env}")
except ImportError:
    pass

# ── Firestore ─────────────────────────────────────────────────────────────────
from google.cloud import firestore  # type: ignore
try:
    from google.cloud import bigquery  # type: ignore
    _BQ_AVAILABLE = True
except ImportError:
    _BQ_AVAILABLE = False

# ── Configuração ──────────────────────────────────────────────────────────────
PROJECT_ID    = os.environ.get("GCP_PROJECT_ID", "botbit-489114")
API_KEY       = os.environ.get("BINANCE_TESTNET_API_KEY", "")
API_SECRET    = os.environ.get("BINANCE_TESTNET_API_SECRET", "")
BQ_DATASET    = os.environ.get("BQ_DATASET", "market_data")
BQ_LOCATION   = os.environ.get("BQ_LOCATION", "US")

TESTNET_BASE  = "https://testnet.binance.vision"
HEARTBEAT_S   = 30          # segundos entre heartbeats
POLL_S        = 5           # segundos entre polls de intents
RECV_WINDOW   = 10_000      # ms — tolerância de clock drift
VERSION       = "1.1.0"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [executor] %(levelname)s %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger("botbit.executor")


# ── Binance TESTNET client (minimalista) ──────────────────────────────────────

class TestnetClient:
    def __init__(self, api_key: str, api_secret: str) -> None:
        self.api_key = api_key
        self.api_secret = api_secret.encode()
        self.session = requests.Session()
        self.session.headers.update({"X-MBX-APIKEY": api_key})

    def _local_ms(self) -> int:
        return int(time.time() * 1000)

    def _sign(self, params: dict) -> str:
        q = urlencode(params, quote_via=quote, safe="")
        sig = hmac.new(self.api_secret, q.encode(), hashlib.sha256).hexdigest()
        return f"{q}&signature={sig}"

    def _request(self, method: str, path: str, params: dict | None = None, retry: bool = True) -> Any:
        body = {**(params or {}), "timestamp": self._local_ms(), "recvWindow": RECV_WINDOW}
        url = f"{TESTNET_BASE}{path}?{self._sign(body)}"
        r = self.session.request(method, url, timeout=20)
        # retry on -1021 (timestamp drift)
        if r.status_code == 400 and retry:
            try:
                d = r.json()
                if isinstance(d, dict) and d.get("code") == -1021:
                    logger.warning("Timestamp drift detectado, retrying com server time…")
                    st = requests.get(f"{TESTNET_BASE}/api/v3/time", timeout=5)
                    sv = (st.json() or {}).get("serverTime", self._local_ms()) if st.ok else self._local_ms()
                    body["timestamp"] = sv
                    url = f"{TESTNET_BASE}{path}?{self._sign(body)}"
                    r = self.session.request(method, url, timeout=20)
            except Exception:
                pass
        r.raise_for_status()
        return r.json() if r.content else {}

    def ping(self) -> bool:
        try:
            r = requests.get(f"{TESTNET_BASE}/api/v3/time", timeout=10)
            return r.status_code == 200
        except Exception:
            return False

    def account(self) -> dict:
        return self._request("GET", "/api/v3/account") or {}

    def place_order(self, **kwargs) -> dict:
        return self._request("POST", "/api/v3/order", params=kwargs) or {}

    def place_market_order(self, symbol: str, side: str, quantity: float, client_order_id: str) -> dict:
        return self.place_order(
            symbol=symbol.upper(),
            side=side.upper(),
            type="MARKET",
            quantity=quantity,
            newClientOrderId=client_order_id,
        )

    def place_limit_order(self, symbol: str, side: str, quantity: float, price: float, client_order_id: str) -> dict:
        return self.place_order(
            symbol=symbol.upper(),
            side=side.upper(),
            type="LIMIT",
            quantity=quantity,
            price=price,
            timeInForce="GTC",
            newClientOrderId=client_order_id,
        )


def _round_step(quantity: float, step: float) -> float:
    if step <= 0:
        return quantity
    precision = max(0, int(round(-math.log10(step), 0))) if step < 1 else 0
    qty = math.floor(quantity / step) * step
    return round(max(0.0, qty), precision)


def _now() -> datetime:
    return datetime.utcnow()


# ── Firestore helpers ──────────────────────────────────────────────────────────

def fs_client() -> firestore.Client:
    return firestore.Client(project=PROJECT_ID)


def write_heartbeat(fs: firestore.Client) -> None:
    fs.collection("executor_heartbeat").document("current").set(
        {
            "online": True,
            "lastHeartbeat": _now(),
            "version": VERSION,
            "mode": "TESTNET",
            "pid": os.getpid(),
            "updatedAt": _now(),
        },
        merge=True,
    )


def set_offline(fs: firestore.Client) -> None:
    try:
        fs.collection("executor_heartbeat").document("current").set(
            {"online": False, "updatedAt": _now()}, merge=True
        )
    except Exception:
        pass


def list_pending_intents(fs: firestore.Client, limit: int = 10) -> list[dict]:
    query = (
        fs.collection("trade_intents")
        .where("status", "==", "PENDING")
        .limit(limit)
    )
    return [doc.to_dict() for doc in query.stream()]


def claim_intent(fs: firestore.Client, intent_id: str) -> bool:
    """Atomic claim via transaction. Returns True if successfully claimed."""
    ref = fs.collection("trade_intents").document(intent_id)
    txn = fs.transaction()

    @firestore.transactional
    def _claim(t: firestore.Transaction) -> bool:
        snap = ref.get(transaction=t)
        if not snap.exists:
            return False
        data = snap.to_dict() or {}
        if data.get("status") != "PENDING":
            return False
        expires_at = data.get("expiresAt")
        if expires_at:
            if hasattr(expires_at, "tzinfo") and expires_at.tzinfo:
                expires_at = expires_at.replace(tzinfo=None)
            if _now() > expires_at:
                t.update(ref, {"status": "EXPIRED", "updatedAt": _now()})
                return False
        t.update(ref, {"status": "CLAIMED", "claimedAt": _now(), "updatedAt": _now()})
        return True

    try:
        return _claim(txn)
    except Exception as exc:
        logger.warning(f"Claim failed for {intent_id}: {exc}")
        return False


def complete_intent(fs: firestore.Client, intent_id: str, result: dict, error: str = "") -> None:
    status = "FAILED" if error else "EXECUTED"
    fs.collection("trade_intents").document(intent_id).set(
        {
            "status": status,
            "executedAt": _now(),
            "updatedAt": _now(),
            "result": result,
            "error": error,
        },
        merge=True,
    )


def upsert_position(fs: firestore.Client, symbol: str, data: dict) -> None:
    fs.collection("trading_positions").document(symbol.upper()).set(
        {"symbol": symbol.upper(), "updatedAt": _now(), **data}, merge=True
    )


def upsert_order(fs: firestore.Client, order_id: str, data: dict) -> None:
    fs.collection("trading_orders").document(str(order_id)).set(
        {"updatedAt": _now(), **data}, merge=True
    )


def insert_bq_order(row: dict) -> None:
    if not _BQ_AVAILABLE:
        return
    try:
        bq = bigquery.Client(project=PROJECT_ID)
        table = f"{PROJECT_ID}.{BQ_DATASET}.trade_orders"
        errors = bq.insert_rows_json(table, [row])
        if errors:
            logger.warning(f"BQ insert errors: {errors}")
    except Exception as exc:
        logger.warning(f"BQ insert failed: {exc}")


# ── Intent processing ──────────────────────────────────────────────────────────

def process_buy_intent(fs: firestore.Client, client: TestnetClient, intent: dict) -> None:
    intent_id = intent.get("intentId", "")
    symbol = intent.get("symbol", "")
    qty = float(intent.get("quantity", 0))
    price = float(intent.get("price", 0))
    run_id = intent.get("runId", "")

    if qty <= 0 or price <= 0:
        complete_intent(fs, intent_id, {}, error="INVALID_QTY_OR_PRICE")
        return

    qty = _round_step(qty, 0.00001)

    try:
        order = client.place_limit_order(
            symbol=symbol,
            side="BUY",
            quantity=qty,
            price=round(price, 8),
            client_order_id=intent_id[:36],
        )
        order_id = str(order.get("orderId") or intent_id)
        status = str(order.get("status") or "NEW")

        stop_price = float(intent.get("stopPrice", 0))
        take_price = float(intent.get("takePrice", 0))

        upsert_order(fs, order_id, {
            "runId": run_id,
            "symbol": symbol,
            "side": "BUY",
            "status": status,
            "mode": "TESTNET",
            "price": price,
            "qty": qty,
            "intentId": intent_id,
            "source": "testnet_executor",
        })
        upsert_position(fs, symbol, {
            "mode": "TESTNET",
            "status": "OPEN",
            "qty": qty,
            "avgEntry": price,
            "lastPrice": price,
            "pnlUnrealized": 0.0,
            "stopPrice": stop_price,
            "takePrice": take_price,
            "ocoStatus": "EXECUTOR",
            "openedAt": _now(),
            "initialRisk": max(price - stop_price, 1e-9),
            "executorVersion": VERSION,
        })
        complete_intent(fs, intent_id, {"orderId": order_id, "status": status, "qty": qty, "price": price})
        insert_bq_order({
            "run_id": run_id,
            "symbol": symbol,
            "side": "BUY",
            "order_type": "LIMIT",
            "mode": "TESTNET",
            "status": status,
            "error": "",
            "created_at": _now().isoformat(),
        })
        logger.info(f"BUY OK  {symbol} qty={qty} price={price} orderId={order_id} status={status}")

    except requests.HTTPError as exc:
        resp = exc.response
        sc = resp.status_code if resp is not None else 0
        msg = (resp.text or str(exc))[:200] if resp is not None else str(exc)
        logger.error(f"BUY FAIL {symbol}: HTTP {sc} — {msg}")
        complete_intent(fs, intent_id, {}, error=f"HTTP_{sc}: {msg[:120]}")

    except Exception as exc:
        logger.error(f"BUY FAIL {symbol}: {exc}")
        complete_intent(fs, intent_id, {}, error=str(exc)[:200])


def process_sell_intent(fs: firestore.Client, client: TestnetClient, intent: dict) -> None:
    intent_id = intent.get("intentId", "")
    symbol = intent.get("symbol", "")
    qty = float(intent.get("quantity", 0))
    price = float(intent.get("price", 0))
    run_id = intent.get("runId", "")
    reason = intent.get("reason", "executor_sell")

    if qty <= 0:
        complete_intent(fs, intent_id, {}, error="INVALID_QTY")
        return

    qty = _round_step(qty, 0.00001)

    try:
        order = client.place_market_order(
            symbol=symbol,
            side="SELL",
            quantity=qty,
            client_order_id=intent_id[:36],
        )
        order_id = str(order.get("orderId") or intent_id)
        status = str(order.get("status") or "NEW")
        filled_price = float((order.get("fills") or [{}])[0].get("price", 0) or price)

        upsert_order(fs, order_id, {
            "runId": run_id,
            "symbol": symbol,
            "side": "SELL",
            "status": status,
            "mode": "TESTNET",
            "price": filled_price,
            "qty": qty,
            "intentId": intent_id,
            "reason": reason,
            "source": "testnet_executor",
        })
        upsert_position(fs, symbol, {
            "status": "CLOSED",
            "closedAt": _now(),
            "closeReason": reason,
            "lastPrice": filled_price or price,
            "executorVersion": VERSION,
        })
        complete_intent(fs, intent_id, {"orderId": order_id, "status": status, "filledPrice": filled_price})
        insert_bq_order({
            "run_id": run_id,
            "symbol": symbol,
            "side": "SELL",
            "order_type": "MARKET",
            "mode": "TESTNET",
            "status": status,
            "error": reason,
            "created_at": _now().isoformat(),
        })
        logger.info(f"SELL OK {symbol} qty={qty} filledPrice={filled_price} orderId={order_id}")

    except requests.HTTPError as exc:
        resp = exc.response
        sc = resp.status_code if resp is not None else 0
        msg = (resp.text or str(exc))[:200] if resp is not None else str(exc)
        logger.error(f"SELL FAIL {symbol}: HTTP {sc} — {msg}")
        complete_intent(fs, intent_id, {}, error=f"HTTP_{sc}: {msg[:120]}")

    except Exception as exc:
        logger.error(f"SELL FAIL {symbol}: {exc}")
        complete_intent(fs, intent_id, {}, error=str(exc)[:200])


def process_intent(fs: firestore.Client, client: TestnetClient, intent: dict) -> None:
    intent_id = intent.get("intentId", "?")
    side = str(intent.get("side") or "").upper()
    symbol = intent.get("symbol", "?")
    logger.info(f"Processing intent {intent_id}: {side} {symbol}")

    if side == "BUY":
        process_buy_intent(fs, client, intent)
    elif side == "SELL":
        process_sell_intent(fs, client, intent)
    else:
        logger.warning(f"Unknown side '{side}' for intent {intent_id}")
        complete_intent(fs, intent_id, {}, error=f"UNKNOWN_SIDE_{side}")


# ── Main loop ──────────────────────────────────────────────────────────────────

def main() -> None:
    if not API_KEY or not API_SECRET:
        print("ERRO: BINANCE_TESTNET_API_KEY e BINANCE_TESTNET_API_SECRET são obrigatórios.")
        print("  export BINANCE_TESTNET_API_KEY=<chave>")
        print("  export BINANCE_TESTNET_API_SECRET=<secret>")
        sys.exit(1)

    logger.info(f"BotBit TESTNET Executor v{VERSION} iniciado (pid={os.getpid()})")
    logger.info(f"  Project: {PROJECT_ID}")
    logger.info(f"  Testnet: {TESTNET_BASE}")
    logger.info(f"  Poll interval: {POLL_S}s  Heartbeat: {HEARTBEAT_S}s")

    client = TestnetClient(API_KEY, API_SECRET)
    fs = fs_client()

    # ── Verificar conectividade com TESTNET ───────────────────────────────────
    logger.info("Verificando conectividade com testnet.binance.vision…")
    if client.ping():
        logger.info("✓ testnet.binance.vision acessível")
    else:
        logger.error("✗ testnet.binance.vision INACESSÍVEL. Verifique sua rede/IP.")
        sys.exit(2)

    # ── Verificar account ─────────────────────────────────────────────────────
    try:
        acc = client.account()
        can_trade = bool(acc.get("canTrade"))
        balances = [b for b in (acc.get("balances") or []) if float(b.get("free", 0)) > 0]
        logger.info(f"✓ Account OK — canTrade={can_trade}, balances não-zero={len(balances)}")
    except Exception as exc:
        logger.error(f"✗ Account check falhou: {exc}")
        sys.exit(3)

    last_hb = 0.0

    try:
        while True:
            now_ts = time.time()

            # Heartbeat periódico
            if now_ts - last_hb >= HEARTBEAT_S:
                write_heartbeat(fs)
                last_hb = now_ts
                logger.debug("Heartbeat escrito")

            # Processar intents pendentes
            intents = list_pending_intents(fs, limit=10)
            if intents:
                logger.info(f"{len(intents)} intent(s) pendente(s)")
                for intent in intents:
                    intent_id = intent.get("intentId", "")
                    if not intent_id:
                        continue
                    if claim_intent(fs, intent_id):
                        process_intent(fs, client, intent)
                    else:
                        logger.debug(f"Intent {intent_id} não pôde ser reclamado (já processado?)")
            else:
                logger.debug("Nenhum intent pendente")

            time.sleep(POLL_S)

    except KeyboardInterrupt:
        logger.info("Encerrando executor (Ctrl+C)…")
    finally:
        set_offline(fs)
        logger.info("Executor offline. Bye.")


if __name__ == "__main__":
    main()

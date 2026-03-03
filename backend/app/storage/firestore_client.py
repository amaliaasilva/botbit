from __future__ import annotations

from datetime import datetime, timedelta
import hashlib
from typing import Any

from google.cloud import firestore


class FirestoreNotificationStorage:
    def __init__(self, project_id: str) -> None:
        self.client = firestore.Client(project=project_id or None)

    def add_notification(self, uid: str, notification_id: str, payload: dict[str, Any]) -> None:
        if not uid:
            return
        doc_ref = self.client.collection("users").document(uid).collection("notifications").document(notification_id)
        existing = doc_ref.get()
        if existing.exists:
            return

        body = {
            "createdAt": datetime.utcnow(),
            "read": False,
            **payload,
        }
        doc_ref.set(body)

    def upsert_market_score(self, symbol: str, payload: dict[str, Any]) -> None:
        if not symbol:
            return
        doc_ref = self.client.collection("market_latest").document(symbol.upper())
        body = {
            "symbol": symbol.upper(),
            "computed_at": datetime.utcnow(),
            **payload,
        }
        doc_ref.set(body, merge=True)
        self.client.collection("public").document("market_top").collection("items").document(symbol.upper()).set(body, merge=True)

    def upsert_quote(self, symbol: str, payload: dict[str, Any]) -> None:
        if not symbol:
            return
        doc_ref = self.client.collection("quotes").document(symbol.upper())
        body = {
            "symbol": symbol.upper(),
            "updatedAt": datetime.utcnow(),
            **payload,
        }
        doc_ref.set(body, merge=True)
        self.client.collection("public").document("quotes_top").collection("items").document(symbol.upper()).set(body, merge=True)

    def upsert_system_status(self, job_name: str, payload: dict[str, Any]) -> None:
        if not job_name:
            return
        doc_ref = self.client.collection("system_status").document(job_name)
        body = {
            "job": job_name,
            "updatedAt": datetime.utcnow(),
            **payload,
        }
        doc_ref.set(body, merge=True)

    def get_system_status(self, job_name: str) -> dict[str, Any] | None:
        if not job_name:
            return None
        doc_ref = self.client.collection("system_status").document(job_name)
        snap = doc_ref.get()
        if not snap.exists:
            return None
        return snap.to_dict()

    def upsert_discovery_run(self, run_id: str, payload: dict[str, Any]) -> None:
        if not run_id:
            return
        doc_ref = self.client.collection("discovery_runs").document(run_id)
        doc_ref.set(payload, merge=True)

    def upsert_discovery_latest(self, symbol: str, payload: dict[str, Any]) -> None:
        if not symbol:
            return
        doc_ref = self.client.collection("discover_latest").document(symbol.upper())
        body = {
            "symbol": symbol.upper(),
            "computedAt": datetime.utcnow(),
            **payload,
        }
        doc_ref.set(body, merge=True)
        self.client.collection("public").document("discover_top").collection("items").document(symbol.upper()).set(body, merge=True)

    def upsert_discovery_top_item(self, date_key: str, symbol: str, payload: dict[str, Any]) -> None:
        if not date_key or not symbol:
            return
        doc_ref = self.client.collection("discover_top").document(date_key).collection("items").document(symbol.upper())
        doc_ref_v2 = self.client.collection("discovery_top").document(date_key).collection("items").document(symbol.upper())
        body = {
            "symbol": symbol.upper(),
            "computedAt": datetime.utcnow(),
            **payload,
            "dateKey": date_key,
        }
        doc_ref.set(body, merge=True)
        doc_ref_v2.set(body, merge=True)
        self.client.collection("public").document("discover_top").collection("items").document(symbol.upper()).set(body, merge=True)

    def list_discovery_latest(self, limit_size: int = 50) -> list[dict[str, Any]]:
        query = (
            self.client.collection("discover_latest")
            .order_by("potentialScore", direction=firestore.Query.DESCENDING)
            .limit(max(1, limit_size))
        )
        return [doc.to_dict() for doc in query.stream()]

    def list_market_latest(self, limit_size: int = 100) -> list[dict[str, Any]]:
        query = (
            self.client.collection("market_latest")
            .order_by("score", direction=firestore.Query.DESCENDING)
            .limit(max(1, limit_size))
        )
        return [doc.to_dict() for doc in query.stream()]

    def list_quotes(self, limit_size: int = 200) -> list[dict[str, Any]]:
        query = (
            self.client.collection("quotes")
            .order_by("updatedAt", direction=firestore.Query.DESCENDING)
            .limit(max(1, limit_size))
        )
        return [doc.to_dict() for doc in query.stream()]

    def ensure_trading_templates(self, owner_uid: str = "") -> None:
        trading_ref = self.client.collection("config").document("trading_global")
        alerts_ref = self.client.collection("config").document("alerts")

        if not trading_ref.get().exists:
            trading_ref.set(
                {
                    "enabled": False,
                    "mode": "PAPER",
                    "ownerUid": owner_uid,
                    "exchange": "BINANCE",
                    "symbolsUniverse": "DISCOVER_TOP50",
                    "fixedSymbols": ["BTCUSDT", "ETHUSDT", "SOLUSDT"],
                    "timeframe": "4h",
                    "cooldownHours": 24,
                    "maxOpenPositions": 2,
                    "maxTradesPerDay": 2,
                    "maxDailyLossPct": 2.5,
                    "riskPerTradePct": 0.75,
                    "maxNotionalPerTradePct": 35,
                    "minNotionalUSDT": 10,
                    "paperInitialCashUSDT": 1000,
                    "entry": {
                        "minScore": 70,
                        "minPotentialScore": 75,
                        "requireRegime": "Alta",
                        "requireSignal": "BUY",
                        "minQuoteVolume24hUSDT": 5000000,
                    },
                    "exit": {
                        "useOCO": True,
                        "stopAtrMult": 1.5,
                        "takeAtrMult": 2.5,
                        "moveStopToBreakevenAtR": 1.0,
                        "trailAtrMult": 1.2,
                        "timeStopHours": 48,
                    },
                    "guards": {
                        "excludeStablecoins": True,
                        "symbolRegex": "^[A-Z0-9]{3,12}USDT$",
                        "maxAtrPct": 6.0,
                        "allowIfIndicatorsInvalid": False,
                    },
                    "liveGuard": {
                        "doubleConfirmText": "LIVE",
                        "cooldownMinutes": 5,
                        "liveConfirmed": False,
                        "liveConfirmedAt": None,
                    },
                    "updatedAt": datetime.utcnow(),
                },
                merge=True,
            )

        if not alerts_ref.get().exists:
            alerts_ref.set(
                {
                    "emailEnabled": True,
                    "inAppEnabled": True,
                    "cooldownMinutes": 180,
                    "types": {
                        "tradeExecuted": True,
                        "stopHit": True,
                        "takeHit": True,
                        "dailyLossCut": True,
                        "newTopCandidate": False,
                    },
                },
                merge=True,
            )

    def get_trading_config(self) -> dict[str, Any]:
        doc_ref = self.client.collection("config").document("trading_global")
        snap = doc_ref.get()
        if not snap.exists:
            legacy_ref = self.client.collection("trading_config").document("current")
            legacy_snap = legacy_ref.get()
            if legacy_snap.exists:
                data = legacy_snap.to_dict() or {}
                data["_configSource"] = "trading_config/current"
                return data
            return {
                "enabled": False,
                "mode": "PAPER",
                "maxOpenPositions": 2,
                "maxTradesPerDay": 2,
                "riskPerTradePct": 0.75,
                "maxDailyLossPct": 2.5,
                "maxNotionalPerTradePct": 35,
                "cooldownHours": 24,
                "minNotionalUSDT": 10,
                "entry": {"minScore": 70, "minPotentialScore": 75, "requireRegime": "Alta", "requireSignal": "BUY"},
                "exit": {"stopAtrMult": 1.5, "takeAtrMult": 2.5, "moveStopToBreakevenAtR": 1.0, "trailAtrMult": 1.2, "timeStopHours": 48},
                "guards": {"maxAtrPct": 6.0},
                "_configSource": "defaults",
            }
        data = snap.to_dict() or {}
        data["_configSource"] = "config/trading_global"
        return data

    def get_alerts_config(self) -> dict[str, Any]:
        snap = self.client.collection("config").document("alerts").get()
        if not snap.exists:
            return {
                "emailEnabled": True,
                "inAppEnabled": True,
                "cooldownMinutes": 180,
                "types": {
                    "tradeExecuted": True,
                    "stopHit": True,
                    "takeHit": True,
                    "dailyLossCut": True,
                    "newTopCandidate": False,
                },
            }
        return snap.to_dict() or {}

    def upsert_trading_state(self, payload: dict[str, Any]) -> None:
        doc_ref = self.client.collection("trading_state").document("current")
        body = {"updatedAt": datetime.utcnow(), **payload}
        doc_ref.set(body, merge=True)

    def get_trading_state(self) -> dict[str, Any]:
        snap = self.client.collection("trading_state").document("current").get()
        return (snap.to_dict() or {}) if snap.exists else {}

    def disable_trading(self, reason: str) -> None:
        now = datetime.utcnow()
        self.client.collection("config").document("trading_global").set(
            {
                "enabled": False,
                "updatedAt": now,
                "lastSafetyError": reason,
            },
            merge=True,
        )
        self.upsert_trading_state({"enabled": False, "lastError": reason, "lastRunAt": now})

    def upsert_trading_position(self, symbol: str, payload: dict[str, Any]) -> None:
        if not symbol:
            return
        doc_ref = self.client.collection("trading_positions").document(symbol.upper())
        body = {"symbol": symbol.upper(), "updatedAt": datetime.utcnow(), **payload}
        doc_ref.set(body, merge=True)

    def list_trading_positions(self, status: str | None = None, limit_size: int = 100) -> list[dict[str, Any]]:
        query = self.client.collection("trading_positions")
        if status:
            query = query.where("status", "==", status)
        query = query.limit(max(1, limit_size))
        return [doc.to_dict() for doc in query.stream()]

    def upsert_trading_order(self, order_id: str, payload: dict[str, Any]) -> None:
        if not order_id:
            return
        doc_ref = self.client.collection("trading_orders").document(str(order_id))
        body = {"updatedAt": datetime.utcnow(), **payload}
        doc_ref.set(body, merge=True)

    def list_trading_orders(self, status: str | None = None, limit_size: int = 100) -> list[dict[str, Any]]:
        query = self.client.collection("trading_orders")
        if status:
            query = query.where("status", "==", status)
        query = query.order_by("updatedAt", direction=firestore.Query.DESCENDING).limit(max(1, limit_size))
        return [doc.to_dict() for doc in query.stream()]

    def get_daily_trade_counter(self, date_key: str) -> int:
        snap = self.client.collection("trading_state").document(f"daily_{date_key}").get()
        if not snap.exists:
            return 0
        return int((snap.to_dict() or {}).get("trades", 0) or 0)

    def increment_daily_trade_counter(self, date_key: str, amount: int = 1) -> None:
        doc_ref = self.client.collection("trading_state").document(f"daily_{date_key}")
        payload = {
            "date": date_key,
            "trades": firestore.Increment(int(amount)),
            "updatedAt": datetime.utcnow(),
        }
        doc_ref.set(payload, merge=True)

    def build_alert_hash(self, event_type: str, symbol: str, direction: str, ts_bucket: str, key_fields: str = "") -> str:
        raw = f"{event_type}|{symbol}|{direction}|{ts_bucket}|{key_fields}"
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()

    def should_send_alert(self, dedupe_hash: str, cooldown_minutes: int = 60) -> bool:
        if not dedupe_hash:
            return True
        doc_ref = self.client.collection("alerts_sent").document(dedupe_hash)
        snap = doc_ref.get()
        if not snap.exists:
            return True
        payload = snap.to_dict() or {}
        sent_at = payload.get("sentAt")
        if sent_at is None:
            return True
        if hasattr(sent_at, "tzinfo") and sent_at.tzinfo is not None:
            sent_at = sent_at.replace(tzinfo=None)
        threshold = datetime.utcnow() - timedelta(minutes=max(0, int(cooldown_minutes)))
        return sent_at < threshold

    def register_sent_alert(self, dedupe_hash: str, payload: dict[str, Any]) -> None:
        if not dedupe_hash:
            return
        doc_ref = self.client.collection("alerts_sent").document(dedupe_hash)
        doc_ref.set({"sentAt": datetime.utcnow(), **payload}, merge=True)

    def list_user_ids(self, limit_size: int = 20) -> list[str]:
        query = self.client.collection("users").limit(max(1, limit_size))
        return [doc.id for doc in query.stream() if doc.id]

    def acquire_trade_lock(self, owner: str, ttl_seconds: int = 240) -> tuple[bool, dict[str, Any]]:
        lock_ref = self.client.collection("locks").document("trade_run_current")
        transaction = self.client.transaction()

        @firestore.transactional
        def _acquire(txn: firestore.Transaction) -> tuple[bool, dict[str, Any]]:
            snap = lock_ref.get(transaction=txn)
            now = datetime.utcnow()
            expires_at = now + timedelta(seconds=max(30, ttl_seconds))
            if snap.exists:
                data = snap.to_dict() or {}
                current_expires = data.get("expiresAt")
                if hasattr(current_expires, "tzinfo") and current_expires is not None and current_expires.tzinfo is not None:
                    current_expires = current_expires.replace(tzinfo=None)
                if current_expires and current_expires > now and data.get("owner") != owner:
                    return False, data

            next_data = {
                "owner": owner,
                "acquiredAt": now,
                "updatedAt": now,
                "expiresAt": expires_at,
            }
            txn.set(lock_ref, next_data, merge=True)
            return True, next_data

        return _acquire(transaction)

    def refresh_trade_lock(self, owner: str, ttl_seconds: int = 240) -> None:
        lock_ref = self.client.collection("locks").document("trade_run_current")
        now = datetime.utcnow()
        lock_ref.set(
            {
                "owner": owner,
                "updatedAt": now,
                "expiresAt": now + timedelta(seconds=max(30, ttl_seconds)),
            },
            merge=True,
        )

    def release_trade_lock(self, owner: str) -> None:
        lock_ref = self.client.collection("locks").document("trade_run_current")
        lock_ref.set(
            {
                "owner": owner,
                "updatedAt": datetime.utcnow(),
                "expiresAt": datetime.utcnow(),
            },
            merge=True,
        )

    # ── External Executor (TESTNET / LIVE remote runner) ──────────────────────

    def get_executor_heartbeat(self) -> dict[str, Any]:
        """Returns executor heartbeat doc or {}."""
        snap = self.client.collection("executor_heartbeat").document("current").get()
        return (snap.to_dict() or {}) if snap.exists else {}

    def is_executor_online(self, max_age_seconds: int = 120) -> bool:
        """True if executor sent a heartbeat within max_age_seconds."""
        data = self.get_executor_heartbeat()
        last = data.get("lastHeartbeat")
        if not last:
            return False
        if hasattr(last, "tzinfo") and last.tzinfo is not None:
            last = last.replace(tzinfo=None)
        try:
            age = (datetime.utcnow() - last).total_seconds()
            return age <= max_age_seconds
        except Exception:
            return False

    def write_executor_heartbeat(self, payload: dict[str, Any]) -> None:
        self.client.collection("executor_heartbeat").document("current").set(
            {"lastHeartbeat": datetime.utcnow(), **payload}, merge=True
        )

    def write_trade_intent(self, intent_id: str, payload: dict[str, Any]) -> None:
        """Write a new PENDING trade intent for the external executor."""
        if not intent_id:
            return
        doc_ref = self.client.collection("trade_intents").document(intent_id)
        body = {
            "intentId": intent_id,
            "status": "PENDING",
            "createdAt": datetime.utcnow(),
            "expiresAt": datetime.utcnow() + timedelta(minutes=5),
            **payload,
        }
        doc_ref.set(body)

    def update_trade_intent(self, intent_id: str, payload: dict[str, Any]) -> None:
        if not intent_id:
            return
        self.client.collection("trade_intents").document(intent_id).set(
            {"updatedAt": datetime.utcnow(), **payload}, merge=True
        )

    def list_pending_trade_intents(self, limit_size: int = 20) -> list[dict[str, Any]]:
        query = (
            self.client.collection("trade_intents")
            .where("status", "==", "PENDING")
            .limit(max(1, limit_size))
        )
        return [doc.to_dict() for doc in query.stream()]

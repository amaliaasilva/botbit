from __future__ import annotations

import hashlib
import hmac
import time
from typing import Any
from urllib.parse import urlencode, quote

import requests


class BinanceTradeClient:
    LIVE_BASE_URL = "https://api.binance.com"
    TESTNET_BASE_URL = "https://testnet.binance.vision"

    def __init__(
        self,
        api_key: str,
        api_secret: str,
        mode: str = "TESTNET",
        recv_window: int = 10000,
        timeout_seconds: int = 20,
    ) -> None:
        self.api_key = str(api_key or "").strip()
        self.api_secret = str(api_secret or "").strip().encode("utf-8")
        self.mode = (mode or "TESTNET").upper()
        self.recv_window = recv_window
        self.timeout_seconds = timeout_seconds
        self.base_url = self.TESTNET_BASE_URL if self.mode == "TESTNET" else self.LIVE_BASE_URL
        self.session = requests.Session()
        self.session.headers.update({"X-MBX-APIKEY": self.api_key})

    def _local_time_ms(self) -> int:
        """Returns local system clock in milliseconds."""
        return int(time.time() * 1000)

    def _fetch_server_time_ms(self) -> int | None:
        """Best-effort Binance server time. Returns None if unavailable; never blocks the flow."""
        try:
            response = self.session.get(
                f"{self.base_url}/api/v3/time", timeout=min(5, self.timeout_seconds)
            )
            if response.status_code == 200:
                return int((response.json() or {}).get("serverTime") or 0) or None
            return None
        except Exception:
            return None

    def _sign(self, params: dict[str, Any]) -> str:
        query = urlencode(params, quote_via=quote, safe="")
        signature = hmac.new(self.api_secret, query.encode("utf-8"), hashlib.sha256).hexdigest()
        return f"{query}&signature={signature}"

    def _signed_request(self, method: str, path: str, params: dict[str, Any] | None = None) -> Any:
        body = {**(params or {})}
        body["timestamp"] = self._local_time_ms()  # local clock — no blocking /time call
        body["recvWindow"] = self.recv_window
        signed_query = self._sign(body)
        url = f"{self.base_url}{path}?{signed_query}"

        response = self.session.request(method.upper(), url, timeout=self.timeout_seconds)

        # Retry exactly once on timestamp-out-of-sync error (-1021)
        if response.status_code == 400:
            try:
                data = response.json()
                if isinstance(data, dict) and data.get("code") == -1021:
                    server_ts = self._fetch_server_time_ms()
                    body["timestamp"] = server_ts if server_ts else self._local_time_ms()
                    body["recvWindow"] = self.recv_window
                    signed_query = self._sign(body)
                    url = f"{self.base_url}{path}?{signed_query}"
                    response = self.session.request(method.upper(), url, timeout=self.timeout_seconds)
            except Exception:
                pass  # fall through to raise_for_status below

        response.raise_for_status()
        return response.json() if response.content else {}

    def get_account(self) -> dict[str, Any]:
        payload = self._signed_request("GET", "/api/v3/account")
        return payload if isinstance(payload, dict) else {}

    def place_order(self, symbol: str, side: str, order_type: str, quantity: float, **kwargs: Any) -> dict[str, Any]:
        params: dict[str, Any] = {
            "symbol": symbol.upper(),
            "side": side.upper(),
            "type": order_type.upper(),
            "quantity": quantity,
        }
        params.update(kwargs)
        payload = self._signed_request("POST", "/api/v3/order", params=params)
        return payload if isinstance(payload, dict) else {}

    def place_oco_order(
        self,
        symbol: str,
        side: str,
        quantity: float,
        price: float,
        stop_price: float,
        stop_limit_price: float,
        **kwargs: Any,
    ) -> dict[str, Any]:
        params: dict[str, Any] = {
            "symbol": symbol.upper(),
            "side": side.upper(),
            "quantity": quantity,
            "price": price,
            "stopPrice": stop_price,
            "stopLimitPrice": stop_limit_price,
            "stopLimitTimeInForce": "GTC",
        }
        params.update(kwargs)
        payload = self._signed_request("POST", "/api/v3/order/oco", params=params)
        return payload if isinstance(payload, dict) else {}

    def test_order(self, symbol: str, side: str, order_type: str, quantity: float, **kwargs: Any) -> dict[str, Any]:
        params: dict[str, Any] = {
            "symbol": symbol.upper(),
            "side": side.upper(),
            "type": order_type.upper(),
            "quantity": quantity,
        }
        params.update(kwargs)
        payload = self._signed_request("POST", "/api/v3/order/test", params=params)
        return payload if isinstance(payload, dict) else {}

    def query_order(self, symbol: str, order_id: int) -> dict[str, Any]:
        payload = self._signed_request(
            "GET",
            "/api/v3/order",
            params={"symbol": symbol.upper(), "orderId": int(order_id)},
        )
        return payload if isinstance(payload, dict) else {}

    def cancel_order(self, symbol: str, order_id: int) -> dict[str, Any]:
        payload = self._signed_request(
            "DELETE",
            "/api/v3/order",
            params={"symbol": symbol.upper(), "orderId": int(order_id)},
        )
        return payload if isinstance(payload, dict) else {}

    def list_open_orders(self, symbol: str | None = None) -> list[dict[str, Any]]:
        params: dict[str, Any] = {}
        if symbol:
            params["symbol"] = symbol.upper()
        payload = self._signed_request("GET", "/api/v3/openOrders", params=params)
        return payload if isinstance(payload, list) else []

    def sleep_backoff(self, seconds: float = 0.3) -> None:
        time.sleep(max(0.05, seconds))

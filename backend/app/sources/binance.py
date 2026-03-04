import time
from typing import Any

import pandas as pd
import requests


class BinanceClient:
    BASE_URLS = ["https://api.binance.com", "https://data-api.binance.vision"]

    def __init__(self, timeout_seconds: int = 20, max_retries: int = 3) -> None:
        self.timeout_seconds = timeout_seconds
        self.max_retries = max_retries

    def _request(self, path: str, params: dict[str, Any]) -> Any:
        last_exc: Exception | None = None
        for base_url in self.BASE_URLS:
            url = f"{base_url}{path}"
            for attempt in range(1, self.max_retries + 1):
                try:
                    response = requests.get(url, params=params, timeout=self.timeout_seconds)
                except requests.exceptions.RequestException as exc:
                    # Erro de rede (sem rota, timeout, reset) — tenta próximo base URL
                    last_exc = exc
                    time.sleep(min(attempt, 3))
                    break  # abandona este base_url, tenta o próximo
                if response.status_code == 429:
                    time.sleep(min(2**attempt, 10))
                    continue
                if response.status_code == 451:
                    break  # geo-block neste base_url, tenta próximo
                if response.status_code >= 500:
                    time.sleep(attempt)
                    continue
                response.raise_for_status()
                return response.json()
        if last_exc is not None:
            raise last_exc
        return None

    def fetch_klines(self, symbol: str, interval: str = "4h", limit: int = 1000) -> pd.DataFrame:
        data = self._request(
            "/api/v3/klines",
            params={"symbol": symbol.upper(), "interval": interval, "limit": limit},
        )
        columns = [
            "open_time",
            "open",
            "high",
            "low",
            "close",
            "volume",
            "close_time",
            "quote_asset_volume",
            "num_trades",
            "taker_buy_base",
            "taker_buy_quote",
            "ignore",
        ]
        df = pd.DataFrame(data, columns=columns)
        numeric_cols = ["open", "high", "low", "close", "volume"]
        for col in numeric_cols:
            df[col] = pd.to_numeric(df[col], errors="coerce")
        df["time"] = pd.to_datetime(df["open_time"], unit="ms", utc=True)
        return df[["time", "open", "high", "low", "close", "volume"]].sort_values("time")

    def fetch_top_usdt_symbols(self, limit: int = 20) -> list[str]:
        data = self._request("/api/v3/ticker/24hr", params={})
        if not isinstance(data, list):
            return []

        banned_suffixes = ("UPUSDT", "DOWNUSDT", "BULLUSDT", "BEARUSDT")
        banned_prefixes = ("USDC", "USDT", "FDUSD", "TUSD", "USDP", "BUSD", "DAI", "EUR", "USD")
        filtered = []
        for item in data:
            symbol = str(item.get("symbol") or "").upper()
            if not symbol.endswith("USDT"):
                continue
            base_asset = symbol[:-4]
            if len(base_asset) < 2:
                continue
            if any(symbol.startswith(prefix) for prefix in banned_prefixes):
                continue
            if any(symbol.endswith(suffix) for suffix in banned_suffixes):
                continue
            try:
                quote_volume = float(item.get("quoteVolume") or 0)
            except Exception:
                quote_volume = 0.0
            filtered.append((symbol, quote_volume))

        filtered.sort(key=lambda row: row[1], reverse=True)
        return [symbol for symbol, _ in filtered[: max(1, limit)]]

    def fetch_ticker_24h(self, symbol: str) -> dict[str, Any]:
        payload = self._request("/api/v3/ticker/24hr", params={"symbol": symbol.upper()})
        return payload if isinstance(payload, dict) else {}

    def fetch_ticker_24h_all(self) -> list[dict[str, Any]]:
        payload = self._request("/api/v3/ticker/24hr", params={})
        return payload if isinstance(payload, list) else []

    def fetch_exchange_info(self) -> dict[str, Any]:
        payload = self._request("/api/v3/exchangeInfo", params={})
        return payload if isinstance(payload, dict) else {}

    def fetch_server_time(self) -> int:
        payload = self._request("/api/v3/time", params={})
        return int((payload or {}).get("serverTime") or 0)

import time
from datetime import datetime, timezone
from typing import Any

import pandas as pd
import requests


class BrapiClient:
    BASE_URL = "https://brapi.dev/api"

    def __init__(self, token: str = "", timeout_seconds: int = 20, max_retries: int = 3) -> None:
        self.token = token
        self.timeout_seconds = timeout_seconds
        self.max_retries = max_retries

    def _request(self, path: str, params: dict[str, Any]) -> dict[str, Any]:
        url = f"{self.BASE_URL}{path}"
        query_params = dict(params)
        headers = {}
        if self.token:
            query_params["token"] = self.token
            headers["Authorization"] = f"Bearer {self.token}"

        for attempt in range(1, self.max_retries + 1):
            response = requests.get(url, params=query_params, headers=headers, timeout=self.timeout_seconds)
            if response.status_code == 429:
                time.sleep(min(2**attempt, 10))
                continue
            if response.status_code >= 500:
                time.sleep(attempt)
                continue
            response.raise_for_status()
            return response.json()
        response.raise_for_status()
        return {}

    def fetch_quote_and_history(self, ticker: str, range_str: str = "2y") -> pd.DataFrame:
        payload = self._request(
            f"/quote/{ticker.upper()}",
            {
                "range": range_str,
                "interval": "1d",
                "fundamental": "false",
                "dividends": "false",
            },
        )
        results = payload.get("results") or []
        if not results:
            return pd.DataFrame(columns=["date", "open", "high", "low", "close", "volume", "ticker"])

        result = results[0]
        history = result.get("historicalDataPrice") or result.get("historicalData") or []
        rows: list[dict[str, Any]] = []
        for item in history:
            epoch = item.get("date")
            if epoch is None:
                continue
            dt = datetime.fromtimestamp(int(epoch), tz=timezone.utc).date()
            rows.append(
                {
                    "date": dt,
                    "open": float(item.get("open") or 0.0),
                    "high": float(item.get("high") or 0.0),
                    "low": float(item.get("low") or 0.0),
                    "close": float(item.get("close") or 0.0),
                    "volume": float(item.get("volume") or 0.0),
                    "ticker": ticker.upper(),
                }
            )

        df = pd.DataFrame(rows)
        if df.empty:
            return df
        return df.sort_values("date")

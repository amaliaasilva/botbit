import json
import logging
import os
from dataclasses import dataclass
from functools import lru_cache
from typing import Optional

from google.cloud import secretmanager


@dataclass
class Settings:
    gcp_project_id: str = os.getenv("GCP_PROJECT_ID", "")
    bq_dataset: str = os.getenv("BQ_DATASET", "market_ai")
    bq_location: str = os.getenv("BQ_LOCATION", "US")
    btc_symbol: str = os.getenv("BTC_SYMBOL", "BTCUSDT")
    btc_interval: str = os.getenv("BTC_INTERVAL", "4h")
    binance_universe_size: int = int(os.getenv("BINANCE_UNIVERSE_SIZE", "12"))
    default_binance_symbols: str = os.getenv(
        "DEFAULT_BINANCE_SYMBOLS",
        "BTCUSDT,ETHUSDT,BNBUSDT,SOLUSDT,XRPUSDT,ADAUSDT,DOGEUSDT,TRXUSDT,LINKUSDT,AVAXUSDT",
    )
    default_b3_tickers: str = os.getenv("DEFAULT_B3_TICKERS", "")
    discover_top_n: int = int(os.getenv("DISCOVER_TOP_N", "50"))
    discover_candidate_kline_n: int = int(os.getenv("DISCOVER_CANDIDATE_KLINE_N", "100"))
    discover_liquidity_min_quote_volume: float = float(os.getenv("DISCOVER_LIQUIDITY_MIN_QUOTE_VOLUME", "5000000"))
    trade_loop_symbols_top_n: int = int(os.getenv("TRADE_LOOP_SYMBOLS_TOP_N", "10"))
    trade_default_mode: str = os.getenv("TRADE_DEFAULT_MODE", "TESTNET")
    log_level: str = os.getenv("LOG_LEVEL", "INFO")

    @property
    def b3_tickers(self) -> list[str]:
        return [item.strip().upper() for item in self.default_b3_tickers.split(",") if item.strip()]

    @property
    def binance_symbols(self) -> list[str]:
        return [item.strip().upper() for item in self.default_binance_symbols.split(",") if item.strip()]


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    settings = Settings()
    configure_logging(settings.log_level)
    return settings


def configure_logging(level: str) -> None:
    logging.basicConfig(
        level=getattr(logging, level.upper(), logging.INFO),
        format="%(message)s",
    )


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)


def log_event(logger: logging.Logger, event: str, **payload: object) -> None:
    data = {"event": event, **payload}
    logger.info(json.dumps(data, default=str))


@lru_cache(maxsize=128)
def get_secret(secret_name: str, project_id: Optional[str] = None) -> str:
    env_value = os.getenv(secret_name)
    if env_value:
        return env_value

    settings = get_settings()
    effective_project_id = project_id or settings.gcp_project_id
    if not effective_project_id:
        return ""

    try:
        client = secretmanager.SecretManagerServiceClient()
        secret_path = f"projects/{effective_project_id}/secrets/{secret_name}/versions/latest"
        response = client.access_secret_version(request={"name": secret_path})
        return response.payload.data.decode("utf-8").strip()
    except Exception:
        return ""

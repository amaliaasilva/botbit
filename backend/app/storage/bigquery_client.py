from __future__ import annotations

from datetime import date, datetime
from typing import Any

from google.cloud import bigquery


class BigQueryStorage:
    def __init__(self, project_id: str, dataset: str, location: str = "US") -> None:
        self.project_id = project_id
        self.dataset = dataset
        self.location = location
        self.client = bigquery.Client(project=project_id or None)

    def _table(self, name: str) -> str:
        return f"{self.client.project}.{self.dataset}.{name}"

    def ensure_dataset_and_tables(self) -> None:
        dataset_id = f"{self.client.project}.{self.dataset}"
        ds = bigquery.Dataset(dataset_id)
        ds.location = self.location
        self.client.create_dataset(ds, exists_ok=True)

        self._create_table(
            "raw_btc_klines_4h",
            [
                bigquery.SchemaField("time", "TIMESTAMP"),
                bigquery.SchemaField("open", "FLOAT"),
                bigquery.SchemaField("high", "FLOAT"),
                bigquery.SchemaField("low", "FLOAT"),
                bigquery.SchemaField("close", "FLOAT"),
                bigquery.SchemaField("volume", "FLOAT"),
                bigquery.SchemaField("source", "STRING"),
            ],
        )
        self._create_table(
            "raw_b3_daily",
            [
                bigquery.SchemaField("date", "DATE"),
                bigquery.SchemaField("ticker", "STRING"),
                bigquery.SchemaField("open", "FLOAT"),
                bigquery.SchemaField("high", "FLOAT"),
                bigquery.SchemaField("low", "FLOAT"),
                bigquery.SchemaField("close", "FLOAT"),
                bigquery.SchemaField("volume", "FLOAT"),
                bigquery.SchemaField("source", "STRING"),
            ],
        )
        self._create_table(
            "features_scores",
            [
                bigquery.SchemaField("ts", "TIMESTAMP"),
                bigquery.SchemaField("date", "DATE"),
                bigquery.SchemaField("asset_type", "STRING"),
                bigquery.SchemaField("symbol", "STRING"),
                bigquery.SchemaField("ema50", "FLOAT"),
                bigquery.SchemaField("ema200", "FLOAT"),
                bigquery.SchemaField("rsi14", "FLOAT"),
                bigquery.SchemaField("atr14", "FLOAT"),
                bigquery.SchemaField("regime", "STRING"),
                bigquery.SchemaField("signal", "STRING"),
                bigquery.SchemaField("stop_price", "FLOAT"),
                bigquery.SchemaField("score", "INT64"),
                bigquery.SchemaField("explanation", "STRING"),
                bigquery.SchemaField("created_at", "TIMESTAMP"),
            ],
        )
        self._create_table(
            "alerts_sent",
            [
                bigquery.SchemaField("id", "STRING"),
                bigquery.SchemaField("symbol", "STRING"),
                bigquery.SchemaField("signal", "STRING"),
                bigquery.SchemaField("ts", "TIMESTAMP"),
                bigquery.SchemaField("sent_at", "TIMESTAMP"),
            ],
        )
        self._create_table(
            "trade_runs",
            [
                bigquery.SchemaField("run_id", "STRING"),
                bigquery.SchemaField("mode", "STRING"),
                bigquery.SchemaField("enabled", "BOOL"),
                bigquery.SchemaField("executed", "INT64"),
                bigquery.SchemaField("skipped", "INT64"),
                bigquery.SchemaField("candidates", "INT64"),
                bigquery.SchemaField("error", "STRING"),
                bigquery.SchemaField("created_at", "TIMESTAMP"),
            ],
        )
        self._create_table(
            "trade_orders",
            [
                bigquery.SchemaField("run_id", "STRING"),
                bigquery.SchemaField("symbol", "STRING"),
                bigquery.SchemaField("side", "STRING"),
                bigquery.SchemaField("order_type", "STRING"),
                bigquery.SchemaField("mode", "STRING"),
                bigquery.SchemaField("status", "STRING"),
                bigquery.SchemaField("error", "STRING"),
                bigquery.SchemaField("created_at", "TIMESTAMP"),
            ],
        )
        self._create_table(
            "trade_positions",
            [
                bigquery.SchemaField("symbol", "STRING"),
                bigquery.SchemaField("entry_price", "FLOAT"),
                bigquery.SchemaField("quantity", "FLOAT"),
                bigquery.SchemaField("stop_price", "FLOAT"),
                bigquery.SchemaField("take_price", "FLOAT"),
                bigquery.SchemaField("status", "STRING"),
                bigquery.SchemaField("updated_at", "TIMESTAMP"),
            ],
        )

    def _create_table(self, name: str, schema: list[bigquery.SchemaField]) -> None:
        table = bigquery.Table(self._table(name), schema=schema)
        self.client.create_table(table, exists_ok=True)

    def insert_json_rows(self, table_name: str, rows: list[dict[str, Any]], row_ids: list[str] | None = None) -> None:
        if not rows:
            return
        errors = self.client.insert_rows_json(self._table(table_name), rows, row_ids=row_ids)
        if errors:
            raise RuntimeError(f"Erro ao inserir em {table_name}: {errors}")

    def insert_raw_btc(self, rows: list[dict[str, Any]]) -> None:
        row_ids = [f"btc-{row['time']}" for row in rows]
        self.insert_json_rows("raw_btc_klines_4h", rows, row_ids=row_ids)

    def insert_raw_b3(self, rows: list[dict[str, Any]]) -> None:
        row_ids = [f"b3-{row['ticker']}-{row['date']}" for row in rows]
        self.insert_json_rows("raw_b3_daily", rows, row_ids=row_ids)

    def insert_feature_rows(self, rows: list[dict[str, Any]]) -> None:
        row_ids = []
        for row in rows:
            identity = row["ts"] if row["ts"] is not None else row["date"]
            row_ids.append(f"feature-{row['asset_type']}-{row['symbol']}-{identity}")
        self.insert_json_rows("features_scores", rows, row_ids=row_ids)

    def has_alert(self, alert_id: str) -> bool:
        query = f"""
            SELECT id
            FROM `{self._table('alerts_sent')}`
            WHERE id = @alert_id
            LIMIT 1
        """
        config = bigquery.QueryJobConfig(
            query_parameters=[bigquery.ScalarQueryParameter("alert_id", "STRING", alert_id)]
        )
        rows = list(self.client.query(query, job_config=config).result())
        return len(rows) > 0

    def insert_alert(self, alert_id: str, symbol: str, signal: str, ts: datetime) -> None:
        self.insert_json_rows(
            "alerts_sent",
            [
                {
                    "id": alert_id,
                    "symbol": symbol,
                    "signal": signal,
                    "ts": ts.isoformat(),
                    "sent_at": datetime.utcnow().isoformat(),
                }
            ],
            row_ids=[alert_id],
        )

    def insert_trade_run(self, row: dict[str, Any]) -> None:
        row_id = f"trade-run-{row.get('run_id')}-{row.get('created_at')}"
        self.insert_json_rows("trade_runs", [row], row_ids=[row_id])

    def insert_trade_orders(self, rows: list[dict[str, Any]]) -> None:
        if not rows:
            return
        row_ids = [f"trade-order-{idx}-{row.get('run_id')}-{row.get('symbol')}-{row.get('created_at')}" for idx, row in enumerate(rows)]
        self.insert_json_rows("trade_orders", rows, row_ids=row_ids)

    def insert_trade_positions(self, rows: list[dict[str, Any]]) -> None:
        if not rows:
            return
        row_ids = [f"trade-position-{idx}-{row.get('symbol')}-{row.get('updated_at')}" for idx, row in enumerate(rows)]
        self.insert_json_rows("trade_positions", rows, row_ids=row_ids)

    def get_latest_feature(self, asset_type: str, symbol: str) -> dict[str, Any] | None:
        query = f"""
            SELECT *
            FROM `{self._table('features_scores')}`
            WHERE asset_type = @asset_type AND symbol = @symbol
            ORDER BY COALESCE(ts, TIMESTAMP(date)) DESC
            LIMIT 1
        """
        config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("asset_type", "STRING", asset_type),
                bigquery.ScalarQueryParameter("symbol", "STRING", symbol),
            ]
        )
        rows = list(self.client.query(query, job_config=config).result())
        if not rows:
            return None
        return dict(rows[0].items())

    def get_previous_feature(self, asset_type: str, symbol: str) -> dict[str, Any] | None:
        query = f"""
            SELECT *
            FROM `{self._table('features_scores')}`
            WHERE asset_type = @asset_type AND symbol = @symbol
            ORDER BY COALESCE(ts, TIMESTAMP(date)) DESC
            LIMIT 1 OFFSET 1
        """
        config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("asset_type", "STRING", asset_type),
                bigquery.ScalarQueryParameter("symbol", "STRING", symbol),
            ]
        )
        rows = list(self.client.query(query, job_config=config).result())
        if not rows:
            return None
        return dict(rows[0].items())

    @staticmethod
    def to_bq_timestamp(value: datetime) -> str:
        return value.isoformat()

    @staticmethod
    def to_bq_date(value: date) -> str:
        return value.isoformat()

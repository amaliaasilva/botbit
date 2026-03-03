# botbit

Sistema de scoring cripto Binance-only com backend FastAPI no Cloud Run, dados quentes em Firestore (realtime para UI), histórico em BigQuery e alertas por e-mail + in-app.

## Arquitetura (baixo custo)

```text
Cloud Scheduler (OIDC)
  ├─ POST /cron/quotes  (*/5 min)  -> Firestore quotes/{symbol}
  └─ POST /cron/score   (0 * * * *) -> BigQuery features_scores + Firestore market_latest/{symbol}

Frontend (Firebase Hosting)
  -> lê apenas Firestore (market_latest + quotes + notifications)
```

## Contrato único de dados (Firestore)

- `market_latest/{symbol}`: `symbol`, `asset_type`, `score`, `regime`, `signal`, `rsi14`, `ema50`, `ema200`, `atr14`, `price_close`, `ts`, `status`, `explanation`, `source`, `computed_at`
- `quotes/{symbol}`: `symbol`, `price`, `change24hPct`, `volume24h`, `updatedAt`, `source`
- `system_status/{job}`: saúde operacional dos crons (`cron_quotes`, `cron_score`)

## Regras de coerência implementadas

- `regime == "Baixa"` -> `signal = "AVOID"` e `score <= 59`
- `signal == "BUY"` só quando `score >= 70`
- indicador inválido/insuficiente -> `status = "INSUFFICIENT_DATA"`
- símbolo é imutável (ex.: `BTCUSDT`) e filtros removem símbolos estáveis/ruins do ranking

## Endpoints backend

- `GET /health`
- `GET /score/btc`
- `GET /public/score/btc`
- `POST /cron/quotes`
- `POST /cron/score`
- `POST /cron/run` (alias para score)

Observação: Cloud Run é privado; chamadas precisam de token OIDC.

## Schedulers ativos

- `botbit-quotes-5m`: `*/5 * * * *` timezone `America/Cuiaba`
- `botbit-score-60m`: `0 * * * *` timezone `America/Cuiaba`

## Frontend

- Dashboard realtime (ranking + cards + preço 24h via `onSnapshot`)
- Gráfico clicável por ativo no dashboard
- Watchlist multi-par Binance
- Notifications com marcação de lida
- Settings com e-mail, score mínimo e frequência de quotes

## Rodar localmente

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8080
```

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

## Validação rápida

```bash
ID_TOKEN=$(gcloud auth print-identity-token)
curl -X POST "https://botbit-api-qh5ljokdma-uc.a.run.app/cron/quotes" -H "Authorization: Bearer ${ID_TOKEN}"
curl -X POST "https://botbit-api-qh5ljokdma-uc.a.run.app/cron/score" -H "Authorization: Bearer ${ID_TOKEN}"
curl -H "Authorization: Bearer ${ID_TOKEN}" "https://botbit-api-qh5ljokdma-uc.a.run.app/health"
```

# Plano de Implantação — Discover + AutoTrade (Binance Only)

## Objetivo

Evoluir o BotBit de ranking de score para plataforma operacional com:

1. **Discover Engine** (scanner Top 50 Binance USDT)
2. **Trade Engine** (execução automática Spot com controles de risco)
3. **Auditoria e rastreabilidade** em BigQuery + Firestore
4. **UX operacional** (Discover, Drill-down, Trading Settings, Positions)

## Princípios de Segurança (P0)

- Segredos **somente** no Secret Manager (`BINANCE_API_KEY`, `BINANCE_API_SECRET`)
- Cloud Run privado + Scheduler OIDC
- Chave Binance com:
  - Spot Trading habilitado
  - **withdrawals desabilitado**
  - IP restriction (após outbound IP fixo)
- Modo `TESTNET` obrigatório por padrão
- `LIVE` só com feature flag explícita e checklist aprovado

## Segredos e Acesso

### Secrets

- `BINANCE_API_KEY`
- `BINANCE_API_SECRET`

### IAM

- Service Account do Cloud Run: `roles/secretmanager.secretAccessor`

### Comandos (preencher localmente)

```bash
printf "%s" "<BINANCE_API_KEY>" | gcloud secrets versions add BINANCE_API_KEY --data-file=- --project botbit-489114
printf "%s" "<BINANCE_API_SECRET>" | gcloud secrets versions add BINANCE_API_SECRET --data-file=- --project botbit-489114
```

## Arquitetura alvo

```text
Scheduler (OIDC)
  ├─ /cron/quotes     (5m)   -> Firestore quotes/{symbol}
  ├─ /cron/score      (60m)  -> BigQuery features_scores + Firestore market_latest/{symbol}
  ├─ /cron/discover   (6h)   -> Firestore discover_latest + discover_top + discovery_runs
  └─ /cron/trade-run  (5-15m)-> Binance Spot API + BigQuery trade_* + Firestore trading_state

Frontend
  ├─ Dashboard (market_latest + quotes)
  ├─ Discover (discovery_top)
  ├─ Drill-down por ativo
  ├─ Settings > Trading
  └─ Positions
```

## Contratos de Dados

## Firestore

### market_latest/{symbol}

- `symbol` (imutável)
- `asset_type` (`BTC`|`CRYPTO`)
- `score`, `regime`, `signal`
- `rsi14`, `ema50`, `ema200`, `atr14`
- `price_close`, `ts`, `status`, `explanation`, `computed_at`, `source`

### quotes/{symbol}

- `symbol`
- `price`, `change24hPct`, `volume24h`
- `updatedAt`, `source`

### discover_latest/{symbol}

- `symbol`
- `potentialScore`
- `tags[]`
- `explanation`
- `keyMetrics` (`rs_7d`, `rs_30d`, `volume_z`, `corr_btc`, `atr_pct`)
- `computedAt`, `source`

### discover_top/{date}/items/{symbol}

- snapshot do Top 20/50 para leitura rápida no frontend

### discovery_runs/{runId}

- `startedAt`, `finishedAt`, `universeCount`, `candidateCount`, `topCount`, `status`, `errorsCount`

### trading_state/current

- `enabled`, `mode`, `lastRunAt`, `lastError`, `openPositionsCount`, `dailyPnl`

### trading_config/current

- `enabled`, `mode` (`TESTNET`|`LIVE`)
- `maxNotionalPerTradeUSDT`
- `maxOpenPositions`
- `maxTradesPerDay`
- `maxDailyLossUSDT`
- `cooldownMinutes`
- `discoverThreshold`
- `scoreThreshold`
- `emergencyStop`

## BigQuery

- `features_scores` (existente)
- `alerts_sent` (existente)
- `trade_runs`
- `trade_orders`
- `trade_positions`
- (fase 2) `discovery_history`

## Regras de Coerência (já vigentes e obrigatórias)

- Se `regime == Baixa` => `signal=AVOID` e `score<=59`
- `BUY` só com `score>=70`
- Dados insuficientes => `status=INSUFFICIENT_DATA`
- Símbolo regex: `^[A-Z0-9]{3,12}USDT$`

## Discover Engine (P0)

### Universo

- Fonte: `exchangeInfo` + `ticker/24hr`
- Filtros:
  - Spot + `TRADING`
  - Quote `USDT`
  - Excluir stablecoins
  - Liquidez mínima (`quoteVolume`) 
- Ordenar por liquidez e manter Top 50

### Features (4h)

- retorno `24h`, `7d`, `30d`
- `ATR14`, `ATR%`
- `RSI14`
- `EMA50`, `EMA200`, slope EMA50
- distância para máxima 20d/90d
- `volume_z`
- força relativa vs BTC (`rs_7d`, `rs_30d`)
- correlação vs BTC (janela 30d)

### Tags

- `BREAKOUT_VOLUME`
- `SQUEEZE_RELEASE`
- `ROTATION_RS`
- `REVERSAL_SAFE`

### Potential Score

- Base 50, bônus por tags/métricas, penalidades por risco/tendência fraca
- Clamp 0..100
- Explicação curta e auditável

## Trade Engine (P0/P1)

### Regras de entrada

- `potentialScore >= discoverThreshold`
- `signal == BUY`
- `regime == Alta`

### Regras de saída

- `signal == AVOID`
- `stop-loss` ou `take-profit`

### Controles de risco

- `maxNotionalPerTradeUSDT`
- `maxOpenPositions`
- `maxTradesPerDay`
- `maxDailyLossUSDT`
- `cooldown per symbol`

### Execução Binance

- `get_account`
- `test_order`
- `place_order`
- `query_order`
- `cancel_order`

## UX / Produto (drill-down)

### Página Discover

- Top 20/50 com score potencial, tags e explicação
- Filtro por tag e score mínimo
- CTA: Add to Watchlist

### Drill-down ao clicar ativo (Watchlist/Discover)

- Preço realtime e variação 24h
- Score/regime/sinal atual + explicação
- Tags do discover + métricas chave
- Gráfico
- Estado de posição (quando houver)

### Trading Settings

- Toggle enabled
- Mode TESTNET/LIVE
- Limites de risco
- Emergency Stop

### Positions

- posições abertas
- entrada, stop, take, pnl, status de ordens

## Schedulers (target)

- `botbit-quotes-5m`
- `botbit-score-60m`
- `botbit-discover-6h`
- `botbit-trade-run-5m` (ou 15m para custo)

Timezone: `America/Cuiaba`

## Plano por fases

### Fase 1 (imediata)

- Discover backend + endpoints
- Persistência Firestore discover
- UI Discover + drill-down inicial

### Fase 2

- Executor Binance assinado (TESTNET)
- Trading config/state
- `cron/trade-run` com dry-run + auditoria BQ

### Fase 3

- LIVE guardrails
- positions completas + notificações de execução
- runbook de operação e incidentes

## O que desfazer/migrar

- Não usar B3/brapi
- Não usar coleção legada `market_scores`
- Não misturar fontes quentes (frontend lê só Firestore)
- Não habilitar LIVE sem 48h testnet estável

## Checklist de Go-Live (obrigatório)

- [ ] Chaves Binance rotacionadas e com IP restriction
- [ ] TESTNET rodando 48h sem violar limites
- [ ] Emergency stop validado
- [ ] Auditoria BQ completa por run/ordem/posição
- [ ] Alertas de falha operacionais configurados

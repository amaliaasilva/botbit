# Sprints de Execução — Discover + AutoTrade

## Sprint 0 (P0 Segurança)

- Secret Manager (Binance key/secret)
- IAM Secret Accessor para Cloud Run
- Contrato Firestore consolidado
- Cloud Run privado + Scheduler OIDC

## Sprint 1 (Discover Engine)

- Endpoint `/cron/discover`
- Persistência `discover_latest`, `discover_top`, `discovery_runs`
- Endpoint `/api/discover` e `/public/discover`
- Página `/discover` com filtros + Add to Watchlist

## Sprint 2 (Trading Core TESTNET)

- Cliente Binance SIGNED (`/api/v3/time`, account/order/test)
- Endpoint `/cron/trade-run`
- `trading_config/current` e `trading_state/current`
- Auditoria BigQuery (`trade_runs`, `trade_orders`, `trade_positions`)

## Sprint 3 (UX Operacional)

- Settings > Trading (enabled/mode/limits/emergency stop)
- Página Positions
- Drill-down avançado no clique da watchlist/discover
- Notificações de execução e falha

## Sprint 4 (LIVE readiness)

- Static outbound IP (Cloud NAT)
- Binance trusted IPs
- 48h Testnet stable
- Go/No-go checklist + rollback plan

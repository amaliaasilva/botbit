# BotBit — Inventário Técnico da Plataforma

> Gerado em: 04/03/2026 | Revisão: auditoria completa front + back + lint

---

## 1. Resultado do Lint

| Ferramenta | Versão | Resultado |
|-----------|--------|-----------|
| Next.js build | 14.x | ✅ 0 erros, 0 warnings |
| Ruff (Python) | latest | ✅ 0 erros (3 imports + 2 variáveis mortas corrigidos) |

---

## 2. Frontend — Páginas

| Rota | Arquivo | Estado | Fonte de Dados |
|------|---------|--------|----------------|
| `/dashboard` | `app/dashboard/page.js` | ✅ Completo | Firestore ranking + `/api/live-quotes` |
| `/trading` | `app/trading/page.js` | ✅ Completo | `/trading/intents`, `/trade/status`, IAExplain |
| `/portfolio` | `app/portfolio/page.js` | ✅ Completo | Firestore state + `/portfolio/balance` |
| `/settings` | `app/settings/page.js` | ✅ Completo | Profile, Trading config, Notifications, LIVE gate |
| `/notifications` | `app/notifications/page.js` | ✅ Completo | Firestore subscribe + filtros tipo/prioridade |
| `/login` | `app/login/page.js` | ✅ Completo | Firebase Auth |
| `/signals` | `app/signals/page.js` | ✅ Implementado | Firestore market_scores (histórico de sinais) |
| `/assets` | `app/assets/page.js` | 🟡 Stub | — |
| `/backtests` | `app/backtests/page.js` | 🟡 Stub | — |
| `/ajuda` | `app/ajuda/page.js` | 🟡 Não auditado | — |
| `/costs` | `app/costs/page.js` | ✅ Corrigido | Redireciona para `/dashboard` |
| `/watchlist` | `app/watchlist/page.js` | ⚠️ Redirect | → `/dashboard?tab=watchlist` |
| `/discover` | `app/discover/page.js` | ⚠️ Redirect | → `/dashboard?tab=discover` |

---

## 3. Frontend — Componentes

| Componente | Arquivo | Usado em |
|-----------|---------|----------|
| `AppShell` | `components/AppShell.js` | Todas as páginas autenticadas |
| `AssetDetailPanel` | `components/AssetDetailPanel.js` | Dashboard |
| `IAExplainPanel` | `components/ui/IAExplainPanel.js` | Trading, Signals |
| `KpiCard` | `components/ui/KpiCard.js` | Portfolio, Dashboard |
| `DataTable` | `components/ui/DataTable.js` | Trading, Signals |
| `Sparkline` | `components/ui/Sparkline.js` | Dashboard |
| `Badge` | `components/ui/Badge.js` | Múltiplos |
| `Button` | `components/ui/Button.js` | Múltiplos |
| `Card` | `components/ui/Card.js` | Múltiplos |
| `CommandStrip` | `components/ui/CommandStrip.js` | Dashboard |
| `Tabs` | `components/ui/Tabs.js` | Settings, Signals |
| `Toast` | `components/ui/Toast.js` | Settings |
| `ModeBanner` | `components/ui/ModeBanner.js` | AppShell |

---

## 4. Frontend — lib/

### `lib/backend.js` — Funções exportadas

| Função | Endpoint chamado | Usado em |
|--------|-----------------|----------|
| `fetchBtcScore()` | `GET /score/btc` | ❌ Não usado em nenhuma página |
| `fetchB3Score(ticker)` | `GET /score/b3/{ticker}` | ❌ Não usado |
| `fetchPortfolio()` | `GET /portfolio` | ✅ Portfolio |
| `fetchBalance(account)` | `GET /portfolio/balance` | ✅ Portfolio |
| `fetchTradeStatus()` | `GET /trade/status` | ✅ Trading |
| `fetchTradeIntents(params)` | `GET /trading/intents` | ✅ Trading |
| `triggerEmergencyStop()` | `POST /api/trading/emergency-stop` | ✅ Trading |
| `fetchLiveQuotes(symbols)` | `GET /api/live-quotes` | ✅ Dashboard |
| `fetchExplain(symbol)` | `GET /api/explain/{symbol}` | ✅ Trading, Signals |
| `fetchBinanceValidate()` | `POST /internal/binance/validate` | ✅ Settings |
| `fetchExecutorApiStatus()` | `GET /internal/executor/status` | ✅ Settings |
| `fetchLiveGateStatus()` | `GET /api/trading/live-gate-status` | ✅ Settings |
| `triggerAlertTest()` | `POST /api/alerts/test` | ✅ Settings |

### `lib/firestore.js` — Funções exportadas

| Função | Usado em |
|--------|----------|
| `ensureUserDoc` | Login |
| `getUserSettings / updateUserSettings` | Settings |
| `addWatchlistSymbol / removeWatchlistSymbol / listWatchlist / subscribeWatchlist` | Dashboard |
| `listNotifications / subscribeNotifications / markNotificationRead` | Notifications |
| `listMarketScores / listDiscoverScores / listMarketRanking / listDiscoverLatest` | Dashboard, Signals |
| `subscribeDiscoverLatest / subscribeMarketRanking / subscribeQuotes` | Dashboard |
| `subscribeTradingConfig / subscribeTradingState / subscribeTradingPositions / subscribeTradingOrders` | Portfolio, Settings |
| `updateTradingConfig / emergencyStopTrading` | Settings, Trading |
| `subscribeExecutorStatus / subscribePendingIntents` | Settings |
| `subscribeScoreUniverse` | ❌ Não usado em nenhuma página |
| `subscribeDiscoverSettings` | ❌ Não usado |
| `subscribeSystemStatus` | ❌ Não usado |

---

## 5. Backend — Endpoints

### Públicos (sem auth)
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/health` | Health check |
| GET | `/public/score/btc` | Score BTC público |
| GET | `/public/score/b3/{ticker}` | Score B3 público |
| GET | `/public/discover` | Discover público |
| GET | `/public/discover/top` | Top discover |
| GET | `/public/market/top` | Top mercado |
| GET | `/public/quotes/top` | Top quotes |
| GET | `/binance/time` | Timestamp Binance |

### API Autenticados (Firebase JWT)
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/trade/status` | Status do trading |
| GET | `/portfolio` | Portfólio completo |
| GET | `/portfolio/balance` | Saldo Binance |
| GET | `/trading/intents` | Intenções de trade |
| GET | `/api/trading/live-gate-status` | Status dos gates LIVE |
| POST | `/api/alerts/test` | Teste de notificação |
| POST | `/api/trading/emergency-stop` | Parada de emergência |
| POST | `/internal/binance/validate` | Valida keys Binance |
| GET | `/internal/executor/status` | Status executor |
| GET | `/api/explain/{symbol}` | ✅ Auth adicionado |
| GET | `/api/live-quotes` | ✅ Auth adicionado |
| GET | `/api/discover` | ✅ Auth adicionado |

### Cron (protegidos por CRON_SECRET header)
| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/cron/score` | Pipeline de score |
| POST | `/cron/run` | Pipeline principal |
| POST | `/cron/trade-run` | Pipeline de trading |
| POST | `/cron/discover` | Pipeline discover |
| POST | `/cron/quotes` | Pipeline de quotes |

### Internal (sem auth — uso somente interno/VPC)
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/internal/egress-ip` | IP de saída |
| POST | `/internal/binance/testnet/ping` | Ping testnet |
| POST | `/internal/binance/testnet/account` | Conta testnet |

---

## 6. Backend — Módulos

| Arquivo | Responsabilidade | LOC | Observação |
|---------|-----------------|-----|-----------|
| `app/trading.py` | Pipeline de execução de ordens | ~1080 | ⚠️ Candidato a split |
| `app/main.py` | FastAPI routes + handlers | ~750 | Razoável |
| `app/cron.py` | Score pipeline + alertas | ~523 | OK |
| `app/scoring.py` | Score/regime/sinal | ~130 | ✅ Enxuto |
| `app/indicators.py` | Indicadores técnicos | ~100 | ✅ Enxuto |
| `app/discover.py` | Discover pipeline | ~200 | OK |
| `app/auth.py` | Firebase JWT verify | ~50 | ✅ |
| `app/config.py` | Settings + secrets | ~83 | ✅ |
| `app/alerts/appscript_email.py` | Email via AppScript | ~65 | ✅ |
| `app/explain/explainer.py` | IA explain | ~150 | OK |
| `app/sources/binance.py` | Client Binance REST | ~200 | OK |
| `app/sources/binance_trade.py` | Client Binance Trade | ~150 | OK |
| `app/storage/firestore_client.py` | Firestore storage | ~400 | OK |
| `app/storage/bigquery_client.py` | BigQuery storage | ~300 | OK |

---

## 7. Segredos (Secret Manager GCP)

| Secret | Montado no Cloud Run | Usado em |
|--------|---------------------|----------|
| `BINANCE_API_KEY` | ✅ | trading.py |
| `BINANCE_API_SECRET` | ✅ | trading.py |
| `BINANCE_TESTNET_API_KEY` | ✅ | trading.py, testnet |
| `BINANCE_TESTNET_API_SECRET` | ✅ | trading.py, testnet |
| `GCP_PROJECT_ID` | ✅ | config.py |
| `APP_SCRIPT_WEBHOOK_URL` | ✅ | alerts |
| `ALERT_WEBHOOK_TOKEN` | ✅ | alerts |
| `ALERT_OWNER_EMAIL` | ✅ | alerts (múltiplos, vírgula-separado) |
| `FIREBASE_OWNER_UID` | ✅ | cron, trading |
| `CRON_SECRET` | ✅ | cron auth |
| `LIVE_TRADING_ENABLED` | ❌ Não montado | gates only |
| `LIVE_TRADING_ARMED` | ❌ Não montado | gates only |

---

## 8. Tipos de Alerta Ativos

| Tipo | Condição | Email | In-App | Ativo |
|------|----------|-------|--------|-------|
| `BUY` | signal=BUY + score≥70 (BTC) / ≥80 (outros) | ✅ | ✅ | Todos |
| `REGIME_CHANGE` | regime muda | ✅ | ✅ | Todos |
| `SCORE_JUMP` | score sobe ≥10 pts | ✅ | ✅ | Todos |
| `NEAR_ENTRY` | score 60-69 + regime Alta | — | ✅ | Todos |
| `TRADE_EXECUTED` | ordem BUY executada | ✅ | ✅ | Trading |
| `POSITION_EXIT` | posição encerrada | ✅ | ✅ | Trading |
| `STOP_HIT` | stop loss acionado | ✅ | ✅ | Trading |
| `TAKE_HIT` | take profit atingido | ✅ | ✅ | Trading |
| `FAILSAFE` | trading desarmado | ✅ | ✅ | Sistema |
| `TEST_ALERT` | teste manual | ✅ | ✅ | Settings |

---

## 9. Infraestrutura

| Serviço | Plataforma | Região | Revisão atual |
|---------|-----------|--------|--------------|
| Backend API | Cloud Run | `southamerica-east1` | `botbit-api-00021-nbz` |
| Frontend | Firebase Hosting | Global CDN | `botbit.web.app` |
| Banco de dados | Firestore | `southamerica-east1` | — |
| Data warehouse | BigQuery | `southamerica-east1` | dataset `botbit` |
| Email alerts | Google AppScript | — | deploy ativo |
| Build CI | Cloud Build | — | automático |

---

## 10. Backlog Priorizado

### 🔴 Alta Prioridade (segurança)
| # | Item | Status |
|---|------|--------|
| S1 | `CRON_SECRET` nos endpoints `/cron/*` | ✅ Implementado |
| S2 | Auth em `/api/explain`, `/api/live-quotes`, `/api/discover` | ✅ Implementado |

### 🟡 Média Prioridade (produto)
| # | Item | Status |
|---|------|--------|
| P1 | Página `/signals` com histórico real de sinais | ✅ Implementado |
| P2 | Página `/costs` funcional (redireciona para dashboard) | ✅ Implementado |
| P3 | Página `/assets` — detalhe de ativos com indicadores | 🔲 Backlog |
| P4 | Página `/backtests` — replay histórico com gráfico | 🔲 Backlog |

### 🟢 Baixa Prioridade (melhorias)
| # | Item | Status |
|---|------|--------|
| M1 | Rate limiting em `/api/live-quotes` | 🔲 Backlog |
| M2 | Email de boas-vindas no `ensureUserDoc` | 🔲 Backlog |
| M3 | Split de `trading.py` (>1000 LOC) | 🔲 Backlog |
| M4 | Remover dead code: `fetchBtcScore`, `fetchB3Score`, `subscribeScoreUniverse` | 🔲 Backlog |
| M5 | Exportação CSV do histórico de sinais | 🔲 Backlog |

---

*Última atualização: 04/03/2026 — botbit-api-00021-nbz*

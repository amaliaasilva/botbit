# STATUS HOJE — BotBit (gerado em 2026-03-04)

Evidências objetivas do estado atual da plataforma.

---

## 1. Mercado (/dashboard tab Mercado)

### De onde vem a lista de 12 ativos?

A lista é **semi-fixa**: combina uma lista _hardcoded_ no código com busca dinâmica da Binance, mas trunca em 12 itens.

#### Trecho exato — `backend/app/cron.py` linhas 203–220

```python
def _resolve_universe(binance: BinanceClient) -> list[str]:
    settings = get_settings()
    discovered: list[str] = []
    try:
        discovered = binance.fetch_top_usdt_symbols(settings.binance_universe_size)
    except Exception as exc:
        log_event(logger, "binance_discovery_error", error=str(exc))

    merged: list[str] = []
    for symbol in [settings.btc_symbol, *settings.binance_symbols, *discovered]:
        normalized = _normalize_symbol(symbol)
        if not _is_supported_symbol(normalized):
            continue
        if normalized in merged:
            continue
        merged.append(normalized)

    return merged[: max(1, settings.binance_universe_size)]
```

#### Trecho exato — `backend/app/config.py` linhas 11–22

```python
btc_symbol: str = os.getenv("BTC_SYMBOL", "BTCUSDT")
binance_universe_size: int = int(os.getenv("BINANCE_UNIVERSE_SIZE", "12"))
default_binance_symbols: str = os.getenv(
    "DEFAULT_BINANCE_SYMBOLS",
    "BTCUSDT,ETHUSDT,BNBUSDT,SOLUSDT,XRPUSDT,ADAUSDT,DOGEUSDT,TRXUSDT,LINKUSDT,AVAXUSDT",
)
discover_top_n: int = int(os.getenv("DISCOVER_TOP_N", "50"))
```

**Mecanismo:**
1. Sempre inclui `BTCUSDT` (hardcoded como `btc_symbol`).
2. Inclui os 10 símbolos da env `DEFAULT_BINANCE_SYMBOLS` (veja acima).
3. Pede à Binance os top N por volume via `fetch_top_usdt_symbols(12)`.
4. Deduplicação: se um símbolo já está no merge, não repete.
5. Trunca em `BINANCE_UNIVERSE_SIZE = 12`.

**Na prática**, como os 10 defaults + BTCUSDT já somam 10 únicos, sobram apenas 2 vagas para "discovered". Isso significa que a lista real varia muito pouco — tipicamente 10 fixos + 2 dinâmicos.

#### Evidência: lista real no Firestore (2026-03-04)

```
market_latest — 12 docs:
 1. ADAUSDT       score= 40  regime=Baixa   signal=AVOID
 2. AVAXUSDT      score= 70  regime=Baixa   signal=AVOID
 3. BNBUSDT       score= 65  regime=Baixa   signal=AVOID
 4. BTCUSDT       score= 65  regime=Baixa   signal=AVOID
 5. DOGEUSDT      score= 35  regime=Baixa   signal=AVOID
 6. ETHUSDT       score= 65  regime=Baixa   signal=AVOID
 7. LINKUSDT      score= 70  regime=Baixa   signal=AVOID
 8. NEARUSDT      score=100  regime=Alta    signal=WAIT
 9. PAXGUSDT      score=100  regime=Neutro  signal=WAIT
10. SOLUSDT       score= 65  regime=Baixa   signal=AVOID
11. TRXUSDT       score= 40  regime=Baixa   signal=AVOID
12. XRPUSDT       score= 45  regime=Baixa   signal=AVOID
```

**Observação:** Os 10 hardcoded estão todos presentes. NEARUSDT e PAXGUSDT são os 2 "dinâmicos" que entraram pela busca por volume. A lista **mudaria** se outros ativos tivessem mais volume que NEAR/PAXG, mas em geral, a lista é **95% estável** porque os 10 defaults dominam.

#### Frontend: como o tab Mercado consome

`frontend/app/dashboard/page.js` linha 141:
```javascript
return subscribeMarketRanking(50, (rows) => { setRanking(rows); setLoading(false); });
```

`frontend/lib/firestore.js` linhas 185–200:
```javascript
export function subscribeMarketRanking(limitSize, onData) {
  const ref = collection(db, "public", "market_top", "items");
  const q = query(ref, orderBy("score", "desc"), limit(...));
  // filtra: asset_type === "CRYPTO" || "BTC", remove stablecoins
}
```

**Fonte do frontend:** collection `public/market_top/items` (subcollection).

---

## 2. Data Lineage (mapa do fluxo)

```
┌──────────────────────────────────────────────────────────────────────────┐
│                           BINANCE API                                    │
└───────┬───────────────┬──────────────────┬──────────────────┬────────────┘
        │               │                  │                  │
        ▼               ▼                  ▼                  ▼
┌───────────────┐ ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐
│ cron/quotes   │ │ cron/score   │  │ cron/discover│  │ cron/trade-run   │
│ (*/5 min)     │ │ (0 * * * *)  │  │ (0 */6 * * *)│  │ (*/5 min)        │
└───┬───────────┘ └───┬──────────┘  └──┬───────────┘  └──┬───────────────┘
    │                 │                │                  │
    │ WRITE           │ WRITE          │ WRITE            │ READ ← config/trading_global
    ▼                 ▼                ▼                  │ READ ← discover_latest
┌──────────────┐ ┌──────────────┐ ┌──────────────┐       │ READ ← market_latest
│quotes/{SYM}  │ │market_latest │ │discover_     │       │ READ ← quotes
│              │ │  /{SYM}      │ │  latest/{SYM}│       │
│public/       │ │              │ │              │       │ WRITE ↓
│quotes_top/   │ │public/       │ │public/       │  ┌────────────────────────┐
│items/{SYM}   │ │market_top/   │ │discover_top/ │  │trading_state/current   │
└──────────────┘ │items/{SYM}   │ │items/{SYM}   │  │trading_positions/{SYM} │
                 └──────────────┘ └──────────────┘  │trading_orders/{ID}     │
                                                    │trade_intents/{ID}      │
                                                    └────────────────────────┘
         ┌──────────────────────────────────────────┐
         │             FRONTEND PAGES                │
         ├──────────────────────────────────────────┤
         │ Dashboard/Mercado → subscribeMarketRanking()  │
         │   ← public/market_top/items                   │
         │                                               │
         │ Dashboard/Discover → subscribeDiscoverLatest() │
         │   ← public/discover_top/items                 │
         │                                               │
         │ Todas as tabs → subscribeQuotes()             │
         │   ← public/quotes_top/items                   │
         │                                               │
         │ Trading → subscribeTradingState()              │
         │   ← trading_state/current                     │
         │   ← trading_positions, trading_orders          │
         │   ← trade_intents                             │
         │                                               │
         │ Watchlist → subscribeWatchlist()               │
         │   ← users/{uid}/watchlist/{SYM}               │
         │   (dados de score/quotes via market_top+quotes)│
         └───────────────────────────────────────────────┘
```

### Nomes exatos das coleções/documents no Firestore

| Collection/Doc | Tipo | Escrito por | Lido por |
|---|---|---|---|
| `public/market_top/items/{SYMBOL}` | subcollection | cron/score | Frontend Mercado |
| `public/discover_top/items/{SYMBOL}` | subcollection | cron/discover | Frontend Discover |
| `public/quotes_top/items/{SYMBOL}` | subcollection | cron/quotes | Frontend (todas as tabs) |
| `market_latest/{SYMBOL}` | document | cron/score | Backend (trading, explain) |
| `discover_latest/{SYMBOL}` | document | cron/discover | Backend (trading) |
| `quotes/{SYMBOL}` | document | cron/quotes | Backend (trading) |
| `discover_top/{date}/items/{SYMBOL}` | subcollection | cron/discover | — (histórico) |
| `discovery_runs/{runId}` | document | cron/discover | — (auditoria) |
| `config/trading_global` | document | UI Settings | Backend (trading) |
| `config/alerts` | document | Bootstrap | Backend (alertas) |
| `trading_state/current` | document | cron/trade-run | Frontend Trading |
| `trading_state/daily_{date}` | document | cron/trade-run | Backend (contadores) |
| `trading_positions/{SYMBOL}` | document | cron/trade-run | Frontend Portfolio/Trading |
| `trading_orders/{orderId}` | document | cron/trade-run | Frontend Trading |
| `trade_intents/{intentId}` | document | cron/trade-run | Executor externo + Frontend |
| `users/{uid}/watchlist/{SYMBOL}` | subcollection | Frontend | Frontend Watchlist |
| `users/{uid}/notifications/{id}` | subcollection | Backend (_notify) | Frontend Notifications |
| `system_status/{jobName}` | document | Cron jobs | Backend (/health) |
| `alerts_sent/{hash}` | document | Backend | Backend (dedup) |
| `locks/trade_run_current` | document | cron/trade-run | cron/trade-run (lock) |
| `executor_heartbeat/current` | document | Executor externo | Frontend Settings |

**NÃO existem:**
- `market_universe/current` ❌
- `market_ranking/current` ❌

---

## 3. Firestore: evidência objetiva (output real de 2026-03-04)

### market_latest — 12 docs

```
doc.id=ADAUSDT    symbol=ADAUSDT    score=40   regime=Baixa   signal=AVOID   ts=2026-03-04T00:00:00+00:00
doc.id=AVAXUSDT   symbol=AVAXUSDT   score=70   regime=Baixa   signal=AVOID   ts=2026-03-04T00:00:00+00:00
doc.id=BNBUSDT    symbol=BNBUSDT    score=65   regime=Baixa   signal=AVOID   ts=2026-03-04T00:00:00+00:00
doc.id=BTCUSDT    symbol=BTCUSDT    score=65   regime=Baixa   signal=AVOID   ts=2026-03-04T00:00:00+00:00
doc.id=DOGEUSDT   symbol=DOGEUSDT   score=35   regime=Baixa   signal=AVOID   ts=2026-03-04T00:00:00+00:00
doc.id=ETHUSDT    symbol=ETHUSDT    score=65   regime=Baixa   signal=AVOID   ts=2026-03-04T00:00:00+00:00
doc.id=LINKUSDT   symbol=LINKUSDT   score=70   regime=Baixa   signal=AVOID   ts=2026-03-04T00:00:00+00:00
doc.id=NEARUSDT   symbol=NEARUSDT   score=100  regime=Alta    signal=WAIT    ts=2026-03-04T00:00:00+00:00
doc.id=PAXGUSDT   symbol=PAXGUSDT   score=100  regime=Neutro  signal=WAIT    ts=2026-03-04T00:00:00+00:00
doc.id=SOLUSDT    symbol=SOLUSDT    score=65   regime=Baixa   signal=AVOID   ts=2026-03-04T00:00:00+00:00
doc.id=TRXUSDT    symbol=TRXUSDT    score=40   regime=Baixa   signal=AVOID   ts=2026-03-04T00:00:00+00:00
doc.id=XRPUSDT    symbol=XRPUSDT    score=45   regime=Baixa   signal=AVOID   ts=2026-03-04T00:00:00+00:00
```

- Campo `symbol` **existe em todos** os docs E o símbolo está no `doc.id`.
- São exatamente **12** docs — correspondem ao `BINANCE_UNIVERSE_SIZE=12`.

### discover_latest — 50 docs

```
3 exemplos: AAVEUSDT (potentialScore=30), AIXBTUSDT (73), BARDUSDT (65)
```

Total: **50 docs** — corresponde a `DISCOVER_TOP_N=50`.

### quotes — 12 docs

```
3 exemplos: BTCUSDT (price=67982.01), ETHUSDT (1965.55), SOLUSDT (86.43)
```

Exatamente os mesmos 12 da market_latest (compartilham o `_resolve_universe()`).

### Docs especiais

| Path | Existe? |
|---|---|
| `market_universe/current` | **NÃO** ❌ |
| `market_ranking/current` | **NÃO** ❌ |
| `config/trading_global` | **SIM** ✅ |
| `trading_state/current` | **SIM** ✅ |

---

## 4. Scheduler: evidência objetiva

### Jobs ativos (Cloud Scheduler, region us-central1)

| Job ID | Schedule | State | Target | lastAttempt | nextRun |
|---|---|---|---|---|---|
| `botbit-quotes-5m` | `*/5 * * * *` | ENABLED | `/cron/quotes` | 2026-03-04 00:45:20 UTC | 2026-03-04 00:50:04 UTC |
| `botbit-score-60m` | `0 * * * *` | ENABLED | `/cron/score` | 2026-03-04 00:01:06 UTC | 2026-03-04 01:00:02 UTC |
| `botbit-discover-6h` | `0 */6 * * *` | ENABLED | `/cron/discover` | 2026-03-03 22:00:56 UTC | 2026-03-04 04:00:00 UTC |
| `botbit-trade-5m` | `*/5 * * * *` | ENABLED | `/cron/trade-run` | 2026-03-04 00:45:17 UTC | 2026-03-04 00:50:04 UTC |
| `botbit-cron-daily` | `0 10 * * *` | ENABLED | `/cron/run` (alias de score) | nunca rodou | 2026-03-04 10:00:00 UTC |
| `botbit-validate-now` | `0 0 1 1 *` (anual) | ENABLED | `/internal/binance/validate` | 2026-03-03 19:19:46 UTC | 2027-01-01 00:00:00 UTC |

### Mapeamento Job → Collections escritas

| Job | Frequência | Collection escrita |
|---|---|---|
| `botbit-quotes-5m` | a cada 5 min | `quotes/{SYM}`, `public/quotes_top/items/{SYM}`, `system_status/cron_quotes` |
| `botbit-score-60m` | a cada hora | `market_latest/{SYM}`, `public/market_top/items/{SYM}`, `system_status/cron_score`, BigQuery `feature_rows` |
| `botbit-discover-6h` | a cada 6 horas | `discover_latest/{SYM}`, `public/discover_top/items/{SYM}`, `discover_top/{date}/items/{SYM}`, `discovery_runs/{id}` |
| `botbit-trade-5m` | a cada 5 min | `trading_state/current`, `trading_positions/{SYM}`, `trading_orders/{ID}`, `trade_intents/{ID}`, `locks/trade_run_current`, BigQuery `trade_runs/orders/positions` |

---

## 5. Trading: fonte das operações

### Qual universo é usado para decidir trades?

```python
# backend/app/trading.py linhas 136-142
def _load_universe(config, discover_rows):
    universe_mode = str(config.get("symbolsUniverse") or "DISCOVER_TOP50").upper()
    if universe_mode == "FIXED_LIST":
        fixed = config.get("fixedSymbols") or []
        return [str(item).upper() for item in fixed if str(item).upper().endswith("USDT")]
    return [str(row.get("symbol") or "").upper() for row in discover_rows if row.get("symbol")]
```

### Config atual (Firestore `config/trading_global`):

```
symbolsUniverse: DISCOVER_TOP50
fixedSymbols: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT']  ← usado apenas se symbolsUniverse=FIXED_LIST
mode: LIVE
enabled: True
maxOpenPositions: 1
maxTradesPerDay: 1
```

**Hoje o trading usa DISCOVER_TOP50**, que lê os 50 símbolos de `discover_latest`.
Porém, os filtros de entrada são tão restritivos que poucos passam:

```python
# backend/app/trading.py _entry_filter() — filtros atuais:
min_score: 65           # ← config/trading_global.entry.minScore
min_potential: 70       # ← config/trading_global.entry.minPotentialScore
require_regime: "Alta"
require_signal: "BUY"
min_quote_volume: 5M USDT
max_atr_pct: 6.0
```

### Fluxo de decisão trade

```
1. cron/trade-run é chamado (cada 5 min)
2. Lê config/trading_global → mode=LIVE, enabled=True
3. Lê discover_latest (50 docs) → universo de candidatos
4. Lê market_latest (12 docs) → scores e regimes
5. Lê quotes (12 docs) → preços atuais
6. _entry_filter() cruza os 3 datasets:
   - Símbolo deve estar no universo (50 do discover)
   - Deve ter market_latest com score >= 65 E regime == "Alta" E signal == "BUY"
   - Deve ter discover com potentialScore >= 70
   - Volume >= 5M, ATR <= 6%
7. GARGALO: só 12 símbolos têm market_latest (score/regime/signal)
   → dos 50 do discover, apenas 12 podem ser matched (os que têm score no market_latest)
   → os outros 38 nunca passam nos filtros porque não têm score
8. Se candidato passa → verifica maxOpenPositions (1), maxTradesPerDay (1)
9. Calcula notional, qty, stop, take
10. LIVE: escreve trade_intent → executa BUY LIMIT → coloca OCO
```

### GARGALO CRÍTICO IDENTIFICADO

O trading diz usar `DISCOVER_TOP50` (50 ativos), mas só 12 ativos têm score/regime/signal no `market_latest` (escritos pelo `cron/score` que usa `_resolve_universe()` com `BINANCE_UNIVERSE_SIZE=12`). Os outros 38 do discover **nunca poderão ser comprados** porque falham no filtro `score >= 65` (score inexistente).

**Exemplo atual:**
- AIXBTUSDT tem potentialScore=73 no discover → deveria ser candidato
- Mas AIXBTUSDT **não existe** em market_latest → score=None → falha no filtro
- Apenas 12 ativos (os do score pipeline) podem ser matched

---

## 6. Conclusão

### Diagnóstico

**O Mercado (dashboard) hoje é SEMI-FIXO:** 10 dos 12 ativos vêm de uma lista hardcoded em `DEFAULT_BINANCE_SYMBOLS`. Apenas 2 vagas são preenchidas pela busca dinâmica por volume na Binance (hoje: NEARUSDT e PAXGUSDT).

**O Discover é genuinamente dinâmico:** escaneia toda a Binance e seleciona top 50 por volume a cada 6h.

**O Trading tem um gargalo:** configura `DISCOVER_TOP50` (50 ativos) como fonte, mas o score pipeline só calcula score para 12 ativos. Os outros 38 do discover nunca podem entrar numa posição.

**Na prática, o universo efetivo de trading é ≤ 12 ativos**, independente da configuração `DISCOVER_TOP50`.

### 3 Correções mínimas

1. **Alinhar o universo do Score com o do Discover** — Fazer o `cron/score` usar os mesmos 50 do `discover_latest` (ou pelo menos os top 20), em vez de limitar a 12 hardcoded. Assim o `_entry_filter()` do trading consegue cruzar score+potential para todos os candidatos.

2. **Separar visualmente "Mercado" de "Discover" no Dashboard** — Deixar claro na UI que o tab "Mercado" mostra os 12 ativos monitorados com score+regime (universo pequeno, atualizado a cada hora), e "Discover" mostra os top 50 por volume (universo grande, atualizado a cada 6h). Hoje a confusão é que parecem a mesma coisa mas têm fontes diferentes.

3. **Adicionar campo sourceUniverse no trade_intent** — Quando um trade é criado, registrar de onde veio o símbolo (`FIXED_LIST`, `DISCOVER_TOP50`, `MARKET_SCORE`) para rastreabilidade. Hoje não existe esse campo → impossível saber por quê um ativo foi escolhido.

---

## Apêndice: config/trading_global completa (2026-03-04)

```
cooldownHours: 24
enabled: True
entry:
  minQuoteVolume24hUSDT: 5000000
  minPotentialScore: 70
  minScore: 65
  requireSignal: BUY
  requireRegime: Alta
exchange: BINANCE
exit:
  trailAtrMult: 1.2
  timeStopHours: 48
  stopAtrMult: 1.5
  moveStopToBreakevenAtR: 1.0
  useOCO: True
  takeAtrMult: 2.5
fixedSymbols: [BTCUSDT, ETHUSDT, SOLUSDT]
guards:
  excludeStablecoins: True
  symbolRegex: ^[A-Z0-9]{3,12}USDT$
  allowIfIndicatorsInvalid: False
  maxAtrPct: 6.0
liveGuard:
  liveConfirmed: True
  liveConfirmedAt: 2026-03-04T00:47:47.206Z
maxDailyLossPct: 2.5
maxNotionalPerTradePct: 35
maxOpenPositions: 1
maxTradesPerDay: 1
minNotionalUSDT: 10
mode: LIVE
ownerUid: PREENCHER_UID_FIREBASE
paperInitialCashUSDT: 1000
riskPerTradePct: 0.75
symbolsUniverse: DISCOVER_TOP50
timeframe: 4h
```

## Apêndice: trading_state/current (2026-03-04)

```
candidates: 0
cashUSDT: 650.000001
dailyPnlUSDT: 0.0
enabled: False           ← desabilitado no state (embora config.enabled=True, o state guarda shutdown manual)
equityUSDT: 650.000001
executed: 0
exposureUSDT: 0.0
lastRunAt: 2026-03-04 00:45:15 UTC
lastSummary: skipped=0 reason=disabled
mode: LIVE
openPositionsCount: 0
```

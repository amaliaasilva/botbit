# Plano de Implementação — Camada Explain (IA + Aprendizado)

## Objetivo

Adicionar uma camada de explicação didática ao BotBit para responder:

- por que o bot marcou `AVOID`, `WAIT` ou `BUY`
- por que comprou/vendeu (quando houver execução)
- o que precisa mudar para virar compra

A camada **não decide nem executa trades**. Ela apenas explica o que o motor determinístico já decidiu.

## Resultado de Produto Esperado

- O usuário entende o motivo da decisão em linguagem simples (leigo)
- O usuário pode expandir para nível intermediário e técnico
- Cada decisão importante vira registro auditável (Firestore e opcional BigQuery)
- O sistema mantém confiabilidade via fallback determinístico quando IA falhar

## Princípios

1. **Motor manda, IA explica**
2. **Fatos primeiro**: IA recebe somente métricas e regras já calculadas
3. **JSON estrito**: saída validada antes de persistir
4. **Sem alucinação**: se citar dado/indicador inexistente, descarta e usa fallback
5. **Controle de custo**: gerar explicação apenas em eventos relevantes + budget diário
6. **Didática progressiva**: padrão leigo com expansão para níveis mais técnicos

## Escopo Funcional

### Backend

- Novo módulo de explicação: `backend/app/explain/explainer.py`
- Geração de explicação por evento relevante
- Validação anti-alucinação + fallback determinístico
- Cache por chave de contexto para evitar regeneração
- Persistência em Firestore e opcionalmente BigQuery

### Frontend

- Botão `Por quê?` no card/ranking
- Drawer/modal com 3 abas:
  - Resumo (LEIGO)
  - Detalhes (INTERMEDIARIO)
  - Regras (TECNICO)
- Feed de notificações com resumo explicativo
- Toggle `Modo aprendizado` em Settings
- Tooltip/glossário para EMA/RSI/ATR/Regime/Stop

## Configuração (Firestore)

Criar/usar documento `config/explain`:

```json
{
  "enabled": true,
  "levelDefault": "LEIGO",
  "learningMode": true,
  "dailyLessonEnabled": true,
  "maxGenerationsPerDay": 50,
  "model": "vertex-gemini",
  "temperature": 0.2,
  "maxTokens": 350,
  "generateOnEvents": {
    "signalFlip": true,
    "scoreJump": true,
    "tradeExecuted": true,
    "stopTakeTriggered": true
  }
}
```

## Eventos que Disparam Explicação

Gerar explicação **somente** quando houver pelo menos um evento:

- Flip de sinal (`WAIT -> BUY`, `BUY -> AVOID`, etc.)
- Salto de score (`|score_novo - score_anterior| >= 10`)
- Trade executado
- Stop-loss ou take-profit acionado

## Contrato de Entrada (fatos do motor)

```json
{
  "symbol": "BTCUSDT",
  "timeframe": "4h",
  "ts": "2026-03-03T10:00:00Z",
  "score": 65,
  "regime": "Baixa",
  "signal": "AVOID",
  "features": {
    "close": 347000,
    "ema50": 360000,
    "ema200": 410000,
    "rsi14": 54.1,
    "atr14": 8200,
    "atrPct": 2.36,
    "ret_24h": -1.2,
    "ret_7d": -4.8,
    "volumeZ": 0.4
  },
  "rulesTriggered": [
    "PRICE_BELOW_EMA50",
    "EMA50_BELOW_EMA200",
    "REGIME_BAIXA"
  ],
  "whatWouldChange": [
    "close_above_ema50_n_candles",
    "ema50_positive_slope",
    "score>=70",
    "regime!=Baixa"
  ],
  "riskControls": {
    "stop": 0.03,
    "take": 0.06,
    "maxDailyLossPct": 1.5,
    "maxTradesPerDay": 6
  }
}
```

## Contrato de Saída (JSON rígido)

```json
{
  "level": "LEIGO",
  "decisionOneLiner": "AVOID: tendência principal ainda fraca para compra com segurança.",
  "reasons": [
    {
      "label": "Preço abaixo da média curta",
      "plain": "O preço ainda está abaixo da EMA50, sinal de fraqueza no curto prazo.",
      "evidence": "close < ema50"
    },
    {
      "label": "Tendência maior negativa",
      "plain": "A EMA50 está abaixo da EMA200, mostrando estrutura de baixa.",
      "evidence": "ema50 < ema200"
    },
    {
      "label": "Regime defensivo",
      "plain": "Com regime em baixa, o bot prioriza proteção em vez de entrada.",
      "evidence": "regime = Baixa"
    }
  ],
  "whatToSeeNext": [
    "Preço acima da EMA50 por X candles",
    "EMA50 com inclinação positiva",
    "Score >= 70 com regime diferente de Baixa"
  ],
  "riskNote": "Volatilidade pode causar repiques curtos sem reversão real.",
  "miniLesson": {
    "term": "EMA",
    "explain": "EMA é uma média que acompanha mais de perto os preços recentes.",
    "analogy": "É como uma linha de tendência que reage mais rápido às curvas da estrada.",
    "whyItMatters": "Ajuda a diferenciar força (preço acima) de fraqueza (preço abaixo)."
  },
  "confidence": "medium",
  "disclaimer": "Explicação educacional baseada em regras e indicadores; não é recomendação financeira."
}
```

## Protocolo Anti-Alucinação

Validar no backend antes de gravar:

1. JSON válido e campos obrigatórios presentes
2. `reasons[].evidence` só referencia campos existentes no input
3. Não citar indicadores fora do conjunto permitido (EMA, RSI, ATR, tendência, regime, stop, take, volatilidade)
4. Não inventar números não presentes no input
5. Limite de tamanho (texto curto e objetivo)

Se qualquer validação falhar:

- marcar resultado como inválido
- usar fallback determinístico (template)
- persistir flag de fallback para auditoria

## Fallback Determinístico (sempre disponível)

Implementar templates para:

- `AVOID`
- `WAIT`
- `BUY`

Cada template deve preencher:

- decisão em 1 linha
- 3 motivos com evidência simples
- condições para mudança de cenário
- risco principal
- mini-aula rotativa (deck fixo)

### Deck inicial de mini-aulas

- EMA
- RSI
- ATR
- Regime
- Stop/Take

## Cache e Controle de Custo

- Calcular `explanation_hash = hash(input_json_normalizado)`
- Chave de cache: `(symbol, ts, score, regime, signal, explanation_hash)`
- Reusar explicação quando não houver mudança material
- Aplicar `maxGenerationsPerDay` do `config/explain`
- Registrar contador diário e motivo de bloqueio quando estourar orçamento

## Persistência

### Firestore

- `market_latest/{symbol}.explanation`
- `users/{uid}/notifications/{id}.explanation`

### BigQuery (opcional, recomendado)

Tabela: `market_ai.explanations_history`

Campos sugeridos:

- `ts`, `symbol`, `timeframe`, `score`, `regime`, `signal`
- `event_type`, `input_hash`, `used_fallback`, `model_name`, `latency_ms`
- `explanation_json`

## Integração no Fluxo Atual

1. `cron/score` calcula score/regime/sinal
2. Detecta evento relevante
3. Monta input factual
4. Tenta gerar explicação IA (se habilitado)
5. Valida resposta
6. Se inválida/erro, usa fallback
7. Persiste explicação
8. (Opcional) envia histórico para BigQuery

No `cron/trade-run`, repetir o mesmo processo para eventos de execução/stop/take.

## Plano de Entrega por Fases

### Fase 1 — Núcleo seguro (MVP)

- Estrutura do módulo `explainer.py`
- Contratos de input/output
- Templates determinísticos AVOID/WAIT/BUY
- Gatilhos de geração em `cron/score`
- Persistência em `market_latest`

**Critério de aceite:** explicação didática disponível sem depender de IA externa.

### Fase 2 — IA com guarda-corpo

- Provider Vertex AI (Gemini)
- Prompt com saída JSON estrita
- Validador anti-alucinação
- Fallback automático em erro/invalidação
- Cache + budget diário

**Critério de aceite:** IA só publica quando passar validação; caso contrário, fallback.

### Fase 3 — UX aprendizado

- Botão `Por quê?` no card/ranking
- Drawer com níveis LEIGO/INTERMEDIARIO/TECNICO
- Resumo no feed de notificações
- Toggle `Modo aprendizado` em Settings
- Glossário contextual

**Critério de aceite:** usuário leigo entende “por que” e “o que precisa mudar” em até 40s.

### Fase 4 — Auditoria e otimização

- Histórico em BigQuery
- Métricas de qualidade (fallback rate, latência, custo por dia)
- Ajuste de prompt e templates

**Critério de aceite:** rastreabilidade completa e custo controlado.

## Definição de Pronto (DoD)

- Explicações presentes para eventos relevantes
- Linguagem leiga por padrão, com expansão técnica
- Nenhuma decisão de trade depende da IA
- Validador bloqueando respostas fora do contrato
- Fallback funcionando em 100% das falhas da IA
- Configuração operacional via `config/explain`
- Frontend exibindo explicações sem quebrar a UI atual

## Riscos e Mitigações

- **Risco:** custo alto de geração
  - **Mitigação:** gatilhos, cache, budget diário, texto curto
- **Risco:** explicação incorreta/alucinada
  - **Mitigação:** validação rígida + fallback determinístico
- **Risco:** UX complexa para leigo
  - **Mitigação:** nível LEIGO como padrão e conteúdo em blocos curtos
- **Risco:** impacto em latência de cron
  - **Mitigação:** timeout curto, fallback imediato, não bloquear pipeline principal

## Próximas Ações Imediatas

1. Criar módulo `backend/app/explain/` com templates e validador
2. Integrar geração no `cron/score`
3. Persistir em `market_latest/{symbol}.explanation`
4. Exibir `Por quê?` no frontend (aba Resumo)
5. Evoluir para IA externa apenas após MVP estável

---

## Implantação AutoTrade BALANCEADO (Binance Spot)

Este plano de explain passa a operar em conjunto com o executor de trade com foco em segurança operacional:

- backend é único executor de ordens
- frontend altera apenas configuração/kill switch
- segredos apenas no Secret Manager
- trilho de execução com lock idempotente e fail-safe automático

### Arquitetura de execução integrada

```text
Scheduler OIDC
  ├─ /cron/quotes (5m)
  ├─ /cron/discover (6h)
  ├─ /cron/score (60m)
  └─ /cron/trade-run (5m)

Trade-run
  1) lock lease Firestore
  2) carrega config/trading_global + alerts
  3) reconcilia posições/saídas (stop/take/trailing/time-stop)
  4) avalia entradas balanceadas
  5) executa por modo (PAPER/TESTNET/LIVE)
  6) audita em BigQuery + trading_state + notifications
```

### Contratos JSON operacionais

#### Entrada de configuração oficial

Documento: `config/trading_global`

- `enabled`, `mode`, `ownerUid`, `symbolsUniverse`, `fixedSymbols`, `timeframe`
- limites BALANCEADO: `maxOpenPositions=2`, `maxTradesPerDay=2`, `riskPerTradePct=0.75`, `maxDailyLossPct=2.5`, `maxNotionalPerTradePct=35`, `cooldownHours=24`
- bloco `entry`: minScore=70, minPotential=75, regime/sinal exigidos
- bloco `exit`: OCO/stop/take/trailing/time-stop
- bloco `guards`: regex de símbolo, ATR máximo e validações
- bloco `liveGuard`: confirmação dupla e cooldown pré-LIVE

Documento: `config/alerts`

- `emailEnabled`, `inAppEnabled`, `cooldownMinutes`, `types.*`

#### Saída operacional

Documento: `trading_state/current`

- `enabled`, `mode`, `lastRunAt`, `lastSummary`, `lastError`, `openPositionsCount`
- `cashUSDT`, `equityUSDT`, `exposureUSDT`, `dailyPnlUSDT`

Coleções auxiliares:

- `trading_positions/{symbol}`
- `trading_orders/{orderId}`
- `locks/trade_run_current`

### Gatilhos de geração de explicação no trade

Além dos gatilhos do score, gerar explicações curtas quando ocorrer:

- entrada executada
- stop/take acionado
- daily loss cut (desarme)
- falha de segurança (OCO/lock/secrets/gate)

### Anti-alucinação e fallback determinístico

No fluxo de trade/explain, aplicar as mesmas regras:

1. validação de JSON e campos obrigatórios
2. evidências só com dados reais de `market_latest`, `discover_latest`, `trading_state`
3. fallback template se IA falhar
4. persistir `used_fallback=true` para auditoria

### Cache, budget e persistência

- cache por `input_hash` para evitar regeneração redundante
- budget diário de gerações (`config/explain.maxGenerationsPerDay`)
- persistência em Firestore + BigQuery (`market_ai.explanations_history` opcional)

### Rollout por fases (segurança -> risco)

1. Rules/Secrets/Default OFF
2. Config unificada `config/*`
3. Endpoints `/portfolio`, `/trade/status`, `/public/*`
4. UI `/portfolio` e `/trading`
5. PAPER real sem chamada de ordem Binance
6. TESTNET lifecycle + OCO fail-safe
7. LIVE gate com double confirm e cooldown
8. NAT/IP fixo + whitelist Binance

### Regra de Ouro operacional

Se qualquer segurança falhar (rules, secrets, lock, OCO, gate LIVE):

- `enabled=false`
- `trading_state/current.lastError` atualizado
- notificação in-app + tentativa de e-mail

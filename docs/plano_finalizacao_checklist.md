# Plano de Finalização e Checklist Canônico - BotBit

## Objetivo
Consolidar a entrega final da plataforma com foco em: UX/UI, explicabilidade da IA, segurança operacional, validação Binance e readiness de Go-Live.

## Diagnóstico Atual (auditoria do estado do código)

### Frontend (UX e Integração)
- **Unificação Settings/Trading/Cost App:** **FEITO**
  - Hub com abas em [frontend/app/settings/page.js](frontend/app/settings/page.js).
  - Rotas antigas redirecionam para settings:
    - [frontend/app/trading/page.js](frontend/app/trading/page.js)
    - [frontend/app/costs/page.js](frontend/app/costs/page.js)
- **Tooltips (i) no Portfolio:** **FEITO (parcialmente alinhado ao texto desejado)**
  - KPIs e colunas com tooltip em [frontend/app/portfolio/page.js](frontend/app/portfolio/page.js).
  - Estilo dos tooltips em [frontend/app/globals.css](frontend/app/globals.css).
- **Contexto IA no Portfolio:** **PARCIAL**
  - Existe bloco de “Contexto IA da decisão” global em [frontend/app/portfolio/page.js](frontend/app/portfolio/page.js).
  - **Falta** explicação por posição (linha expansível/botão “Por quê?” por ativo).
- **Cost App integrado com dados dinâmicos:** **FEITO**
  - Aba de custos em settings consultando `/api/cost-audit` via GET/POST.
- **Mobile responsivo:** **PARCIAL**
  - `table-wrap` com overflow existe.
  - **Falta** transformação para cards em telas pequenas para tabelas críticas.

### Notificações / Explainability
- **Canal in-app (Firestore):** **FEITO**
- **Canal e-mail (Apps Script):** **FEITO (principalmente para fail-safe/P0)**
- **Prioridades P0/P1/P2/P3:** **FEITO no backend**
  - `_notify` com cooldown por prioridade em [backend/app/trading.py](backend/app/trading.py).
- **Dedupe + cooldown anti-spam:** **FEITO**
  - Hash + cooldown em [backend/app/storage/firestore_client.py](backend/app/storage/firestore_client.py).
- **Exibição rica de explanation no frontend de notificações:** **PARCIAL**
  - Página mostra `summary_leigo`.
  - **Falta** renderizar `explanation` em 3 níveis na UI.
- **Configuração avançada de alertas no app (canais por tipo, horário silencioso, cooldown por tipo):** **FALTA**

### Operação Binance / Testes
- **Secrets versionados:** **FEITO**
- **Cloud Run com secretKeyRef latest:** **FEITO**
- **Modo `LIVE_VALIDATE_ONLY`:** **FEITO** em [backend/app/trading.py](backend/app/trading.py).
- **Endpoint `/internal/binance/validate`:** **FEITO** em [backend/app/main.py](backend/app/main.py).
- **Prova canônica de ciclo TESTNET com OCO real:** **FALTA**
  - BigQuery recente mostra tentativas TESTNET sem execução e `MISSING_BINANCE_KEYS` em runs passados.
  - Ordens registradas recentes: apenas PAPER (`NEARUSDT BUY LIMIT PAPER FILLED`).
- **Teste formal do Emergency Stop ponta a ponta (UI → backend abortando run):** **PARCIAL**
  - Botão e atualização de config existem.
  - **Falta** evidência final de abort instantâneo em execução real com logs + run result.

---

## Fase 1: Refatoração Visual e UX (Frontend)
- [x] **Unificação do Hub de Configurações**
  - [x] Trading consolidado como aba “Operacional” em settings.
  - [x] Cost App consolidado como aba “Custos (GCP)” em settings.
  - [x] Rotas antigas redirecionando para settings.
- [ ] **Enriquecimento do Portfolio (Tooltips e IA)**
  - [x] Componente tooltip `(i)` simples em CSS.
  - [x] Tooltips nas métricas globais (Cash, Equity, Exposição, Cash%).
  - [ ] Linha/ação expansível “Decisão da IA” por posição aberta.
  - [ ] Ler e exibir `explanation`/`summary_leigo` específico da posição no Firestore.
- [ ] **Responsividade Mobile avançada**
  - [x] Tabelas com overflow horizontal.
  - [ ] Converter tabelas longas para cards no mobile (Portfolio/Discover/Orders).

## Fase 2: Integração de Dados e Alertas
- [x] **Painel de Custos dinâmico**
  - [x] Leitura de API de custo integrada na aba settings.
- [ ] **Notificações explicativas completas**
  - [x] Lista de notificações com filtros por tipo/prioridade.
  - [ ] Renderizar explicação por níveis (Leigo/Intermediário/Técnico).
  - [ ] Cores/estilo explícitos por severidade P0/P1/P2/P3.

## Fase 3: Testes de Plataforma (TESTNET e LIVE-Validate)
- [ ] **Validação OCO em TESTNET**
  - [ ] Configurar `BINANCE_TESTNET_API_KEY` e `BINANCE_TESTNET_API_SECRET` com versões.
  - [ ] Setar modo global `TESTNET` + `enabled=true` de forma controlada.
  - [ ] Rodar `/cron/trade-run` e comprovar ordens de entrada + OCO na testnet.
  - [ ] Evidenciar no BigQuery: `trade_runs`, `trade_orders` (mode TESTNET, status real).
- [ ] **Teste de Stress do Fail-Safe (Emergency Stop)**
  - [ ] Acionar botão no frontend.
  - [ ] Confirmar `config/trading_global.enabled=false`.
  - [ ] Comprovar que `/cron/trade-run` passa a abortar/skipped corretamente.
- [ ] **LIVE Validate-Only (sem ordem)**
  - [x] Modo implementado no código.
  - [ ] Executar evidência final com OIDC válido e registrar resposta/log `canTrade`.

## Fase 4: Go-Live Controlado
- [ ] Monitoramento celular (instalável/PWA completo).
- [ ] Saldo inicial e limites conservadores (`maxTradesPerDay=1`, `maxOpenPositions=1` nas primeiras 24h).
- [ ] Habilitar LIVE somente após checklist de validação 100% concluído.

---

## Canais e Prioridade (canônico)

### Canais
- **In-app (Firestore):** eventos operacionais e analíticos.
- **E-mail (Apps Script):** por padrão P0 + P1 (ajustável).

### Prioridades
- **P0 (Crítico):** fail-safe, daily loss cut, erro sistêmico, bloqueio de segurança.
- **P1 (Operacional):** trade executado, stop/take, saída por regra.
- **P2 (Analítico):** mudança de sinal/regime, salto de score.
- **P3 (Informativo):** novos candidatos discover, resumos.

### Regras automáticas mínimas
- [x] P0 fail-safe com desarme do trading.
- [x] P1 para execução/saída.
- [ ] P2/P3 completos com regras de trigger de mudança e resumo consolidado.
- [ ] Resumo diário/semanal operacional automatizado.

### Anti-spam
- [x] Dedupe por hash.
- [x] Cooldown por prioridade.
- [ ] Agrupamento de múltiplos eventos em “resumo do run”.

### Estrutura de evento
- [x] Campos principais (`type`, `priority`, `symbol`, `summary_leigo`, `details`, `action_items`, `dedupeHash`, `explanation`).
- [ ] UI exibindo `explanation` de forma navegável por nível.

### Configuração no app (controle de usuário)
- [ ] Canais on/off por tipo e prioridade.
- [ ] Horário silencioso.
- [ ] Cooldown configurável por tipo.
- [ ] Escopo watchlist para alertas P2/P3.

---

## Evidências obrigatórias para encerrar projeto
- [x] Regras Firestore restritivas e publicadas.
- [x] Build frontend estável.
- [x] Deploy frontend concluído.
- [x] Deploy backend com endpoint de validação e modo validate-only.
- [ ] Prova de `/internal/binance/validate` com OIDC válido (`ok`, `canTrade`).
- [ ] Prova de 1 ciclo TESTNET com ordens/OCO (ou justificativa formal de indisponibilidade + validate-only aprovado).
- [ ] Prova de emergency stop ponta a ponta com logs.
- [ ] Capturas finais das telas-chave (desktop + mobile).

---

## Próximo Sprint (ordem recomendada)
1. Implementar “Decisão da IA” por posição no Portfolio (expansível por linha).
2. Exibir `explanation` em 3 níveis na UI de notificações.
3. Completar configuração de alertas (canais por prioridade/tipo + cooldowns).
4. Rodar TESTNET real com evidências de OCO em BigQuery.
5. Executar teste formal de emergency stop com comprovação em logs.
6. Fechar pacote mobile/PWA e checklist de go-live.

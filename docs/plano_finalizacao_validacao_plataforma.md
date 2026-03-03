# Plano de Finalização e Verificação da Plataforma BotBit

## Objetivo
Finalizar a aplicação ponta a ponta (backend, frontend, segurança, operação Binance, observabilidade e custos), com critérios de aceite objetivos para entrada em operação controlada.

## Escopo de Fechamento
- Frontend operacional e legível (desktop e mobile), com contexto explicativo para métricas críticas.
- Backend com modos PAPER, TESTNET e LIVE_VALIDATE_ONLY/LIVE, incluindo fail-safe e trilha de auditoria.
- Segurança de acesso estrita (somente usuários autorizados no Firestore + endpoints protegidos no Cloud Run).
- Integração Binance validada sem risco indevido (preferência TESTNET).
- Evidências objetivas em logs, Firestore e BigQuery.

## Critérios de Aceite Gerais
- Nenhum erro crítico de build/deploy.
- Regras de acesso bloqueando usuários não autorizados.
- Fluxo principal funcional: Dashboard → Discover/Watchlist → Trading config → Trade run → Portfolio/Orders.
- Auditoria mínima presente em BigQuery (`trade_runs`, `trade_orders`, `trade_positions`).
- Custos visíveis na aba Cost App em Settings.

## TODO List Completa (Finalização)

### A. Segurança e Acesso
- [x] Restringir Firestore para allowlist de usuários autorizados (2 e-mails definidos).
- [x] Garantir bloqueio explícito para qualquer outro usuário autenticado.
- [ ] Validar em sessão real: usuário permitido acessa; usuário terceiro recebe `permission-denied`.
- [ ] Revisar claims de `email_verified` nas duas contas autorizadas.

### B. Binance e Operação
- [x] Garantir versões de secrets `BINANCE_API_KEY` e `BINANCE_API_SECRET` no Secret Manager.
- [x] Garantir Cloud Run consumindo secrets via `secretKeyRef: latest`.
- [x] Implementar endpoint interno de validação Binance (`/internal/binance/validate`).
- [x] Implementar modo `LIVE_VALIDATE_ONLY` (sem envio de ordens).
- [ ] Executar validação autenticada do endpoint com OIDC de serviço e registrar prova de `ok/canTrade`.
- [ ] Se disponível, configurar TESTNET keys dedicadas e executar 1 ciclo controlado em TESTNET.
- [ ] Caso TESTNET indisponível, executar ciclo em `LIVE_VALIDATE_ONLY` e comprovar `trade_run` como validação.

### C. Frontend UX e Integração
- [x] Integrar navegação de Trading e Cost App dentro de Settings por abas.
- [x] Ajustar destaque de aba ativa por query string na navegação lateral.
- [x] Adicionar explicações `(i)` em Portfolio (KPIs e colunas).
- [x] Adicionar seção “Contexto IA da decisão” em Portfolio.
- [ ] Validar usabilidade mobile das telas críticas (Dashboard, Watchlist, Discover, Settings, Portfolio).
- [ ] Revisar textos finais de microcopy para clareza não técnica.

### D. Qualidade e Validação Técnica
- [ ] Rodar build do frontend (`next build`) sem erros.
- [ ] Rodar validação de sintaxe backend (`py_compile`) após alterações finais.
- [ ] Verificar logs de Cloud Run sem erro 5xx recorrente nos endpoints críticos.
- [ ] Verificar Scheduler jobs principais (`quotes`, `score`, `discover`, `trade-run`) com status saudável.

### E. Dados, Auditoria e Evidências
- [ ] Coletar prova dos secrets versionados (somente metadados, sem valores).
- [ ] Coletar resposta/prova do validate Binance (JSON ou log estruturado).
- [ ] Coletar execução de 1 ciclo controlado (`/cron/trade-run`).
- [ ] Coletar query de BigQuery com novas linhas em `trade_runs`.
- [ ] Coletar query de BigQuery com novas linhas em `trade_orders` e `trade_positions`.

### F. Go-Live Controlado
- [ ] Confirmar gate de LIVE: double-confirm + cooldown + limits conservadores.
- [ ] Configurar ramp-up 24h: `maxTradesPerDay=1`, `maxOpenPositions=1`.
- [ ] Definir janela de observação e checklist de rollback (emergency stop + disable trading).

## Sequência Recomendada de Execução (Baixo risco → Alto risco)
1. Segurança e acesso (allowlist, bloqueio terceiros, sessão real de validação).
2. Estabilidade técnica (build frontend, validação backend, logs/schedulers).
3. Binance validate-only (sem ordens) com evidências.
4. TESTNET controlado (se disponível) com comprovação em BigQuery.
5. LIVE apenas com gates completos e ramp-up mínimo.

## Evidências que devem ser anexadas ao fechamento
- Saída de `gcloud secrets versions list` (sem payload).
- `gcloud run services describe` mostrando `secretKeyRef`.
- Prova do `/internal/binance/validate` (resposta/log com `ok`, `mode`, `canTrade`).
- Prova de execução `/cron/trade-run`.
- Consultas BigQuery para `trade_runs`, `trade_orders`, `trade_positions`.
- Capturas de tela frontend (Settings/Trading/Cost App e Portfolio com tooltips `(i)`).

## Riscos em Aberto
- Dependência de autenticação OIDC correta para testes internos em Cloud Run privado.
- Possível ausência de chaves TESTNET separadas.
- Diferenças de percepção visual em mobile sem sessão de validação com usuário final.

## Definição de Pronto (DoD)
A aplicação é considerada pronta para fase operacional controlada quando todos os itens críticos de Segurança, Binance Validate, Build/Deploy e Evidências de Auditoria estiverem concluídos e registrados.

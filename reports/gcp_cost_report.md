# GCP Cost Audit - botbit-489114

- Projeto: `botbit-489114`
- Gerado em: `2026-03-03 14:41:20 -04`
- Timezone de exibição: `America/Cuiaba`

## 1) Status do Billing
- billingEnabled: `True`
- billingAccountName: `billingAccounts/017269-5BDD65-E3B5AD`

## 2) Billing Export no BigQuery
- Existe export de Billing no BigQuery: `não`
- Dataset de export detectado: `billing_export_botbit`
- Status provável: `configurado, aguardando criação/população da tabela de export`.
- Próximos passos:
  1. Aguardar ingestão inicial (pode levar algumas horas, em alguns casos até ~24h).
  2. Reexecutar a auditoria periodicamente para detectar tabela `gcp_billing_export_*`.
  3. Após a primeira carga, MTD/forecast passam automaticamente para custo real.

## 3) Custo real e estimativa
- Custo real: `indisponível (sem Billing Export no BigQuery)`
- Estimativa: `PROXY baseada em inventário de recursos e métricas de uso`
- Custo MTD líquido (cost + credits): `indisponível sem export`
- Forecast do mês: `indisponível sem export`
- Últimos 30 dias (rolling) e tendência: `indisponível sem export`

### Inventário coletado
- Cloud Run services: `1`
- Cloud Scheduler jobs: `5`
- BigQuery datasets: `2`
- BigQuery tables: `7`
- Cloud NATs detectados: `0`
- Endereços reservados: `1`
- VPC connectors: `1`

### Métricas (30d, proxy de volume)
| Sinal | Métrica | Volume 30d | Pontos |
| ---|---|---|--- |
| cloud_run_requests | run.googleapis.com/request_count | n/d | 0 |
| cloud_run_container_instances | run.googleapis.com/container/instance_count | n/d | 0 |
| cloud_run_container_cpu | run.googleapis.com/container/cpu/utilizations | n/d | 0 |
| cloud_run_container_memory | run.googleapis.com/container/memory/utilizations | n/d | 0 |
| firestore_reads | firestore.googleapis.com/document/read_count | n/d | 0 |
| firestore_writes | firestore.googleapis.com/document/write_count | n/d | 0 |
| firestore_deletes | firestore.googleapis.com/document/delete_count | n/d | 0 |

## 4) Itens de risco (proxy)
- NAT/egress/network: verificar NAT, IPs estáticos e tráfego externo (alto risco sem detalhamento de custo).
- Cloud Run: requests e uso de CPU/RAM podem escalar custo em picos.
- Firestore: writes/reads crescem com frequência de atualização e automações.
- BigQuery: scans grandes e jobs ad-hoc sem partição elevam consumo.
- Artifact/Storage: retenção de imagens e tráfego de download/pull gera custo cumulativo.

## 5) Top 10 serviços por custo
- `indisponível sem Billing Export`; usar `cost_by_service.csv` como proxy de inventário.

## 6) Recomendações de controle (budget/alerts)
- Criar budget no Billing Account para thresholds absolutos: `10 USD`, `30 USD`, `60 USD`.
- Console (recomendado): Billing > Budgets & alerts > Create budget > Scope no projeto `botbit-489114`.
- Habilitar alertas de anomalia (se disponível no Billing) para spikes de spend diário.
- Checklist mensal: revisar Top serviços/SKUs, egress/NAT, Firestore write rate, queries BigQuery sem partição.

## 7) Execução e validação
- Script executado sem prompts interativos: `bash tools/cost_audit.sh`.
- Artefatos gerados em `reports/`: `gcp_cost_report.md`, `cost_by_day.csv`, `cost_by_service.csv`, `cost_by_sku_top50.csv`.
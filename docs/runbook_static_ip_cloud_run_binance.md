# Runbook — Outbound Static IP para Cloud Run (Binance IP Restriction)

## Objetivo

Garantir que o tráfego de saída do Cloud Run use IP fixo para whitelist na Binance API Key.

## Passos (GCP)

1. Criar VPC dedicada (ou usar existente)
2. Criar Serverless VPC Access Connector
3. Reservar IP externo estático
4. Criar Cloud Router
5. Criar Cloud NAT usando o IP estático reservado
6. Configurar Cloud Run para egress via VPC connector (`all-traffic`)
7. Validar IP de saída via endpoint externo (`ifconfig.me`)
8. Registrar IP na Binance (trusted IPs) e manter withdrawals desabilitado

## Comandos referência

```bash
# exemplo (ajustar nomes/região)
gcloud compute addresses create botbit-nat-ip --region us-central1

gcloud compute routers create botbit-router --network default --region us-central1

gcloud compute routers nats create botbit-nat \
  --router botbit-router \
  --region us-central1 \
  --nat-custom-subnet-ip-ranges=all \
  --nat-external-ip-pool=botbit-nat-ip

gcloud compute networks vpc-access connectors create botbit-conn \
  --region us-central1 \
  --network default \
  --range 10.8.0.0/28

gcloud run services update botbit-api \
  --region us-central1 \
  --vpc-connector botbit-conn \
  --vpc-egress all-traffic
```

## Checklist de segurança

- [ ] API key Binance com Spot Trading only
- [ ] Withdraw desabilitado
- [ ] IP restriction habilitado
- [ ] Testnet validado por 48h

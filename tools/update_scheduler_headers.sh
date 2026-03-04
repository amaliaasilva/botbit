#!/usr/bin/env bash
set -e
SECRET="cron-c4b56c5523797b18dada209f"
BASE="https://botbit-api-273106014373.southamerica-east1.run.app"
SA="botbit-scheduler-sa@botbit-489114.iam.gserviceaccount.com"
LOC="--location=us-central1 --project=botbit-489114"

update() {
  local name=$1 uri=$2
  gcloud scheduler jobs update http "$name" $LOC \
    --uri="$BASE/$uri" --http-method=POST \
    --update-headers="X-Cron-Secret=$SECRET" \
    --oidc-service-account-email="$SA" \
    --oidc-token-audience="$BASE" \
    --quiet >/dev/null 2>&1 && echo "✓ $name" || echo "✗ $name"
}

create_manual() {
  local name=$1 uri=$2 desc=$3
  gcloud scheduler jobs create http "$name" $LOC \
    --schedule="0 0 1 1 *" \
    --uri="$BASE/$uri" --http-method=POST \
    --update-headers="X-Cron-Secret=$SECRET" \
    --oidc-service-account-email="$SA" \
    --oidc-token-audience="$BASE" \
    --description="$desc (disparo manual)" \
    --time-zone="America/Cuiaba" \
    --quiet >/dev/null 2>&1 && echo "✓ criado $name" || echo "✗ $name (já existe?)"
}

echo "=== atualizando jobs existentes ==="
update botbit-validate-now  "internal/binance/validate"
update botbit-quotes-5m     "cron/quotes"
update botbit-discover-6h   "cron/discover"
update botbit-trade-5m      "cron/trade-run"
update botbit-score-60m     "cron/score"
update botbit-cron-daily    "cron/run"

echo ""
echo "=== criando jobs de disparo manual ==="
create_manual botbit-discover-now  "cron/discover"  "Força atualização Discover"
create_manual botbit-score-now     "cron/score"     "Força atualização de Score/Mercado"

echo ""
echo "=== headers finais ==="
for job in botbit-trade-5m botbit-score-60m botbit-cron-daily botbit-discover-now botbit-score-now; do
  H=$(gcloud scheduler jobs describe "$job" $LOC --format="value(httpTarget.headers)" 2>/dev/null)
  echo "$job -> $H"
done

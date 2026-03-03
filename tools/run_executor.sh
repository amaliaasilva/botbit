#!/bin/bash
# Wrapper: busca keys do Secret Manager e roda o executor TESTNET
set -e

PROJECT_ID="${GCP_PROJECT_ID:-botbit-489114}"
echo "[run_executor] Buscando TESTNET keys do Secret Manager (projeto: $PROJECT_ID)..."

export GCP_PROJECT_ID="$PROJECT_ID"
export BINANCE_TESTNET_API_KEY=$(gcloud secrets versions access latest \
    --secret="BINANCE_TESTNET_API_KEY" --project="$PROJECT_ID")
export BINANCE_TESTNET_API_SECRET=$(gcloud secrets versions access latest \
    --secret="BINANCE_TESTNET_API_SECRET" --project="$PROJECT_ID")

if [[ -z "$BINANCE_TESTNET_API_KEY" || -z "$BINANCE_TESTNET_API_SECRET" ]]; then
    echo "[run_executor] ERRO: não foi possível obter as keys do Secret Manager."
    exit 1
fi

echo "[run_executor] Keys obtidas. Iniciando executor..."
cd "$(dirname "$0")/.."
python tools/testnet_executor.py

#!/usr/bin/env python3
"""
Manual test: Score Universe rotation + _resolve_universe + stale cleanup.

Steps:
  1. Write a known config/score_universe_current with 15 symbols
  2. Verify _resolve_universe reads governed universe
  3. Show which market_latest / quotes docs would be considered stale
  4. Optionally clean up the test doc

Run:
  cd /workspaces/botbit
  GCP_PROJECT_ID=botbit-489114 python3 tools/test_universe_rotation.py
"""
import os
import sys
import json
from datetime import datetime

# Allow imports from the backend package
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
os.environ.setdefault("GCP_PROJECT_ID", "botbit-489114")

from app.storage.firestore_client import FirestoreNotificationStorage
from app.config import get_settings

PROJECT = os.environ["GCP_PROJECT_ID"]
fs = FirestoreNotificationStorage(PROJECT)
settings = get_settings()

SEPARATOR = "=" * 60

# ─── 1. Read BEFORE state ────────────────────────────────────────────────────
print(SEPARATOR)
print("STEP 1: Estado ANTES")
print(SEPARATOR)

before_market = {doc.id for doc in fs.client.collection("market_latest").stream()}
before_quotes = {doc.id for doc in fs.client.collection("quotes").stream()}
before_universe = fs.get_score_universe()

print(f"  market_latest : {sorted(before_market)}")
print(f"  quotes        : {sorted(before_quotes)}")
print(f"  score_universe: {'NOT EXISTS' if not before_universe else before_universe.get('symbols', [])[:10]}")

# ─── 2. Write a test Score Universe ──────────────────────────────────────────
print()
print(SEPARATOR)
print("STEP 2: Criando score_universe_current de teste (15 symbols)")
print(SEPARATOR)

# Keep 8 of the current 12, drop 4, add 3 new ones
TEST_SYMBOLS = [
    "BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT",
    "ADAUSDT", "DOGEUSDT", "LINKUSDT",
    # New symbols (not in current market_latest)
    "DOTUSDT", "MATICUSDT", "SHIBUSDT",
    # More
    "UNIUSDT", "ICPUSDT", "LTCUSDT", "ATOMUSDT",
]

fs.upsert_score_universe({
    "symbols": TEST_SYMBOLS,
    "size": len(TEST_SYMBOLS),
    "rotateHours": settings.score_universe_rotate_hours,
    "source": "manual_test",
    "previousSize": 0,
    "added": TEST_SYMBOLS,
    "removed": [],
})

# Verify it was written
verify = fs.get_score_universe()
print(f"  Written OK: {verify is not None}")
print(f"  symbols    : {verify.get('symbols', [])}")
print(f"  size       : {verify.get('size')}")
print(f"  source     : {verify.get('source')}")

# ─── 3. Test _resolve_universe reads the governed universe ───────────────────
print()
print(SEPARATOR)
print("STEP 3: _resolve_universe() agora usa o Score Universe?")
print(SEPARATOR)

from app.cron import _resolve_universe
from app.sources.binance import BinanceClient

binance = BinanceClient()
resolved = _resolve_universe(binance, fs)

print(f"  _resolve_universe returned {len(resolved)} symbols:")
for s in resolved:
    print(f"    {s}")

match = set(resolved) == set(TEST_SYMBOLS)
print(f"  Matches TEST_SYMBOLS? {'SIM ✓' if match else 'NÃO ✗'}")

# ─── 4. Show which docs would be stale ──────────────────────────────────────
print()
print(SEPARATOR)
print("STEP 4: Documentos que seriam limpos (stale)")
print(SEPARATOR)

valid_set = {s.upper() for s in TEST_SYMBOLS}
stale_market = before_market - valid_set
stale_quotes = before_quotes - valid_set

print(f"  Stale market_latest : {sorted(stale_market) if stale_market else '(nenhum)'}")
print(f"  Stale quotes        : {sorted(stale_quotes) if stale_quotes else '(nenhum)'}")

# ─── 5. Clean up: remove the test doc ────────────────────────────────────────
print()
print(SEPARATOR)
print("STEP 5: Limpeza — removendo doc de teste")
print(SEPARATOR)

fs.client.collection("config").document("score_universe_current").delete()
after = fs.get_score_universe()
print(f"  Doc removido? {'SIM ✓' if after is None else 'NÃO ✗'}")

# ─── Summary ─────────────────────────────────────────────────────────────────
print()
print(SEPARATOR)
print("RESUMO DO TESTE")
print(SEPARATOR)
checks = [
    ("score_universe_current gravado", verify is not None),
    ("_resolve_universe lê governed", match),
    ("Stale docs detectados", len(stale_market) > 0 or len(stale_quotes) > 0),
    ("Cleanup OK", after is None),
]
all_ok = True
for label, ok in checks:
    status = "✓ PASS" if ok else "✗ FAIL"
    if not ok:
        all_ok = False
    print(f"  [{status}] {label}")

print()
if all_ok:
    print("  >>> TODOS OS TESTES PASSARAM <<<")
else:
    print("  >>> ALGUM TESTE FALHOU <<<")
print()

#!/usr/bin/env bash
# Runs every scenario on this host; prints one RESULT line per run.
set -u
cd "$(dirname "$0")"
PY=python; command -v python >/dev/null || PY=python3
$PY -m uvicorn server:app --host 127.0.0.1 --port 18765 --log-level warning > server.log 2>&1 &
SRV=$!
for i in $(seq 1 30); do curl -sf http://127.0.0.1:18765/api/ping >/dev/null && break; sleep 1; done
ELECTRON=node_modules/.bin/electron
WRAP=""; FLAGS=""; [ "$(uname -s)" = "Linux" ] && { WRAP="xvfb-run -a"; FLAGS="--no-sandbox"; }
for spec in "orig 8" "fixed 8" "orig 8" "fixed 8" "orig 1" "fixed 1" "fixed 1"; do
  set -- $spec
  echo "=== variant=$1 N=$2"
  VARIANT=$1 N=$2 MP="$PWD/mp-$1.cjs" $WRAP $ELECTRON main.cjs $FLAGS 2>&1 | grep -E "^RESULT|Error|FATAL" | tee -a results.txt
  sleep 3
done
kill $SRV 2>/dev/null
echo "--- server ranges (tail)"; tail -40 server.log

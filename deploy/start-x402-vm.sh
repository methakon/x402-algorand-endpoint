#!/usr/bin/env bash
# Start the x402 endpoint on the Oracle VM under pm2.
#
# Only the PUBLIC payTo address goes here; no signing key is on this host. The
# endpoint builds payment requirements but never custodies customer funds, so a
# funded key has no business being deployed here.
#
# Set PAY_TO in the environment, or edit the default below.
set -euo pipefail
cd ~/x402

PAY_TO="${PAY_TO:?set PAY_TO to the Algorand address that receives USDC}"
PORT="${PORT:-8402}"
FACILITATOR="${X402_FACILITATOR_URL:-https://facilitator.goplausible.xyz}"
PRICE="${X402_PRICE_USDC:-0.02}"

cat > ~/x402/.env <<EOF
X402_PAY_TO=$PAY_TO
X402_PRICE_USDC=$PRICE
X402_FACILITATOR_URL=$FACILITATOR
PORT=$PORT
EOF
chmod 600 ~/x402/.env

pm2 delete x402-endpoint >/dev/null 2>&1 || true

# The server reads its config from the environment, not from .env (there is no
# dotenv dependency), so source it and pass it through to the pm2 process.
set -a
. ~/x402/.env
set +a

pm2 start src/server.js \
  --name x402-endpoint \
  --instances 1 \
  --cwd ~/x402
pm2 save >/dev/null 2>&1

sleep 6
echo "--- health ---"
curl -sS --max-time 10 "http://127.0.0.1:$PORT/healthz" || echo "NOT UP YET"
echo
echo "--- unpaid request (expect 402) ---"
curl -sS -o /dev/null -w "HTTP=%{http_code}\n" --max-time 15 \
  -X POST "http://127.0.0.1:$PORT/api/analyze" \
  -H 'Content-Type: application/json' -d '{"text":"bullish growth"}'
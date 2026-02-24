#!/usr/bin/env sh
# seed.sh — Populates Notiflo with sample data for local development.
# Runs inside the `seed` Docker service (curlimages/curl — no jq available).
#
# Uses slug "default-org" as organizationId everywhere, matching the frontend hooks.

set -eu

API_URL="${API_URL:-http://notiflo-api:3000/api}"
MAX_RETRIES=30
ORG_ID="default-org"

echo "Waiting for API readiness at ${API_URL}/dashboard/engine ..."
i=0
while [ "$i" -lt "$MAX_RETRIES" ]; do
  if curl -sf "${API_URL}/dashboard/engine" > /dev/null 2>&1; then
    echo "API is ready."
    break
  fi
  i=$((i + 1))
  if [ "$i" -eq "$MAX_RETRIES" ]; then
    echo "ERROR: API not ready after ${MAX_RETRIES} retries."
    exit 1
  fi
  sleep 2
done

# Helper: extract _id from JSON response using grep/sed (no jq)
extract_id() {
  echo "$1" | grep -o '"_id":"[^"]*"' | head -1 | sed 's/"_id":"//;s/"//'
}

# --- Organization ---
echo "Creating organization..."
curl -sf -X POST "${API_URL}/organizations" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Default Organization","slug":"default-org"}' > /dev/null
echo "  Organization: ${ORG_ID} (slug: default-org)"

# --- Subscribers ---
echo "Creating subscribers..."
SUB1=$(curl -sf -X POST "${API_URL}/subscribers" \
  -H 'Content-Type: application/json' \
  -d "{\"organizationId\":\"$ORG_ID\",\"externalId\":\"alice-001\",\"name\":\"Alice\",\"email\":\"alice@example.com\"}")
SUB1_ID=$(extract_id "$SUB1")
echo "  Subscriber Alice: $SUB1_ID"

SUB2=$(curl -sf -X POST "${API_URL}/subscribers" \
  -H 'Content-Type: application/json' \
  -d "{\"organizationId\":\"$ORG_ID\",\"externalId\":\"bob-002\",\"name\":\"Bob\",\"email\":\"bob@example.com\"}")
SUB2_ID=$(extract_id "$SUB2")
echo "  Subscriber Bob: $SUB2_ID"

SUB3=$(curl -sf -X POST "${API_URL}/subscribers" \
  -H 'Content-Type: application/json' \
  -d "{\"organizationId\":\"$ORG_ID\",\"externalId\":\"charlie-003\",\"name\":\"Charlie\",\"email\":\"charlie@example.com\"}")
SUB3_ID=$(extract_id "$SUB3")
echo "  Subscriber Charlie: $SUB3_ID"

# --- Connector (Redis Stream) ---
echo "Creating Redis Stream connector..."
curl -sf -X POST "${API_URL}/connectors" \
  -H 'Content-Type: application/json' \
  -d "{\"organizationId\":\"$ORG_ID\",\"name\":\"Local Redis Stream\",\"type\":\"redis_stream\",\"config\":{\"url\":\"redis://redis:6379\",\"streamKey\":\"notiflo:ticks\",\"consumerGroup\":\"notiflo-runtime\"},\"active\":true}" > /dev/null
echo "  Connector: Local Redis Stream"

# --- Alert Conditions (near-threshold for quick crossings) ---
echo "Creating alert conditions..."

# AAPL — ticker sim starts at 195, threshold at 197
curl -sf -X POST "${API_URL}/alerts" \
  -H 'Content-Type: application/json' \
  -d "{\"organizationId\":\"$ORG_ID\",\"subscriberId\":\"$SUB1_ID\",\"symbol\":\"AAPL\",\"strategyType\":\"threshold_crossing\",\"strategyParams\":{\"threshold\":197,\"operator\":\"above\"},\"channels\":[\"webhook\",\"in_app\"],\"name\":\"AAPL above 197\"}" > /dev/null
echo "  Alert: AAPL above 197 (Alice)"

# TSLA — ticker sim starts at 185, threshold at 188
curl -sf -X POST "${API_URL}/alerts" \
  -H 'Content-Type: application/json' \
  -d "{\"organizationId\":\"$ORG_ID\",\"subscriberId\":\"$SUB2_ID\",\"symbol\":\"TSLA\",\"strategyType\":\"threshold_crossing\",\"strategyParams\":{\"threshold\":188,\"operator\":\"above\"},\"channels\":[\"webhook\"],\"name\":\"TSLA above 188\"}" > /dev/null
echo "  Alert: TSLA above 188 (Bob)"

# BTC — ticker sim starts at 68000, threshold at 69000
curl -sf -X POST "${API_URL}/alerts" \
  -H 'Content-Type: application/json' \
  -d "{\"organizationId\":\"$ORG_ID\",\"subscriberId\":\"$SUB1_ID\",\"symbol\":\"BTC\",\"strategyType\":\"threshold_crossing\",\"strategyParams\":{\"threshold\":69000,\"operator\":\"above\"},\"channels\":[\"webhook\",\"in_app\"],\"name\":\"BTC above 69000\"}" > /dev/null
echo "  Alert: BTC above 69000 (Alice)"

# ETH — ticker sim starts at 3800, threshold at 3700
curl -sf -X POST "${API_URL}/alerts" \
  -H 'Content-Type: application/json' \
  -d "{\"organizationId\":\"$ORG_ID\",\"subscriberId\":\"$SUB3_ID\",\"symbol\":\"ETH\",\"strategyType\":\"threshold_crossing\",\"strategyParams\":{\"threshold\":3700,\"operator\":\"below\"},\"channels\":[\"webhook\"],\"name\":\"ETH below 3700\"}" > /dev/null
echo "  Alert: ETH below 3700 (Charlie)"

# NVDA — ticker sim starts at 880, threshold at 890
curl -sf -X POST "${API_URL}/alerts" \
  -H 'Content-Type: application/json' \
  -d "{\"organizationId\":\"$ORG_ID\",\"subscriberId\":\"$SUB2_ID\",\"symbol\":\"NVDA\",\"strategyType\":\"threshold_crossing\",\"strategyParams\":{\"threshold\":890,\"operator\":\"above\"},\"channels\":[\"webhook\"],\"name\":\"NVDA above 890\"}" > /dev/null
echo "  Alert: NVDA above 890 (Bob)"

echo ""
echo "Seed complete: 1 org, 3 subscribers, 1 connector, 5 alerts."
echo "Ticker simulator will generate crossings within ~30 seconds."

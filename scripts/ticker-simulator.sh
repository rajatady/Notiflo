#!/usr/bin/env sh
# ticker-simulator.sh — Generates random-walk tick data and publishes to Redis Stream.
# Runs inside the `ticker` Docker service (redis:7-alpine — ash shell, no bash).
# Prices start near alert thresholds so crossings happen within ~30 seconds.

set -eu

REDIS_HOST="${REDIS_HOST:-redis}"
REDIS_PORT="${REDIS_PORT:-6379}"
STREAM_KEY="${STREAM_KEY:-notiflo:ticks}"
INTERVAL_MS="${INTERVAL_MS:-500}"

# Base prices (near the seed alert thresholds)
AAPL_PRICE=195.00
TSLA_PRICE=185.00
BTC_PRICE=68000.00
ETH_PRICE=3800.00
NVDA_PRICE=880.00

echo "Ticker simulator starting..."
echo "  Redis: ${REDIS_HOST}:${REDIS_PORT}"
echo "  Stream: ${STREAM_KEY}"
echo "  Interval: ${INTERVAL_MS}ms"
echo "  Symbols: AAPL TSLA BTC ETH NVDA"
echo ""

# Wait for Redis
i=0
while [ "$i" -lt 30 ]; do
  if redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" ping 2>/dev/null | grep -q PONG; then
    echo "Redis is ready."
    break
  fi
  i=$((i + 1))
  sleep 1
done

tick_count=0
sleep_sec=$(awk "BEGIN { printf \"%.3f\", $INTERVAL_MS / 1000.0 }")

while true; do
  # Pick a random symbol (0-4)
  idx=$(( $(od -An -N1 -tu1 /dev/urandom) % 5 ))

  case $idx in
    0) symbol="AAPL"; price=$AAPL_PRICE ;;
    1) symbol="TSLA"; price=$TSLA_PRICE ;;
    2) symbol="BTC";  price=$BTC_PRICE ;;
    3) symbol="ETH";  price=$ETH_PRICE ;;
    4) symbol="NVDA"; price=$NVDA_PRICE ;;
  esac

  # Random walk: ±2% (random basis points between -200 and +200)
  change_bps=$(( ($(od -An -N2 -tu2 /dev/urandom) % 401) - 200 ))
  new_price=$(awk "BEGIN { printf \"%.2f\", $price * (1 + $change_bps / 10000.0) }")

  # Update stored price
  case $idx in
    0) AAPL_PRICE=$new_price ;;
    1) TSLA_PRICE=$new_price ;;
    2) BTC_PRICE=$new_price ;;
    3) ETH_PRICE=$new_price ;;
    4) NVDA_PRICE=$new_price ;;
  esac

  timestamp=$(date -u +%s)000

  tick_json="{\"symbol\":\"${symbol}\",\"price\":${new_price},\"timestamp\":${timestamp}}"

  redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" \
    XADD "$STREAM_KEY" '*' data "$tick_json" > /dev/null 2>&1

  tick_count=$((tick_count + 1))
  if [ $((tick_count % 20)) -eq 0 ]; then
    echo "Published $tick_count ticks (latest: $symbol @ $new_price)"
  fi

  sleep "$sleep_sec"
done

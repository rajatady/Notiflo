<p align="center">
  <h1 align="center">Notiflo</h1>
  <p align="center">
    Open-source real-time alerting engine. Evaluate millions of conditions per second, deliver notifications across any channel.
  </p>
</p>

<p align="center">
  <a href="https://github.com/rajatady/Notiflo/actions/workflows/ci.yml"><img src="https://github.com/rajatady/Notiflo/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache%202.0-blue.svg" alt="License"></a>
  <a href="https://www.rust-lang.org/"><img src="https://img.shields.io/badge/rust-1.78%2B-orange.svg" alt="Rust"></a>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> &middot;
  <a href="#use-cases">Use Cases</a> &middot;
  <a href="#features">Features</a> &middot;
  <a href="#architecture">Architecture</a> &middot;
  <a href="CONTRIBUTING.md">Contributing</a>
</p>

---

## What is Notiflo?

Notiflo is a real-time alerting pipeline that lets your users define conditions on streaming data and get notified the moment those conditions are met.

Your app pushes data ticks (price changes, sensor readings, metric values). Notiflo evaluates every active condition in **sub-100 nanoseconds**, then delivers notifications through email, SMS, push, Slack, webhooks, or any channel you configure.

The hot path is written in Rust. The control plane is NestJS. They connect through Redis Streams.

## Use Cases

**Fintech & Trading** -- Users set price alerts on stocks, crypto, or forex pairs. When AAPL crosses $200, notify via push + email instantly.

**Infrastructure Monitoring** -- Engineers define thresholds on CPU, memory, error rates, or custom metrics. When p99 latency exceeds 500ms, fire a PagerDuty webhook and Slack message.

**IoT & Industrial** -- Sensors stream temperature, pressure, or vibration data. Alert operators when readings cross safety thresholds before equipment fails.

**E-commerce** -- Notify shoppers when a watched product drops below their target price. Handle millions of price-watch conditions across your catalog.

**Crypto & DeFi** -- Gas price alerts, liquidity pool threshold notifications, whale movement detection -- all evaluated at wire speed.

## Quick Start

```bash
docker compose up
```

The API is available at `http://localhost:3000`. Create your first alert in 4 steps:

```bash
# 1. Create an organization
curl -s -X POST http://localhost:3000/organizations \
  -H 'Content-Type: application/json' \
  -d '{"name": "My Org", "slug": "my-org"}' | jq '._id'

# 2. Create a subscriber
curl -s -X POST http://localhost:3000/subscribers \
  -H 'Content-Type: application/json' \
  -d '{"organizationId": "<ORG_ID>", "externalId": "user-1", "email": "user@example.com", "channelPreferences": {"email": {"enabled": true}}}'

# 3. Create an alert condition
curl -s -X POST http://localhost:3000/alerts \
  -H 'Content-Type: application/json' \
  -d '{"organizationId": "<ORG_ID>", "subscriberId": "<SUB_ID>", "symbol": "AAPL", "strategyType": "threshold_crossing", "strategyParams": {"threshold": 150, "operator": "cross_above"}, "channels": ["email"], "active": true, "name": "AAPL Price Alert"}'

# 4. Push a tick -- Notiflo evaluates all conditions and delivers matches
redis-cli LPUSH notiflo:ticks '{"symbol":"AAPL","value":160,"timestampUs":1708300000000000}'
```

## Features

### Sub-100ns Condition Evaluation

The Rust engine uses a Drift Sentinel algorithm that evaluates conditions in constant time regardless of how many are active. 1K conditions or 100K conditions -- same latency.

| Metric | Value |
|--------|-------|
| Evaluate latency (1K conditions) | 75ns |
| Evaluate latency (100K conditions) | 73ns |
| Throughput (single thread) | 13.6M evaluations/sec |

### Multiple Evaluation Strategies

| Strategy | When to use |
|----------|-------------|
| `threshold_crossing` | Simple above/below conditions. Sub-100ns via Drift Sentinel. |
| `expression` | Compound conditions like `value > 150 AND volume > 1M`. |
| `script` | Complex logic using Rhai scripting sandbox. |

### Multi-Channel Delivery

| Channel | Providers |
|---------|-----------|
| Email | SendGrid, SMTP |
| SMS | Twilio |
| Push | FCM, APNs |
| Webhook | HTTP POST |
| In-App | Internal store |
| Slack | Slack API |
| WhatsApp | Twilio / WhatsApp Business |

### Built for Production

- **Subscriber preferences** -- Users control which channels they receive alerts on
- **Template engine** -- Handlebars templates with variable interpolation
- **Event logging** -- Every evaluation and delivery is logged to Redis Streams
- **Dashboard API** -- Overview metrics, channel health, delivery rates, engine status
- **Circuit breakers** -- Automatic provider failover when channels degrade

## Architecture

```
  [Data Sources]              notiflo-runtime (Rust)                [Delivery]

  Redis Queue ───────►  Ingest
  WebSocket ─────────►    │
                          ▼
                       Evaluate
                         Drift Sentinel (<100ns)
                         Expression DSL
                         Rhai Script Sandbox
                          │
                          ▼
                       Template Render (Handlebars)
                          │
                          ▼
                       Deliver (HTTP) ──────────►  SendGrid, Twilio,
                          │                        FCM, Slack, Webhook
                          ▼
                       Event Log ──► Redis Streams
                                          │
                                          ▼
                          notiflo-api (NestJS)
                            REST API, Dashboard,
                            Delivery Tracking
                                │
                                ▼
                             MongoDB
```

**notiflo-runtime** (Rust) is the hot path. It ingests data, evaluates conditions, renders templates, delivers notifications, and logs events. It touches no database on the hot path -- conditions are loaded into memory and refreshed periodically.

**notiflo-api** (NestJS) is the control plane. It manages alerts, templates, subscribers, and channels via REST API. It consumes delivery events from Redis Streams for tracking.

## Configuration

### Rust Runtime

| Variable | Default | Description |
|----------|---------|-------------|
| `NOTIFLO_MONGODB_URI` | -- | MongoDB connection string |
| `NOTIFLO_REDIS_URL` | -- | Redis connection string |
| `NOTIFLO_INGEST_TYPE` | `redis` | `redis` or `websocket` |
| `NOTIFLO_REDIS_QUEUE_KEY` | `notiflo:ticks` | Redis list key for tick ingestion |
| `NOTIFLO_WS_URL` | -- | WebSocket endpoint (if websocket ingest) |
| `NOTIFLO_CONFIG_POLL_INTERVAL_MS` | `5000` | How often to reload conditions from MongoDB |
| `NOTIFLO_HEALTH_PORT` | `8080` | Health check port |

### NestJS API

| Variable | Default | Description |
|----------|---------|-------------|
| `MONGODB_URI` | -- | MongoDB connection string |
| `REDIS_URL` | -- | Redis for stream consumption |
| `PORT` | `3000` | HTTP port |

## Self-Hosting

### Docker Compose (recommended)

```bash
docker compose up
```

Starts MongoDB, Redis, the Rust runtime, and the NestJS API.

### Manual

```bash
# Prerequisites: MongoDB 7+, Redis 7+, Rust 1.78+, Node.js 20+

# Start the Rust runtime
NOTIFLO_MONGODB_URI=mongodb://localhost:27017/notiflo \
NOTIFLO_REDIS_URL=redis://localhost:6379 \
  cargo run --release --bin notiflo-runtime

# Start the NestJS API
yarn install
MONGODB_URI=mongodb://localhost:27017/notiflo \
REDIS_URL=redis://localhost:6379 \
  npx nx serve notiflo
```

## Development

```bash
# Rust unit tests
cargo test --workspace --no-default-features

# Rust integration tests (requires MongoDB + Redis)
cargo test --tests -p notiflo-runtime --no-default-features --features integration-tests

# Rust benchmarks
cargo bench --bench pipeline_bench --no-default-features
cargo bench --bench condition_bench --no-default-features

# NestJS unit tests (236 tests)
npx nx test notiflo

# NestJS E2E tests (requires Redis)
npx nx e2e notiflo-e2e
```

## Contributing

We welcome contributions. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup instructions and guidelines.

## License

Apache 2.0 -- see [LICENSE](LICENSE).

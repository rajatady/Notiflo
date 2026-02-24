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

Your app pushes data ticks (price changes, sensor readings, metric values). Notiflo evaluates every active condition in **sub-100 nanoseconds**, then delivers notifications through email, SMS, push, Slack, webhooks, in-app, or any channel you configure.

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

This starts the full stack: MongoDB, Redis, Rust runtime, NestJS API, Next.js dashboard, seed data, and a ticker simulator that generates random price crossings.

Once everything is healthy (~30 seconds):

| Service | URL |
|---------|-----|
| Dashboard | http://localhost:4201 |
| API | http://localhost:3001/api |
| Rust Health | http://localhost:8081/health |
| WebSocket | ws://localhost:3001/ws/notifications |

The seed service automatically creates a demo organization, 3 subscribers, 5 alert conditions (AAPL, TSLA, BTC, ETH, NVDA), and a Redis Stream connector. The ticker simulator generates random-walk prices near the alert thresholds so crossings happen within ~30 seconds.

Open the dashboard at **http://localhost:4201** to see:
- **Pipeline Performance** — live throughput, eval latency, delivery count (via WebSocket)
- **Notifications** — in-app deliveries streaming in real-time with `<1μs` latency

### Create your own alert

```bash
# 1. Create an organization
curl -s -X POST http://localhost:3001/api/organizations \
  -H 'Content-Type: application/json' \
  -d '{"name": "My Org", "slug": "my-org"}' | jq '._id'

# 2. Create a subscriber
curl -s -X POST http://localhost:3001/api/subscribers \
  -H 'Content-Type: application/json' \
  -d '{"organizationId": "<ORG_ID>", "externalId": "user-1", "email": "user@example.com"}'

# 3. Create a Redis Stream connector (or use the seed connector)
curl -s -X POST http://localhost:3001/api/connectors \
  -H 'Content-Type: application/json' \
  -d '{"organizationId": "<ORG_ID>", "name": "My Stream", "type": "redis_stream", "config": {"streamKey": "my-ticks"}}'

# 4. Create an alert condition
curl -s -X POST http://localhost:3001/api/alerts \
  -H 'Content-Type: application/json' \
  -d '{"organizationId": "<ORG_ID>", "subscriberId": "<SUB_ID>", "symbol": "AAPL", "strategyType": "threshold_crossing", "strategyParams": {"threshold": 150, "operator": "cross_above"}, "channels": ["in_app"], "active": true, "name": "AAPL Price Alert"}'

# 5. Push a tick via Redis Stream
redis-cli -p 6380 XADD my-ticks '*' data '{"symbol":"AAPL","price":160,"timestamp":1708300000000}'
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

| Channel | Provider | Notes |
|---------|----------|-------|
| In-App | `notiflo-in-app` | Zero-cost delivery, skips HTTP entirely (0μs latency) |
| Email | SendGrid, SMTP | Via HTTP provider with retry/backoff |
| SMS | Twilio | Via HTTP provider with retry/backoff |
| Push | FCM, APNs | Via HTTP provider with retry/backoff |
| Webhook | HTTP POST | Via HTTP provider with retry/backoff |
| Slack | Slack API | Via HTTP provider with retry/backoff |
| WhatsApp | Twilio / WhatsApp Business | Via HTTP provider with retry/backoff |

### Live Dashboard

The Next.js dashboard connects via WebSocket for real-time updates:

- **Pipeline Performance** — 8-card grid showing throughput (tps), eval latency (avg/max), deliveries, ticks ingested, matches, dropped, active connectors
- **Notifications feed** — delivery events stream in live with LIVE/OFFLINE indicator
- **Channel Health** — per-channel throughput, error rates, latency, circuit breaker status

### Built for Production

- **Pluggable connectors** -- Redis Stream connectors loaded from MongoDB, hot-reloaded every 5 seconds
- **Subscriber preferences** -- Users control which channels they receive alerts on
- **Template engine** -- Handlebars templates with variable interpolation
- **Event logging** -- Every delivery is logged to Redis Streams
- **Dead letter queue** -- Failed deliveries after retry are pushed to a dead letter stream
- **Dashboard API** -- Overview metrics, channel health, delivery rates, engine status
- **Circuit breakers** -- Automatic provider failover when channels degrade

## Architecture

```
  [Data Sources]              notiflo-runtime (Rust)                [Delivery]

  Redis Stream ────────►  Ingest (per-connector)
  WebSocket ───────────►    │
                            ▼
                         Evaluate
                           Drift Sentinel (<100ns)
                           Expression DSL
                           Rhai Script Sandbox
                            │
                            ▼
                         Template Render (Handlebars)
                            │
                    ┌───────┴────────┐
                    ▼                ▼
                 In-App           HTTP Provider ──────►  SendGrid, Twilio,
                 (0μs)              │                    FCM, Slack, Webhook
                    │               │
                    └───────┬───────┘
                            ▼
                    Event Log ──► Redis Stream (notiflo:events:delivery)
                                        │
                                        ▼
                        notiflo-api (NestJS)
                          Redis Stream Consumer
                            ├── Persist to MongoDB
                            └── Broadcast via WebSocket (/ws/notifications)
                                        │
                                        ▼
                        notiflo-web (Next.js)
                          Live Dashboard + Notifications
                          Pipeline Metrics (polled from Rust /health)
```

**notiflo-runtime** (Rust) is the hot path. It ingests data from pluggable connectors, evaluates conditions, renders templates, delivers notifications (in-app or HTTP), and logs events. Conditions and connectors are loaded from MongoDB and refreshed periodically.

**notiflo-api** (NestJS) is the control plane. It manages alerts, templates, subscribers, connectors, and channels via REST API. It consumes delivery events from Redis Streams, persists to MongoDB, and broadcasts to WebSocket clients.

**notiflo-web** (Next.js) is the dashboard. It connects to the API via REST for initial data and WebSocket for live updates. Pipeline metrics are polled from the Rust runtime's `/health` endpoint every 5 seconds and broadcast via WebSocket.

## Configuration

### Rust Runtime

| Variable | Default | Description |
|----------|---------|-------------|
| `NOTIFLO_MONGODB_URI` | -- | MongoDB connection string |
| `NOTIFLO_REDIS_URL` | -- | Redis connection string |
| `NOTIFLO_CONFIG_POLL_INTERVAL_MS` | `5000` | How often to reload conditions from MongoDB |
| `NOTIFLO_CONNECTOR_POLL_INTERVAL_MS` | `5000` | How often to reload connectors from MongoDB |
| `NOTIFLO_HEALTH_PORT` | `8080` | Health check + metrics port |
| `RUST_LOG` | `notiflo_runtime=info` | Log level (use `debug` for verbose) |

### NestJS API

| Variable | Default | Description |
|----------|---------|-------------|
| `MONGODB_URI` | -- | MongoDB connection string |
| `REDIS_URL` | -- | Redis for stream consumption |
| `PORT` | `3000` | HTTP port |
| `NOTIFLO_RUNTIME_URL` | `http://localhost:8080` | Rust runtime URL for metrics polling |

### Next.js Dashboard

| Variable | Default | Description |
|----------|---------|-------------|
| `API_PROXY_TARGET` | `http://localhost:3000` | NestJS API URL (proxied for REST calls) |
| `NEXT_PUBLIC_WS_URL` | `ws://localhost:3001/ws/notifications` | WebSocket URL (browser connects directly) |

## Docker Compose Services

| Service | Image | Ports | Description |
|---------|-------|-------|-------------|
| `mongodb` | mongo:7 | 27018:27017 | Data persistence |
| `redis` | redis:7-alpine | 6380:6379 | Streams, queues |
| `notiflo-runtime` | Dockerfile.runtime | 8081:8080 | Rust pipeline worker |
| `notiflo-api` | Dockerfile.api | 3001:3000 | NestJS control plane |
| `notiflo-web` | Dockerfile.web | 4201:4200 | Next.js dashboard |
| `seed` | curlimages/curl | -- | Seeds demo data (runs once) |
| `ticker` | redis:7-alpine | -- | Generates random-walk price ticks |

## Self-Hosting

### Docker Compose (recommended)

```bash
docker compose up
```

Starts all 7 services. Seed data and ticker simulator are included. Open `http://localhost:4201` for the dashboard.

To clean up and start fresh:

```bash
docker compose down -v   # removes containers + data volumes
docker compose up --build
```

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
NOTIFLO_RUNTIME_URL=http://localhost:8080 \
  npx nx serve notiflo

# Start the Next.js dashboard
NEXT_PUBLIC_WS_URL=ws://localhost:3000/ws/notifications \
  npx nx serve notiflo-web
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

# NestJS unit tests (247 tests)
npx nx test notiflo

# NestJS E2E tests (requires Redis)
npx nx e2e notiflo-e2e

# Frontend tests (78 tests)
npx nx test notiflo-web
```

## Contributing

We welcome contributions. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup instructions and guidelines.

## License

Apache 2.0 -- see [LICENSE](LICENSE).

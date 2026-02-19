# Notiflo

Real-time alerting pipeline. Stream ingestion, sub-100ns condition evaluation, multi-channel delivery.

[![CI](https://github.com/rajatady/Notiflo/actions/workflows/ci.yml/badge.svg)](https://github.com/rajatady/Notiflo/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![Rust](https://img.shields.io/badge/rust-1.78%2B-orange.svg)](https://www.rust-lang.org/)

## Architecture

```
                          +-------------------------------+
  [Data Sources]          |       notiflo-runtime (Rust)  |         [Providers]
                          |                               |
  Redis Queue ---------> | Ingest                        |
  WebSocket -----------> |   |                           |
                          |   v                           |
                          | Evaluate                      |
                          |   Drift Sentinel (<100ns)     |
                          |   Expression DSL              |
                          |   Rhai Script Sandbox         |
                          |   |                           |
                          |   v                           |
                          | Template Render (Handlebars)  |
                          |   |                           |
                          |   v                           |
                          | Deliver (HTTP) ---------------+-----> SendGrid (email)
                          |   |                           |-----> Twilio (sms)
                          |   v                           |-----> FCM / APNs (push)
                          | Event Log ----> Redis Streams |-----> Slack, Webhook
                          +-------------------------------+-----> WhatsApp, In-App
                                               |
                                               v
                          +-------------------------------+
                          |    notiflo-api (NestJS)       |
                          |                               |
                          |  REST API (alerts, templates, |
                          |   subscribers, channels)      |
                          |  Dashboard endpoints          |
                          |  Delivery event tracking      |  <--- Redis Streams
                          +-------------------------------+
                                       |
                                       v
                               +---------------+
                               |   MongoDB 7+  |
                               +---------------+
```

**notiflo-runtime** (Rust) -- The hot path. Ingests data streams (Redis queue or WebSocket), evaluates conditions using the Drift Sentinel algorithm in <100ns per tick, renders templates with Handlebars, delivers notifications via HTTP, and logs events to Redis Streams.

**notiflo-api** (NestJS) -- Control plane only. REST API for managing alerts, templates, subscribers, and channels. Dashboard endpoints. Consumes Redis Streams for delivery event tracking.

## Performance

Benchmarked on a single thread. Drift Sentinel achieves flat O(1) scaling regardless of condition count.

| Metric | Value | Notes |
|--------|-------|-------|
| Throughput | 7.19M ticks/sec | 10K conditions, 100 symbols |
| Evaluate latency (1K conditions) | 75ns avg | threshold_crossing, Drift Sentinel |
| Evaluate latency (100K conditions) | 73ns avg | Scales flat -- O(1) amortized |
| Evaluations/sec (100K conditions) | 13.6M | Single thread |
| Template render | 1.08us | Handlebars |
| HTTP delivery | ~52us | Per notification |

## Quick Start

```bash
docker compose up
```

The NestJS API will be available at http://localhost:3000.

### Create Your First Alert

```bash
# Create an organization
curl -X POST http://localhost:3000/organizations \
  -H 'Content-Type: application/json' \
  -d '{"name": "My Org", "slug": "my-org"}'

# Create a subscriber
curl -X POST http://localhost:3000/subscribers \
  -H 'Content-Type: application/json' \
  -d '{"organizationId": "<ORG_ID>", "externalId": "user-1", "email": "user@example.com", "channelPreferences": {"email": {"enabled": true}}}'

# Create an alert condition
curl -X POST http://localhost:3000/alerts \
  -H 'Content-Type: application/json' \
  -d '{"organizationId": "<ORG_ID>", "subscriberId": "<SUB_ID>", "symbol": "AAPL", "strategyType": "threshold_crossing", "strategyParams": {"threshold": 150, "operator": "cross_above"}, "channels": ["email"], "active": true, "name": "AAPL Alert"}'

# Push a tick via Redis
redis-cli LPUSH notiflo:ticks '{"symbol":"AAPL","value":160,"timestampUs":1708300000000000}'
```

## Evaluation Strategies

| Strategy | Use Case | Complexity | Latency |
|----------|----------|------------|---------|
| `threshold_crossing` | Price alerts, sensor thresholds | O(1) amortized (Drift Sentinel) | ~75ns |
| `expression` | Compound conditions (`value > 150 AND volume > 1M`) | O(1) per condition | ~100ns-1us |
| `script` | Complex logic (Rhai sandbox with full scripting) | Varies | ~1-10us |

## Delivery Channels

| Channel | Provider |
|---------|----------|
| `email` | SendGrid, SMTP |
| `sms` | Twilio |
| `push` | FCM, APNs |
| `webhook` | HTTP POST |
| `in_app` | Internal store |
| `slack` | Slack API |
| `whatsapp` | Twilio / WhatsApp Business |

## Configuration

### Rust Runtime (environment variables)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NOTIFLO_MONGODB_URI` | Yes | -- | MongoDB connection string |
| `NOTIFLO_REDIS_URL` | Yes | -- | Redis connection string |
| `NOTIFLO_INGEST_TYPE` | No | `redis` | `redis` or `websocket` |
| `NOTIFLO_REDIS_QUEUE_KEY` | No | `notiflo:ticks` | Redis list key for tick ingestion |
| `NOTIFLO_WS_URL` | If websocket | -- | WebSocket endpoint URL |
| `NOTIFLO_CONFIG_POLL_INTERVAL_MS` | No | `5000` | Config reload interval (ms) |
| `NOTIFLO_HEALTH_PORT` | No | `8080` | Health check HTTP port |
| `RUST_LOG` | No | `notiflo_runtime=info` | Log level |

### NestJS API (environment variables)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MONGODB_URI` | Yes | -- | MongoDB connection string |
| `REDIS_URL` | No | -- | Redis for stream consumption |
| `PORT` | No | `3000` | HTTP port |

## Development

### Prerequisites

- Rust 1.78+
- Node.js 18+
- Yarn
- MongoDB 7+
- Redis 7+

### Build

```bash
# Rust runtime
cargo build --release --bin notiflo-runtime

# NestJS API
yarn install
npx nx build notiflo
```

### Test

```bash
# Rust unit tests
cargo test --workspace --no-default-features

# Rust integration tests (requires running MongoDB + Redis)
cargo test --tests -p notiflo-runtime --no-default-features --features integration-tests

# NestJS unit tests
npx nx test notiflo

# NestJS E2E tests (requires running Redis)
npx nx e2e notiflo-e2e
```

### Benchmarks

```bash
# Pipeline benchmarks (throughput, template render, delivery)
cargo bench --bench pipeline_bench --no-default-features

# Condition evaluation benchmarks (Drift Sentinel, expression, script)
cargo bench --bench condition_bench --no-default-features
```

### Load Testing

The runtime includes a built-in load test binary. It runs the full pipeline (ingest, evaluate, deliver) against real infrastructure.

```bash
cargo run --release --bin load-test --no-default-features -- \
  --conditions 10000 \
  --ticks 50000
```

### Run Locally

```bash
# Start infrastructure only
docker compose up -d mongodb redis

# Run the Rust runtime
NOTIFLO_MONGODB_URI=mongodb://localhost:27017/notiflo \
NOTIFLO_REDIS_URL=redis://localhost:6379 \
  cargo run --release --bin notiflo-runtime

# Run the NestJS API
yarn install
npx nx serve notiflo
```

## CI

The CI pipeline runs 5 jobs on every push:

| Job | What it checks |
|-----|---------------|
| `rust` | `cargo test`, `cargo clippy`, `cargo fmt` |
| `rust-integration` | Integration tests against real MongoDB + Redis |
| `node` | NestJS unit tests |
| `nestjs-e2e` | End-to-end tests against real services |
| `load-test-smoke` | Smoke run of the load test binary |

## License

Apache 2.0 -- see [LICENSE](LICENSE).

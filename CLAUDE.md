# Notiflo — Claude Code Instructions

## What Is Notiflo

Notiflo is a **real-time alerting pipeline**: stream ingestion → condition evaluation → multi-channel delivery. The entire product is speed. Every nanosecond matters.

The core pipeline runs in Rust as a standalone binary. NestJS is the control plane (config API, dashboard). The hot path never leaves Rust.

### Architecture

```
[Data Sources]              notiflo-runtime (Rust)                [Delivery]

  Redis Stream ────────►  Ingest (per-connector)
                            │
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

**Rust binary (`notiflo-runtime`):** Ingests data from pluggable Redis Stream connectors, evaluates conditions via Drift Sentinel, renders Handlebars templates, delivers notifications (in-app or HTTP), writes delivery events to Redis streams. Conditions and connectors are loaded from MongoDB and refreshed every 5s.

**NestJS (`notiflo-api`):** REST API for config CRUD, dashboard endpoints, consumes delivery events from Redis streams, persists to MongoDB, broadcasts to WebSocket clients. Polls Rust `/health` endpoint for pipeline metrics every 5s.

**Next.js (`notiflo-web`):** Live dashboard with WebSocket connection for real-time delivery events and pipeline metrics. Pipeline Performance panel, notifications feed with LIVE indicator, connectors management.

**They are two separate processes.** NestJS talks to users. Rust talks to data.

### Drift Sentinel Algorithm

The default threshold evaluation algorithm. Key insight: after a crossing, the new sentinel position is found by walking the sorted array from the current index — no binary search needed. O(1) amortized sentinel updates.

Based on: "A stochastic cost model for streaming threshold evaluation under local continuity."

3-10x faster than binary search in the local-continuity (realistic) scenario. Binary search is available as an alternative via `ThresholdAlgorithm::BinarySearch`.

### Pluggable Evaluation Strategies

1. `threshold_crossing` — Drift Sentinel (default) or Binary Search
2. `expression` — DSL parser for compound conditions
3. `script` — Rhai sandboxed scripting

New strategies implement the `EvaluationStrategy` trait and register in `evaluator.rs`.

---

## Project Structure

```
/
├── apps/
│   ├── notiflo/                    # NestJS control plane
│   │   └── src/app/
│   │       ├── alerts/             # Alert conditions CRUD
│   │       ├── channels/           # Channel providers + registry
│   │       ├── connectors/         # Redis Stream connector management
│   │       ├── core/types/         # Channel + notification type definitions
│   │       ├── dashboard/          # Dashboard API + engine metrics
│   │       ├── notifications/      # Notification records + WebSocket gateway + Redis stream consumer
│   │       ├── organizations/      # Multi-tenant org management
│   │       ├── subscribers/        # Subscriber management
│   │       └── templates/          # Template engine (Handlebars)
│   └── notiflo-web/                # Next.js live dashboard
│       ├── components/
│       │   ├── dashboard/          # PipelineMetrics, OverviewMetrics, ChannelHealth
│       │   ├── notifications/      # NotificationsList
│       │   └── connectors/         # ConnectorsList
│       ├── hooks/                  # useWebSocket, useLiveMetrics, useLiveNotifications, useConnectors
│       └── pages/                  # dashboard, notifications, alerts, connectors
├── libs/
│   ├── bridge/napi-bridge/         # @notiflo/bridge/napi-bridge — Rust addon wrapper + mock
│   └── engine/
│       ├── engine-core/            # Rust — condition evaluation engine
│       │   ├── src/condition/
│       │   │   ├── threshold_crossing.rs  # Drift Sentinel + Binary Search
│       │   │   ├── evaluator.rs           # Strategy registry + dispatch
│       │   │   ├── expression_strategy.rs # DSL evaluator
│       │   │   └── script_strategy.rs     # Rhai sandbox
│       │   ├── benches/condition_bench.rs # Criterion benchmarks
│       │   └── src/napi_exports.rs        # Node.js bridge (for config push)
│       ├── notiflo-runtime/        # Rust standalone binary — the hot path
│       │   └── src/
│       │       ├── main.rs              # Binary entry point
│       │       ├── pipeline.rs          # Pipeline orchestrator + PipelineStats (atomics)
│       │       ├── ingest/              # Redis Stream ingest (per-connector)
│       │       ├── delivery/            # Router, InAppProvider, HttpProvider
│       │       ├── event_log.rs         # Redis Streams delivery event writer
│       │       ├── config.rs            # Env config
│       │       ├── health.rs            # /health endpoint with latency + throughput metrics
│       │       ├── subscriber_cache.rs  # DashMap cache backed by MongoDB
│       │       ├── connector_loader.rs  # MongoDB connector loader (hot-reload)
│       │       └── template.rs          # Handlebars template renderer
│       └── shared-types/           # Rust shared types (traits, tick, condition)
├── scripts/
│   ├── seed.sh                     # Seeds demo org, subscribers, alerts, connector
│   └── ticker-simulator.sh         # Random-walk price ticker
├── Cargo.toml                      # Rust workspace root
└── docker-compose.yml              # Full stack: mongo, redis, runtime, api, web, seed, ticker
```

### Path Aliases
```
@notiflo/bridge/napi-bridge  → libs/bridge/napi-bridge/src/index.ts
engine-core                  → libs/engine/engine-core/index.d.ts
```

---

## Build & Test Commands

### Rust
```bash
export PATH="$HOME/.cargo/bin:$PATH"
cargo check --workspace                                    # Fast compilation check
cargo test --workspace                                     # Run all Rust tests
cargo bench --bench condition_bench --no-default-features  # Benchmarks
npx nx build engine-core                                   # Build napi binary
```

### NestJS
```bash
npx nx test notiflo                              # Backend tests
npx nx test notiflo --testPathPattern="alerts"   # Specific module
npx nx serve notiflo                             # Start server
```

### Frontend
```bash
npx nx test notiflo-web    # Frontend tests
npx nx serve notiflo-web   # Start dashboard
```

---

## Key Patterns

### NestJS
- `@Injectable()` services, `@Optional() @Inject(TOKEN)` for graceful degradation
- String DI tokens: `ENGINE_BRIDGE`, `'AlertsService'`
- Mongoose: `@InjectModel('Name')` must match `forFeature({ name: 'Name' })`
- `MockEngineBridgeService` replaces Rust addon in ALL TS tests

### Rust
- Feature flag `napi_binding` gates NAPI code
- `EvaluationStrategy` trait — all strategies implement this
- `ThresholdCrossingStrategy::with_algorithm(ThresholdAlgorithm::DriftSentinel)`
- `engine-core` compiles as `cdylib` (Node.js) + `rlib` (Rust tests/benches)

### Testing
- Unit: Jest + `@nestjs/testing`, mock Mongoose models
- E2E: MongoMemoryServer + MockEngineBridgeService
- Rust: `cargo test --workspace`

---

## What's Built (Core Pipeline)

### Rust standalone binary (`notiflo-runtime`) — COMPLETE
1. **Ingest connectors** — Redis Stream ingest with per-connector tasks, hot-reloaded from MongoDB every 5s
2. **Delivery layer** — InAppProvider (0μs, no HTTP) + HttpProvider (reqwest, retry with backoff, dead letter queue)
3. **Event log** — Redis Streams writer (`notiflo:events:delivery`) with rendered_content for in-app
4. **Config loader** — reads alert conditions + connectors from MongoDB, periodic refresh
5. **Pipeline instrumentation** — lock-free atomics for eval latency, delivery latency, throughput
6. **Health endpoint** — `/health` exposes all metrics (avg/max eval latency, throughput tps, delivery count)
7. **Subscriber cache** — DashMap backed by MongoDB with auto-detect from available contact data

### NestJS — COMPLETE
- **Connectors module** — CRUD for Redis Stream connectors
- **Redis Stream consumer** — consumes delivery events, persists to MongoDB
- **WebSocket gateway** — standalone `ws.Server` on `/ws/notifications` (Fastify-compatible, no WsAdapter)
- **Metrics bridge** — polls Rust `/health` every 5s, broadcasts via WebSocket

### Next.js Dashboard — COMPLETE
- **Pipeline Performance** — 8-card grid with live throughput, eval latency, deliveries (via WebSocket)
- **Notifications feed** — live delivery events with LIVE/OFFLINE indicator
- **Connectors page** — manage Redis Stream connectors
- **WebSocket hooks** — `useWebSocket`, `useLiveMetrics`, `useLiveNotifications`

### Docker Compose — COMPLETE
- Full stack: MongoDB, Redis, Rust runtime, NestJS API, Next.js dashboard, seed data, ticker simulator
- `docker compose up` starts everything with health checks and proper ordering

### Design Principles
- Hot path stays in Rust — never crosses to Node
- Eventually consistent but deterministic and fault tolerant
- Delivery events written to durable Redis streams
- Node consumes at its own pace, persists to MongoDB
- Burst-heavy, high-sleep pattern — optimize for the burst

### Known Gotchas
- **Fastify + WebSocket**: Fastify intercepts HTTP upgrade requests before NestJS WsAdapter. Use standalone `ws.Server` with `noServer: true` and manual `httpServer.on('upgrade', ...)` handler.
- **Serde empty objects**: `channelPreferences: {}` deserializes as `Some(HashMap::new())`, not `None`. Check `.map_or(false, |p| !p.is_empty())`.
- **Ticker drift**: Random-walk prices drift away from thresholds over time. Restart ticker with runtime for fresh crossings.

---

## User Preferences

- **Think before coding.** Never jump to implementation.
- **Speed is the product.** Every architectural decision evaluated against latency.
- **No over-engineering.** Only build what's needed now.
- **Commit only when asked.**
- **Don't ask user to re-explain.** Read CLAUDE.md, MEMORY.md, git log.

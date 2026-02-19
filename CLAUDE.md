# Notiflo — Claude Code Instructions

## What Is Notiflo

Notiflo is a **real-time alerting pipeline**: stream ingestion → condition evaluation → multi-channel delivery. The entire product is speed. Every nanosecond matters.

The core pipeline runs in Rust as a standalone binary. NestJS is the control plane (config API, dashboard). The hot path never leaves Rust.

### Architecture

```
[Data Sources] → [Rust Pipeline Worker] → [Provider APIs]
  WebSocket         Ingest → Evaluate       SendGrid
  Kafka             (Drift Sentinel)        Twilio
  Redis Queue       → Deliver               FCM
                    → Event Log             OneSignal

[NestJS Control Plane]  ←  Redis Streams (delivery events)
  Config API (alerts, subscribers, templates, channels)
  Dashboard API
  MongoDB (persistence)

[Next.js Dashboard]
  Overview, alerts, notifications, engine status
```

**Rust binary (the worker):** Consumes streams, evaluates conditions via Drift Sentinel, delivers to providers, writes delivery events to Redis streams.

**NestJS (the server):** REST API for config CRUD, dashboard endpoints, reads delivery events from Redis streams for history/observability.

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
│   │       ├── alerts/             # Alert conditions CRUD + tick ingestion
│   │       ├── channels/           # Channel providers + registry
│   │       ├── core/types/         # Channel + notification type definitions
│   │       ├── dashboard/          # Dashboard API + engine metrics
│   │       ├── notifications/      # Notification records
│   │       ├── organizations/      # Multi-tenant org management
│   │       ├── subscribers/        # Subscriber management
│   │       └── templates/          # Template engine (Handlebars)
│   └── notiflo-web/                # Next.js dashboard (as-is)
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
│       └── shared-types/           # Rust shared types (traits, tick, condition)
├── Cargo.toml                      # Rust workspace root
└── tsconfig.base.json              # TS path aliases
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

## What Needs to Be Built (Core Pipeline)

### Rust standalone binary (`notiflo-runtime`)
1. **Ingest connectors** — WebSocket (tokio-tungstenite), Kafka (rdkafka), Redis queue (redis crate)
2. **Delivery layer** — async HTTP client (reqwest) for provider APIs, retry with backoff, dead letter to Redis stream
3. **Event log** — writes delivery events to Redis streams for NestJS to consume
4. **Config loader** — reads alert conditions from MongoDB or Redis, watches for changes

### NestJS changes
- Config push: write alert configs to Redis/MongoDB for Rust binary to read
- Dashboard: consume delivery events from Redis streams

### Design Principles
- Hot path stays in Rust — never crosses to Node
- Eventually consistent but deterministic and fault tolerant
- Delivery events written to durable Redis streams
- Node consumes at its own pace, persists to MongoDB
- Burst-heavy, high-sleep pattern — optimize for the burst

---

## User Preferences

- **Think before coding.** Never jump to implementation.
- **Speed is the product.** Every architectural decision evaluated against latency.
- **No over-engineering.** Only build what's needed now.
- **Commit only when asked.**
- **Don't ask user to re-explain.** Read CLAUDE.md, MEMORY.md, git log.

# Contributing to Notiflo

Thank you for your interest in contributing to Notiflo. This guide covers the project structure, how to run tests, and how to add new evaluation strategies or delivery channels.

## Prerequisites

- **Rust 1.78+** -- for the runtime engine
- **Node.js 18+** and **Yarn** -- for the NestJS API
- **MongoDB 7+** -- primary data store
- **Redis 7+** -- queue, pub/sub, and event streams

## Getting Started

```bash
# Clone the repository
git clone https://github.com/rajatady/Notiflo.git
cd Notiflo

# Start infrastructure
docker compose up -d mongodb redis

# Build and run the Rust runtime
NOTIFLO_MONGODB_URI=mongodb://localhost:27017/notiflo \
NOTIFLO_REDIS_URL=redis://localhost:6379 \
  cargo run --release --bin notiflo-runtime

# Install Node.js dependencies and run the API
yarn install
npx nx serve notiflo
```

## Code Structure

```
apps/
  notiflo/                NestJS API (control plane)
  notiflo-e2e/            E2E tests (real MongoDB + Redis)

libs/engine/
  shared-types/           Rust shared types crate
  engine-core/            Condition evaluation (DashMap store, strategies)
    src/
      condition/          Evaluation strategies (threshold, expression, script)
      delivery/           Channel delivery traits and implementations
      feed/               Event log and activity feed
      router/             Routing logic (subscriber preferences, fan-out)
      cache/              Caching layer
      resilience/         Retry and circuit breaker logic
    benches/
      condition_bench.rs  Criterion benchmarks for evaluation strategies
  notiflo-runtime/        Runtime binary + library
    src/
      main.rs             Entry point
      pipeline.rs         Ingest + evaluate loops
      delivery/           HTTP delivery, routing, retry, dead letter
      event_log.rs        Redis Streams event log
      template.rs         Handlebars template renderer
      config_loader.rs    MongoDB config sync
      ingest/             Redis and WebSocket ingestion
    benches/
      pipeline_bench.rs   Criterion benchmarks (throughput, render, delivery)
    tests/
      integration/        Real MongoDB + Redis integration tests
```

## Running Tests

```bash
# Rust unit tests (no external services required)
cargo test --workspace --no-default-features

# Rust integration tests (requires running MongoDB + Redis)
cargo test --tests -p notiflo-runtime --no-default-features --features integration-tests

# Rust linting
cargo clippy --workspace -- -D warnings

# Rust formatting
cargo fmt --all -- --check

# NestJS unit tests
npx nx test notiflo

# NestJS E2E tests (requires running Redis)
npx nx e2e notiflo-e2e
```

## Running Benchmarks

```bash
# Pipeline benchmarks (throughput, template render, delivery)
cargo bench --bench pipeline_bench --no-default-features

# Condition evaluation benchmarks (Drift Sentinel scaling, expression, script)
cargo bench --bench condition_bench --no-default-features
```

## Load Testing

The runtime ships with a built-in load test binary that exercises the full pipeline against real infrastructure.

```bash
cargo run --release --bin load-test --no-default-features -- \
  --conditions 10000 \
  --ticks 50000
```

Adjust `--conditions` and `--ticks` to match your target workload. The binary prints throughput, latency percentiles, and evaluation rates.

## Pull Request Process

1. Fork the repository and create a feature branch from `main`.
2. Write tests for any new functionality.
3. Ensure all checks pass:
   - `cargo test --workspace --no-default-features`
   - `cargo clippy --workspace -- -D warnings`
   - `cargo fmt --all -- --check`
   - `npx nx test notiflo`
4. Open a pull request with a clear description of the change.
5. A maintainer will review and merge once CI is green.

## Adding an Evaluation Strategy

Evaluation strategies live in `libs/engine/engine-core/src/condition/`. To add a new one:

1. Create a new module file (e.g., `my_strategy.rs`) in the `condition/` directory.
2. Implement the `EvaluationStrategy` trait:
   ```rust
   pub trait EvaluationStrategy {
       fn evaluate(&mut self, tick: &Tick, params: &StrategyParams) -> EvalResult;
   }
   ```
3. Register the strategy in `condition/mod.rs` so the router can dispatch to it by name.
4. Add unit tests in the same file or a dedicated test module.
5. If performance-sensitive, add a benchmark case in `libs/engine/engine-core/benches/condition_bench.rs`.

## Adding a Delivery Channel

Delivery channels live in `libs/engine/engine-core/src/delivery/`. To add a new one:

1. Create a new module file (e.g., `my_channel.rs`) in the `delivery/` directory.
2. Implement the `DeliveryChannel` trait:
   ```rust
   #[async_trait]
   pub trait DeliveryChannel {
       async fn deliver(&self, notification: &Notification) -> DeliveryResult;
   }
   ```
3. Register the channel in `delivery/mod.rs`.
4. Add the channel name to the `Channel` enum so it can be referenced in alert configurations.
5. Add integration tests that verify delivery against a mock or sandbox endpoint.

## Code Style

- **Rust**: Follow standard `rustfmt` formatting. Run `cargo fmt` before committing.
- **TypeScript**: Follow the existing ESLint configuration. Run `npx nx lint notiflo` to check.

## Questions?

Open an issue on [GitHub](https://github.com/rajatady/Notiflo/issues) and we will be happy to help.

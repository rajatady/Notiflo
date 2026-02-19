# Rust Engine — libs/engine/

Two Rust crates in a Cargo workspace:

## shared-types (rlib)
- `EvaluationStrategy` trait — the pluggable evaluation interface
- Domain types: `NormalizedTick`, `AlertConditionInput`, `ConditionMatchResult`, `Channel`
- Strategy type enum: `threshold_crossing`, `expression`, `script`

## engine-core (cdylib + rlib)
- Condition store: `DashMap<String, Vec<AlertConditionInput>>` keyed by symbol
- Evaluator: dispatches to the correct `EvaluationStrategy` based on `strategy_type`
- Strategies:
  - `threshold_crossing` — B-tree sentinel check, ~18ns per evaluation
  - `expression` — DSL parser (operators: >, <, >=, <=, ==, &&, ||)
  - `script` — Rhai sandbox with configurable timeout
- napi exports: gated behind `napi_binding` feature flag
- Benchmarks: `benches/condition_bench.rs`

## NX + Rust napi Setup

Uses `@monodon/rust` plugin with `@monodon/rust:napi` executor (NOT `:build` — that doesn't support napi).

**project.json** requires `dist` and `jsFile` options. **package.json** is required by napi-rs with `napi.binaryName` and `napi.targets`.

The napi executor does NOT generate `index.js` — we maintain it manually. It loads the platform-specific `.node` binary (e.g. `engine-core.darwin-arm64.node`).

**Webpack integration**: `require('engine-core')` is externalized in `apps/notiflo/webpack.config.js` to an absolute path, so webpack doesn't bundle the native addon.

**Rust toolchain**: `~/.cargo/bin` must be in PATH (added to `.zshrc`).

## Build
```bash
cargo check --workspace
cargo test --workspace
cargo bench --bench condition_bench --no-default-features
npx nx build engine-core    # compiles Rust + copies .node binary
```

## Key Gotchas
- `strategyParams` must use `threshold`/`operator` fields (not `targetPrice`/`direction`)
- Mongoose arrays must be spread (`[...doc.channels]`) before passing to napi-rs
- `ThreadsafeFunction<String, ErrorStrategy::Fatal>` callback receives `(data)` not `(err, data)`
- AlertsService bulk load retries for ~1s waiting for engine bridge init

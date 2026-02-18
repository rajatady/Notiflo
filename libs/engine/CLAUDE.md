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

## Build
```bash
cargo check --workspace
cargo test --workspace
cargo bench --bench condition_bench --no-default-features
npx nx build engine-core
```

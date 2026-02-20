---
paths:
  - "libs/engine/**/*.rs"
  - "libs/engine/**/Cargo.toml"
  - "Cargo.toml"
---

# Rust Engine Rules

## Architecture
- `engine-core` is a cdylib (Node.js addon via napi-rs) AND rlib (for Rust tests/benches)
- `shared-types` is an rlib defining the `EvaluationStrategy` trait and domain types
- The hot path target is <1us per no-match evaluation, 2-6ms tick-to-delivery

## Conventions
- Gate all napi exports behind `#[cfg(feature = "napi_binding")]` in `napi_exports.rs`
- Never put napi dependencies in the default feature set — benchmarks must compile without Node.js symbols
- Use `DashMap` for concurrent condition storage, `crossbeam-channel` for ring buffers
- `parking_lot` mutexes over `std::sync` for performance
- `Option<String>` in napi structs means JS must pass `undefined`, NOT `null`

## Adding a New Evaluation Strategy
1. Implement `EvaluationStrategy` trait from `shared-types/src/strategy.rs`
2. Add strategy type variant to the strategy enum
3. Register in the evaluator dispatcher (`engine-core/src/condition/evaluator.rs`)
4. Write Rust unit tests in the same file
5. Add benchmark in `benches/condition_bench.rs`
6. Add corresponding handling in `MockEngineBridgeService` (TypeScript side)
7. Write bridge tests in `libs/bridge/napi-bridge/`

## Build & Test
```bash
cargo check --workspace              # Fast compilation check
cargo test -p engine-core            # Unit tests
cargo test -p shared-types           # Shared type tests
cargo clippy --workspace             # Lint
cargo bench --bench condition_bench --no-default-features  # Benchmarks
npx nx build engine-core             # Build cdylib for Node.js
```

## The .node Addon
- Built artifact: `target/release/libengine_core.dylib`
- Must be copied/symlinked to `engine-core.darwin-arm64.node` for `require('engine-core')` to work
- For ALL TypeScript tests, use `MockEngineBridgeService` instead — never depend on the compiled addon in Jest

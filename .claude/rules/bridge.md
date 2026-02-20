---
paths:
  - "libs/bridge/**"
---

# Rust-JS Bridge Rules

## Architecture
- `EngineBridgeService` — wraps the real Rust napi addon (`require('engine-core')`)
- `MockEngineBridgeService` — pure TypeScript implementation for testing
- `IEngineBridge` — interface contract both implement
- `ENGINE_BRIDGE` — DI token string constant

## Data Flow: Rust <-> Node.js
- NestJS calls napi functions via `EngineBridgeService`
- Data crosses the boundary as JSON strings (serialized in TS, deserialized in Rust)
- Rust match callbacks use `ThreadsafeFunction` to emit events back to NestJS `EventEmitter2`
- Event name: `engine.condition.match`

## Module Setup
`NapiBridgeModule` is `@Global()` — available everywhere without explicit imports.
Provides both `EngineBridgeService` (class) and `ENGINE_BRIDGE` (string token).

## Testing Bridge Changes
1. Write tests using `MockEngineBridgeService` first
2. Verify mock behavior matches expected Rust behavior
3. Only test with real addon when specifically testing napi interop
4. Bridge tests: `npx nx test napi-bridge`

## When Modifying the Bridge Interface
If you change `IEngineBridge`, you MUST update BOTH:
- `EngineBridgeService` (real addon wrapper)
- `MockEngineBridgeService` (test mock)
- All barrel exports in `src/index.ts`

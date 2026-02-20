# Rust-JS Bridge — libs/bridge/napi-bridge/

Wraps the Rust `engine-core` napi addon for use in NestJS.

## Key Files
- `engine-bridge.interface.ts` — `IEngineBridge` interface + `ENGINE_BRIDGE` token
- `engine-bridge.service.ts` — real addon wrapper (loads `require('engine-core')`)
- `mock-engine-bridge.service.ts` — pure TS mock for testing
- `napi-bridge.module.ts` — `@Global()` module providing both implementations

## Data Flow
TS -> JSON.stringify -> napi function -> Rust deserializes -> evaluates -> ThreadsafeFunction callback (single arg, Fatal strategy) -> EventEmitter2 event

## Webpack Loading
`require('engine-core')` is externalized in webpack.config.js to the absolute path of `libs/engine/engine-core/index.js`. This bypasses webpack bundling so Node.js loads the `.node` binary at runtime.

## Testing
- ALL Jest tests use `MockEngineBridgeService`
- `npx nx test napi-bridge`

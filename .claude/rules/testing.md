---
paths:
  - "**/*.spec.ts"
  - "**/*.e2e.spec.ts"
  - "**/test-utils/**"
---

# Testing Rules

## TDD Is Non-Negotiable
- Write ALL test expectations FIRST — they must FAIL (RED)
- Then implement minimum code to pass (GREEN)
- Then refactor if needed
- Tests are the source of truth for the entire platform

## Writing Non-Tautological Tests
- Don't just test that a mock was called — test it was called with the RIGHT arguments
- Test error paths, not just happy paths
- Test state transitions (e.g., campaign DRAFT -> RUNNING -> PAUSED)
- Test edge cases: empty arrays, null values, missing fields
- Integration tests should verify the full event chain works

## Unit Tests (per service/controller)
- Mock ALL dependencies with `jest.fn()` objects
- For Mongoose models:
  ```typescript
  const mockModel = {
    create: jest.fn(),
    find: jest.fn().mockReturnValue({
      skip: jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnValue({ exec: jest.fn() })
      })
    }),
    findById: jest.fn().mockReturnValue({ exec: jest.fn() }),
  };
  ```
- Provide mock with `getModelToken('ModelName')` in test module
- For string DI tokens: `{ provide: 'ServiceName', useValue: mockService }`

## Integration Tests
- Use real `EventEmitter2`, `MockEngineBridgeService`, mocked DB
- Test the feature flow end-to-end within a module

## E2E Tests
- Use `MongoMemoryServer` for real MongoDB
- Set `process.env.MONGODB_URI` BEFORE module compilation
- Override engine bridge: `.overrideProvider(EngineBridgeService).useClass(MockEngineBridgeService)`
- Use `import request from 'supertest'` (default import, NOT namespace `import *`)
- After any significant code change, run: `npx nx run-many --target=test --all`

## MockEngineBridgeService
- Pure TypeScript implementation of `IEngineBridge`
- Used in ALL Jest tests — never depend on compiled Rust addon
- Mirrors Rust engine behavior (threshold evaluation, match events)
- Injected via `ENGINE_BRIDGE` token with `@Optional()`

## Test Naming
- Use: `'should [action] when [condition]'`
- Group with `describe()` blocks by feature/method

# Notiflo — Claude Code Instructions

---

## CONTEXT IS SACRED — Read This First

**Your in-memory context WILL be destroyed.** Auto-compaction is ON and it WILL produce lossy, incomplete summaries. You CANNOT rely on implicit context, partial memory, or "I think I remember." You WILL forget critical decisions, file changes, architectural reasoning, and error details. This has happened repeatedly and caused real damage.

**Rules:**

1. **Never assume you have context.** If you haven't explicitly read it from CLAUDE.md, MEMORY.md, git log, or a JSONL transcript, you don't have it. Partial recollection is worse than no recollection — it leads you to confidently do the wrong thing.

2. **Write context down immediately.** Every key decision, every architectural choice, every gotcha discovered — write it to MEMORY.md the moment it happens. Not "later." Not "after I finish this." NOW. If compaction hits before you write it down, it's gone forever.

3. **Before any heavy work or parallel agents:** Update MEMORY.md with: what you're about to do, what the current state is, what decisions have been made this session. This is your insurance policy against compaction.

4. **After any compaction or session start:** Re-read this CLAUDE.md + MEMORY.md + `git log --oneline -10` + `git status`. Do NOT proceed on vibes. Do NOT assume you know what's going on. Verify explicitly.

5. **After completing any milestone:** Update MEMORY.md with what was done, what tests pass, what's next. Run `npx nx run-many --target=test --all` to verify the full system still works end-to-end.

6. **If you're unsure about context:** Read the JSONL transcripts (see "Regaining Context" section below). Do NOT guess. Do NOT ask the user to re-explain something that's already documented.

7. **End-to-end verification after every significant change.** Run the full test suite. Don't just test the module you changed — DI wiring means changes in one module can break others silently. If you skip E2E verification, you are building on a foundation you haven't checked.

**The cost of writing things down is 30 seconds. The cost of losing context is hours of wasted work and user frustration. There is no excuse for not maintaining context.**

---

## What Is Notiflo

Notiflo is a **real-time condition evaluation and burst delivery engine**. It is NOT a generic notification platform. It evaluates millions of user-defined conditions against real-time data streams (financial market ticks, IoT sensor feeds, LLM output monitoring, breaking news, flash sales) and delivers matched alerts in milliseconds.

**The defining feature is throughput: 2-4 million notifications per second.** Competitors (WebEngage, OneSignal, Courier, Gupshup) do ~10,000/sec. This 200x throughput gap is the entire product thesis and must be architected from the foundation, not bolted on.

**Secondary defining feature: AI agent complete visibility.** AI agents (Claude, GPT, etc.) must get full programmatic access to all platform data — events, triggers, notifications, analytics, subscriber behavior, cross-entity correlations — through MCP, API, and CLI. This enables marketing teams at massive companies to use AI agents to get campaigns approved and run.

### Target Latency Budget
- 2-6ms from tick ingestion to provider API call (hot path)
- Rust handles the hot path; NestJS handles CRUD and orchestration

### Open Source Strategy
- Build closed first, prove throughput with benchmarks
- Open source once 2M notifs/sec is demonstrated with reproducible benchmarks
- The benchmark proof IS the launch marketing event

---

## Architecture: Rust Hot Path + NestJS Control Plane

This is a **hybrid architecture** — a deliberate pivot from an earlier all-NestJS design after throughput analysis showed Node.js alone can't hit 2-4M/sec targets.

### Rust (Hot Path — in-process via napi-rs)
- **Condition evaluation**: DashMap lookup, crossbeam ring buffer
- **Delivery routing**: HTTP/2 connection pools via hyper (planned)
- Loaded as native addon in NestJS process — NO IPC, NO serialization overhead
- Kafka stays OFF the hot path (durability/replay/analytics only)

### NestJS (Control Plane)
- CRUD for alerts, subscribers, templates, campaigns, workflows, organizations
- Orchestration: multi-channel delivery coordination
- Dashboard: analytics aggregation and engine metrics
- MCP server: AI agent interface
- Plugins/webhooks: extensibility

### Pluggable Evaluation Engine
The evaluation strategy is **pluggable per domain**. Different use cases need different algorithms:
- **Financial alerts**: Sorted price tree with sentinel thresholds (pre-calculate price ranges, only evaluate when price crosses a boundary — NOT per-tick per-condition brute force)
- **IoT monitoring**: Expression DSL for threshold bands
- **Custom logic**: Users submit evaluation code through UI via Rhai scripting engine

Built-in strategies:
1. `threshold_crossing` — O(1) sentinel check (B-tree based)
2. `expression` — DSL parser for compound conditions
3. `script` — Rhai sandboxed scripting

---

## Project Structure (NX Monorepo)

```
/
├── apps/
│   └── notiflo/                    # Main NestJS application
│       └── src/app/
│           ├── alerts/             # Alert conditions + tick ingestion + engine sync
│           ├── campaigns/          # Campaign management
│           ├── channels/           # Channel providers + registry
│           ├── core/types/         # Shared domain type definitions
│           ├── dashboard/          # Analytics dashboard + engine metrics
│           ├── events/             # Event bus and event storage
│           ├── mcp/                # MCP server for AI agent interface
│           ├── notifications/      # Notification records
│           ├── orchestrator/       # Multi-channel delivery orchestration
│           ├── organizations/      # Multi-tenant organization management
│           ├── plugins/            # Plugin system with hook registry
│           ├── subscribers/        # Subscriber management with channel preferences
│           ├── templates/          # Template engine (Handlebars)
│           ├── webhooks/           # Webhook delivery system
│           └── workflows/          # Workflow engine with branching/conditions
├── libs/
│   ├── analytics/analytics/        # @notiflo/analytics/analytics — ClickHouse + AI visibility
│   ├── bridge/napi-bridge/         # @notiflo/bridge/napi-bridge — Rust addon wrapper + mock
│   ├── engine/
│   │   ├── engine-core/            # Rust cdylib — THE hot path (condition evaluation)
│   │   └── shared-types/           # Rust shared types (EvaluationStrategy trait, tick, condition)
│   └── pipeline/pipeline/          # @notiflo/pipeline/pipeline — workers, kafka, cache, resilience
├── config/
│   └── database.configuration.ts   # MongoDB config (reads MONGODB_URI env var)
├── scripts/                        # Utility scripts
├── Cargo.toml                      # Rust workspace root
├── nx.json                         # NX workspace config
├── tsconfig.base.json              # TS path aliases
└── package.json
```

### Path Aliases (tsconfig.base.json)
```
@notiflo/bridge/napi-bridge  → libs/bridge/napi-bridge/src/index.ts
@notiflo/pipeline/pipeline   → libs/pipeline/pipeline/src/index.ts
@notiflo/analytics/analytics → libs/analytics/analytics/src/index.ts
```

---

## NX and NestJS CLI — Always Use These

**NEVER manually create module scaffolding.** Always use NX and NestJS CLI generators. They set up the correct file structure, module wiring, test files, and build configuration automatically.

### Discovering Available Commands
```bash
npx nx list                         # List all installed NX plugins and their generators/executors
npx nx list @nx/nest                # List generators available in the NestJS plugin
npx nx list @nx/js                  # List generators in the JS plugin
npx nx list @monodon/rust           # List generators in the Rust plugin
npx nx generate --help              # General generate help
npx nx generate @nx/nest:resource --help  # Help for a specific generator
```

### Common NX Commands
```bash
# Serving and building
npx nx serve notiflo                # Start the NestJS app
npx nx build notiflo                # Build for production
npx nx build engine-core            # Compile Rust cdylib

# Testing
npx nx test <project>               # Run tests (notiflo, napi-bridge, pipeline-pipeline, engine-core)
npx nx test notiflo --testPathPattern="alerts"  # Run specific test files
npx nx affected --target=test       # Run tests only for affected projects
npx nx run-many --target=test --all # Run all tests across all projects

# Code generation — ALWAYS USE THESE
npx nx generate @nx/nest:library my-lib            # Create a new NestJS library
npx nx generate @nx/nest:resource my-resource      # Create a full CRUD resource (module, controller, service, DTOs)
npx nx generate @nx/nest:module my-module          # Create a module
npx nx generate @nx/nest:service my-service        # Create a service
npx nx generate @nx/nest:controller my-controller  # Create a controller
npx nx generate @monodon/rust:lib my-rust-lib      # Create a new Rust library crate

# Important: NX auto-creates directory paths. Do NOT prefix with libs/ or apps/
# Wrong: npx nx generate @nx/nest:library libs/my-lib
# Right: npx nx generate @nx/nest:library my-lib

# Linting and formatting
npx nx lint notiflo                 # Lint a project
npx nx format:write                 # Format all files with Prettier

# Dependency graph
npx nx graph                        # Open interactive dependency graph in browser
npx nx show project notiflo         # Show project configuration

# Workspace inspection
npx nx report                       # Show installed plugin versions
npx nx show projects                # List all projects in workspace
```

### Rust-Specific Commands
```bash
# Via NX (preferred — respects workspace config)
npx nx build engine-core            # Compile Rust cdylib via @monodon/rust
npx nx test engine-core             # Run cargo test via NX

# Direct Cargo (for benchmarks and advanced Rust work)
cargo bench --bench condition_bench --no-default-features  # Benchmarks without napi symbols
cargo test -p engine-core           # Run engine-core tests directly
cargo test -p shared-types          # Run shared-types tests
cargo clippy --workspace            # Lint all Rust code
cargo check --workspace             # Fast compilation check
```

---

## Coding Patterns & Conventions

### NestJS Services
- Always use `@Injectable()` decorator
- Logger: `private readonly logger = new Logger(ClassName.name)`
- Implement `OnModuleInit` / `OnModuleDestroy` for lifecycle hooks
- Use `async/await` throughout, never raw Promises

### Dependency Injection
- **String tokens** are used: `ENGINE_BRIDGE`, `'AlertsService'`, `'OrchestratorService'`, etc.
- Pattern: provide both class and string token in every module:
  ```typescript
  providers: [
    AlertsService,
    { provide: 'AlertsService', useExisting: AlertsService },
  ],
  exports: [AlertsService, 'AlertsService'],
  ```
- Use `@Optional()` with `@Inject(TOKEN)` for graceful degradation
- `forwardRef(() => Module)` for circular module dependencies

### Controllers
- `@Controller('feature-name')` sets base route
- Standard REST verbs: `@Get()`, `@Post()`, `@Patch(':id')`, `@Delete(':id')`
- Return objects directly — NestJS serializes to JSON
- Use `class-validator` decorators on DTOs for validation

### Mongoose Schemas
- Schemas in `schemas/` subdirectory of each feature
- **Critical**: `@InjectModel('Name')` must EXACTLY match `MongooseModule.forFeature([{ name: 'Name', schema }])`
- Always verify the name string matches — this has caused bugs before

### Testing
- Framework: Jest + `@nestjs/testing`
- Unit tests: mock Mongoose models with `jest.fn()` objects
- Integration/E2E tests: use MongoMemoryServer
- `MockEngineBridgeService` replaces Rust addon in all TS tests
- Test names: `'should [action] when [condition]'`

### Rust Side
- Feature flag `napi_binding` gates NAPI code: `#[cfg(feature = "napi_binding")]`
- `EvaluationStrategy` trait in `shared-types/src/strategy.rs` — all strategies implement this
- `engine-core` compiles as both `cdylib` (for Node.js) and `rlib` (for Rust tests/benches)
- `Option<String>` in napi structs: JS must pass `undefined` not `null`

### Imports & Formatting
- Always use path aliases for cross-lib imports: `@notiflo/bridge/napi-bridge`
- Never use relative paths across module boundaries
- Each lib has barrel file (`index.ts`) exporting public API
- Prettier: single quotes
- ESLint: `@nx/enforce-module-boundaries` for monorepo discipline

---

## Database & Infrastructure

- **MongoDB**: Primary database. Connection via `MONGODB_URI` env var, defaults to `mongodb://localhost/notiflo`
- **Redis**: Caching (subscriber, template) and deduplication (delivery worker)
- **Kafka**: Message bus for pipeline workers (fanout → render → deliver → status). OFF the hot path.
- **ClickHouse**: Analytics data warehouse

---

## API Surface

| Route Prefix | Module | Purpose |
|---|---|---|
| `/alerts` | Alerts | CRUD + `POST /ticks` (tick ingestion) + engine metrics |
| `/campaigns` | Campaigns | CRUD + lifecycle (start/pause/resume) |
| `/dashboard` | Dashboard | Analytics + engine status |
| `/events` | Events | Event ingestion and querying |
| `/mcp` | MCP | AI agent tool interface |
| `/notifications` | Notifications | Query notification records |
| `/organizations` | Organizations | Multi-tenant org management |
| `/plugins` | Plugins | Plugin/hook registration |
| `/subscribers` | Subscribers | CRUD with channel preferences |
| `/templates` | Templates | CRUD with Handlebars rendering |
| `/webhooks` | Webhooks | Webhook config and delivery |
| `/workflows` | Workflows | Workflow definition and execution |

---

## Handling the Rust Dimension

### When You Need the Real Rust Addon
- Running `npx nx serve notiflo` in production/demo mode
- Running Rust benchmarks (`cargo bench`)
- Testing actual napi interop (rare — only when changing the bridge)

### When MockEngineBridgeService Is Enough
- All Jest unit tests — ALWAYS use MockEngineBridgeService
- Integration tests — use MockEngineBridgeService via `overrideProvider`
- E2E tests — use MockEngineBridgeService via `overrideProvider`
- Developing NestJS features — the mock mirrors Rust behavior

### Rust Build Workflow
```bash
# 1. Make changes to Rust code in libs/engine/
# 2. Check compilation:
cargo check --workspace
# 3. Run Rust tests:
npx nx test engine-core              # or: cargo test -p engine-core
# 4. Run benchmarks (if performance-relevant changes):
cargo bench --bench condition_bench --no-default-features
# 5. Build the cdylib for Node.js:
npx nx build engine-core
# 6. The .node addon file needs to be at the expected path for require('engine-core')
```

### Adding a New Evaluation Strategy
1. Implement `EvaluationStrategy` trait in `libs/engine/engine-core/src/condition/`
2. Add the strategy type to `shared-types/src/strategy.rs`
3. Register it in the strategy dispatcher in `engine-core/src/condition/evaluator.rs`
4. Add corresponding handling in `MockEngineBridgeService` for TS tests
5. Write Rust tests + benchmarks + TS bridge tests

### Rust <-> Node.js Data Flow
- NestJS calls napi functions exposed by `engine-core`
- Data crosses the boundary as JSON strings (serialized in TS, deserialized in Rust)
- Match callbacks use `ThreadsafeFunction` to emit events back to NestJS EventEmitter
- The `IEngineBridge` interface defines the TypeScript contract

---

## TDD Approach — How It Works End-to-End

### The Philosophy
Tests are the **source of truth** for the entire platform. Write ALL expectations FIRST — what the system should do, what each endpoint returns, what each service method produces. Then implement to make them pass.

### The Workflow
1. **Understand the feature** — read existing code, understand the domain
2. **Write test expectations** — full test file with `describe`/`it` blocks, assertions, expected behavior. Tests should FAIL (RED).
3. **Implement the minimum code** to make tests pass (GREEN)
4. **Refactor** if needed — tests protect you
5. **Run the full suite** to ensure nothing broke:
   ```bash
   npx nx run-many --target=test --all
   ```

### Test Hierarchy
- **Unit tests** (per service/controller): Mock all dependencies, test business logic in isolation
- **Integration tests** (per feature): Real EventEmitter, MockEngineBridge, mocked DB — test feature flow
- **E2E tests** (full app): MongoMemoryServer, MockEngineBridge, supertest — test HTTP endpoints end-to-end
- **Rust tests** (`cargo test`): Test evaluation strategies, data structures, napi exports

### Writing Tests That Aren't Tautological
- Don't just test that a mock was called — test that the RIGHT mock was called with the RIGHT arguments
- Test error paths, not just happy paths
- Test state transitions (e.g., campaign DRAFT → RUNNING → PAUSED)
- Test edge cases: empty arrays, null values, concurrent operations
- Integration tests should verify the event chain works (tick → engine match → event emitted → listener fires → notification created)

---

## How to Add a New Feature/Module

1. **Use NX CLI to scaffold**:
   ```bash
   npx nx generate @nx/nest:resource feature-name --project=notiflo
   ```
   This creates: module, controller, service, DTOs, test files.

2. **Write tests first** — fill in the generated `.spec.ts` files with real expectations

3. **Implement the service and controller** — make tests pass

4. **Wire into app.module.ts** — add the new module to imports (NX generator may do this)

5. **Add string DI token** if other modules will inject this service:
   ```typescript
   { provide: 'FeatureService', useExisting: FeatureService }
   ```

6. **Verify nothing broke**:
   ```bash
   npx nx test notiflo
   ```

For a new **library**:
```bash
npx nx generate @nx/nest:library lib-name
# Add path alias to tsconfig.base.json if needed
# Export public API from src/index.ts barrel file
```

---

## Common Error Patterns & Fixes

### "Nest can't resolve dependencies of X"
**Cause**: A service injects a token that isn't provided in the test module or the app module.
**Fix**: Check what the service's constructor expects (`@Inject('TOKEN')`, `@InjectModel('Name')`), and ensure the test/module provides it. For Mongoose: use `getModelToken('Name')`. For string tokens: add `{ provide: 'TOKEN', useValue: mockObject }`.

### "X is not a function" or "namespace-style import cannot be called"
**Cause**: Wrong import style. Common with `supertest`.
**Fix**: Use `import request from 'supertest'` (default import), NOT `import * as request from 'supertest'`.

### Mongoose model not found
**Cause**: The string in `@InjectModel('Name')` doesn't match `MongooseModule.forFeature([{ name: 'Name' }])`.
**Fix**: Open both the service file and the module file. Verify the name strings are identical.

### Rust addon load failure
**Cause**: The `.node` binary isn't built or isn't at the expected path.
**Fix**: Run `npx nx build engine-core`. For tests, this doesn't matter — `MockEngineBridgeService` is used.

### Circular dependency warning
**Cause**: Module A imports Module B which imports Module A.
**Fix**: Use `forwardRef(() => ModuleA)` in the imports array.

---

## Regaining Context After Context Loss

Context can be lost through: auto-compaction, session restart, or conversation continuation.

### Step 1: Check What You Already Have
- This CLAUDE.md loads automatically — it has the stable project truth
- MEMORY.md loads automatically — it has the current state (what's built, what's pending, recent gotchas)
- Together they should be enough for most tasks

### Step 2: Check Git State
```bash
git status
git log --oneline -10
git diff --stat HEAD~3  # See recent changes
```

### Step 3: If MEMORY.md Is Stale or Missing Critical Context
Read the session transcript JSONL files to recover what happened:

**Where JSONL files live:**
```
~/.claude/projects/-Users-kumardivyarajat-WebstormProjects-Notiflo/*.jsonl
```

**How to find them:**
```bash
ls -lt ~/.claude/projects/-Users-kumardivyarajat-WebstormProjects-Notiflo/*.jsonl
```
Files are named by session UUID. Most recent = most relevant. They can be large (5-10MB).

**How to extract user messages (the decisions and requests):**
```bash
# Use Grep tool with pattern to find user messages:
Grep pattern='"role":"user"' path="~/.claude/projects/-Users-kumardivyarajat-WebstormProjects-Notiflo/" glob="*.jsonl"
```

**How to read them:** Each line is a JSON object. Use the Read tool with offset/limit to read in chunks of 200-300 lines. Look for entries with `"role":"user"` that contain actual text content (not tool results). Extract the user's messages chronologically to understand what was discussed.

**What to look for:**
- User's original request/task
- Key decisions made
- Clarifications provided
- Errors encountered and how they were resolved
- What was completed vs what was in progress

### Step 4: Update MEMORY.md
After recovering context, immediately update MEMORY.md so this doesn't happen again.

---

## Memory & Context Management

### Two Files, Two Purposes
| File | Location | Loaded | Purpose |
|---|---|---|---|
| `CLAUDE.md` | Project root | Automatically (every session) | Stable truths — identity, architecture, patterns, preferences |
| `MEMORY.md` | Auto-memory dir | Automatically (system prompt) | Fluid state — what's built, what's pending, gotchas, plan status |

### Auto-Memory Directory
Location: `~/.claude/projects/-Users-kumardivyarajat-WebstormProjects-Notiflo/memory/`

- `MEMORY.md` is loaded into system prompt every session (keep under 200 lines)
- Create topic files (e.g., `debugging.md`, `decisions.md`) for overflow and link from MEMORY.md

### When to Update MEMORY.md
- **Before starting heavy parallel agent work** — capture current state so post-compaction recovery is possible
- **After completing a feature or milestone** — record what was done
- **After discovering a gotcha** — save it so you don't hit it again
- **After making an architectural decision** — record the decision and reasoning
- **Before ending a session** — capture anything that would be lost

### What MEMORY.md Should Always Contain
- Current git branch and its purpose
- What's been built recently (last 1-2 sessions)
- What's pending / in progress
- Active plan reference (if any)
- Gotchas discovered in recent sessions
- Any test failures and their status (pre-existing vs new)

### Compaction — The Problem and Mitigations

**The problem:** Auto-compaction summarizes the conversation to free context space. The summarizer does NOT receive CLAUDE.md or custom instructions. It can lose: architectural decisions, error details, file paths, the "why" behind changes.

**Mitigations:**

1. **Proactive MEMORY.md updates** — write key decisions to MEMORY.md BEFORE context pressure builds. This is the most reliable defense because MEMORY.md reloads after compaction.

2. **Manual compaction when you notice context getting long:**
   ```
   /compact Preserve: all file changes and their purposes, test results, errors encountered,
   architectural decisions, what was built this session, what is still in progress
   ```

3. **After any compaction (auto or manual):**
   - Re-read this CLAUDE.md (stable context)
   - Re-read MEMORY.md (current state)
   - Check `git status` and `git log` (what actually changed on disk)
   - Resume work without asking the user to re-explain

4. **Plan files survive compaction better** — use `/plan` or plan mode for complex multi-step tasks. Plan artifacts in `~/.claude/plans/` persist independently of conversation context.

5. **Parallel agents get their own context** — heavy exploration/research in subagents keeps the main conversation leaner and delays compaction.

---

## How to Update and Track the Current Plan

### Where Plans Live
```
~/.claude/plans/*.md
```
Plans are created via plan mode and persist across sessions.

### Checking for an Active Plan
Look for `plan file exists from plan mode at:` in system reminders, or:
```bash
ls -lt ~/.claude/plans/*.md
```

### Updating a Plan
- Read the current plan file
- Edit it to reflect completed items and new decisions
- If the plan is complete, note that in MEMORY.md and move on

### Creating a New Plan
Use plan mode (`/plan` or `EnterPlanMode`) for any non-trivial multi-step task. This creates a structured artifact that:
- Survives compaction better than conversation context
- Can be referenced in future sessions
- Gives the user a clear view of what will happen before code is written

---

## Parallel Agents — How to Use Effectively

### When to Use Parallel Agents
- Independent test suites that don't share files
- Independent module implementations
- Research tasks (reading files, exploring code)
- Any work that doesn't require sequential decision-making

### When NOT to Use
- Tasks that modify the same files (merge conflicts)
- Tasks where one depends on another's output
- Tasks that need user input mid-way

### Best Practices
- Give each agent a clear, self-contained task description with ALL context it needs
- Specify exactly which files to create/modify
- Tell the agent whether to write code or just research
- After agents complete, verify their work doesn't conflict
- Run the full test suite after merging agent work

### Avoiding Agent-Caused Problems
- Never have two agents modify the same file
- Always run tests after agent work completes
- If an agent's output looks wrong, read the agent's output file before applying fixes

---

## How to Coordinate with the User

### When to Proceed Autonomously
- Fixing a bug that's clearly defined
- Implementing a feature that's been planned and approved
- Running tests after changes
- Updating MEMORY.md

### When to Ask First
- Architectural decisions that affect multiple modules
- Choosing between multiple valid approaches
- Deleting or significantly restructuring existing code
- Adding new dependencies
- Anything that changes the public API surface

### Communication Style
- Be direct — state what you're doing and why
- Don't pad with unnecessary context the user already knows
- If you're unsure, say so — don't pretend to remember context you've lost
- When presenting options, give a recommendation with reasoning

---

## Anti-Patterns — Things That Have Burned Us

- **Manual file creation instead of NX CLI** — creates incorrect structure, missing test files, wrong module wiring
- **`import * as X from 'module'`** (namespace import) for packages that export defaults — use `import X from 'module'` for supertest, etc.
- **Not verifying Mongoose model name strings** — `@InjectModel('X')` and `forFeature({ name: 'X' })` must match exactly
- **Forgetting string DI token aliases** — if a service uses `@Inject('ServiceName')`, the providing module MUST have `{ provide: 'ServiceName', useExisting: ServiceClass }`
- **Not running full test suite after changes** — a fix in one module can break another through DI
- **Passing `null` instead of `undefined`** to napi-rs `Option<String>` fields — Rust expects `undefined`
- **Not updating MEMORY.md before heavy work** — leads to context loss after compaction

---

## Environment Prerequisites

### For Unit Tests (most common)
- Nothing needed — all dependencies are mocked
- `npx nx test <project>` just works

### For Integration/E2E Tests
- MongoDB must be available (MongoMemoryServer handles this automatically in test setup)
- No Redis or Kafka needed — mocked in tests

### For Running the App (`npx nx serve notiflo`)
- MongoDB must be running locally (or set `MONGODB_URI` env var)
- Rust addon must be built (`npx nx build engine-core`) OR the app gracefully degrades via `@Optional()` injection
- Redis and Kafka are optional — features degrade gracefully without them

---

## User Preferences

- **TDD-first**: Always write tests before implementation. Tests are the source of truth for the entire platform.
- **Use NX/Nest CLI generators**: ALWAYS. `nx generate lib`, `nx generate resource`, etc. Never manually create module scaffolding.
- **Think before coding**: Never jump to implementation. Understand the problem, read existing code, plan the approach.
- **No over-engineering**: Only build what's needed now. Three similar lines > premature abstraction.
- **Commit only when asked**: Never auto-commit.
- **Parallel agents**: Use them for independent work to maximize throughput.
- **Don't ask user to re-explain**: Read CLAUDE.md, MEMORY.md, git log, and JSONL transcripts. All context should be recoverable without bothering the user.
- **Throughput is king**: Every architectural decision should be evaluated against the 2-4M notifs/sec target. If something won't scale, flag it.

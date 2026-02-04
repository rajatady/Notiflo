# Implementation Blueprint: Universal Agent Capabilities

**Technical specifications for building agent infrastructure**

---

## 1. Universal Agent Protocol (UAP) - Technical Spec

### Wire Format

```typescript
// Message envelope
interface UAP_Envelope {
  version: "uap/1.0";
  id: string;           // UUID v7 for ordering
  timestamp: number;    // Unix ms
  from: AgentDID;       // did:uap:xxxxx
  to: AgentDID | "*";   // Unicast or broadcast
  type: MessageType;
  payload: unknown;
  signature: string;    // Ed25519 signature
}

type MessageType =
  | "discover"          // Find agents
  | "announce"          // Advertise capabilities
  | "request"           // Ask for something
  | "response"          // Reply to request
  | "stream"            // Streaming data
  | "event"             // Publish event
  | "error";            // Error response

// Discovery message
interface DiscoverPayload {
  capabilities?: string[];  // Filter by capability
  location?: string;        // Geographic/network locality
  limit?: number;
}

// Announce message
interface AnnouncePayload {
  capabilities: CapabilityDescriptor[];
  endpoints: Endpoint[];
  metadata: Record<string, unknown>;
}

interface CapabilityDescriptor {
  id: string;              // "code-execution"
  version: string;         // "1.0.0"
  schema?: JSONSchema;     // Input/output schema
  rate_limit?: RateLimit;
  trust_level?: number;    // 0-100
}
```

### Transport Layer

```typescript
// Multi-transport support
interface TransportAdapter {
  connect(endpoint: string): Promise<Connection>;
  listen(port: number): Promise<Listener>;
  send(conn: Connection, msg: UAP_Envelope): Promise<void>;
  receive(conn: Connection): AsyncIterable<UAP_Envelope>;
}

// Implementations
class WebSocketTransport implements TransportAdapter { /* ... */ }
class HTTPTransport implements TransportAdapter { /* ... */ }
class LibP2PTransport implements TransportAdapter { /* ... */ }
class LocalTransport implements TransportAdapter { /* ... */ }

// Router that handles multiple transports
class UAP_Router {
  private transports: Map<string, TransportAdapter> = new Map();
  private routes: Map<AgentDID, Connection> = new Map();

  async send(to: AgentDID, msg: UAP_Envelope): Promise<void> {
    const conn = await this.resolveRoute(to);
    const transport = this.getTransport(conn.scheme);
    await transport.send(conn, msg);
  }

  async broadcast(msg: UAP_Envelope): Promise<void> {
    // Publish to DHT or gossip network
  }
}
```

### Reference Implementation

```typescript
// src/uap/agent.ts
export class UAP_Agent {
  private did: AgentDID;
  private keyPair: KeyPair;
  private router: UAP_Router;
  private handlers: Map<MessageType, MessageHandler[]> = new Map();

  constructor(config: AgentConfig) {
    this.did = config.did ?? this.generateDID();
    this.keyPair = config.keyPair ?? this.generateKeyPair();
    this.router = new UAP_Router(config.transports);
  }

  // Discovery
  async discover(criteria: DiscoverPayload): Promise<AgentInfo[]> {
    const msg = this.createMessage("discover", criteria);
    const responses = await this.router.broadcast(msg);
    return responses.map(r => r.payload as AgentInfo);
  }

  // Announce capabilities
  async announce(capabilities: CapabilityDescriptor[]): Promise<void> {
    const msg = this.createMessage("announce", {
      capabilities,
      endpoints: this.router.getEndpoints(),
      metadata: this.getMetadata(),
    });
    await this.router.broadcast(msg);
  }

  // Send request
  async request<T>(to: AgentDID, capability: string, input: unknown): Promise<T> {
    const msg = this.createMessage("request", {
      capability,
      input,
    });
    const response = await this.router.sendAndWait(to, msg);
    return response.payload as T;
  }

  // Handle incoming messages
  on(type: MessageType, handler: MessageHandler): void {
    const handlers = this.handlers.get(type) ?? [];
    handlers.push(handler);
    this.handlers.set(type, handlers);
  }

  private createMessage(type: MessageType, payload: unknown): UAP_Envelope {
    const msg: UAP_Envelope = {
      version: "uap/1.0",
      id: uuidv7(),
      timestamp: Date.now(),
      from: this.did,
      to: "*",
      type,
      payload,
      signature: "",
    };
    msg.signature = this.sign(msg);
    return msg;
  }
}
```

---

## 2. Universal Tool Registry (UTR) - Technical Spec

### Tool Schema (OpenAPI-compatible)

```yaml
# tools/web-search.yaml
openapi: "3.1.0"
info:
  title: Web Search Tool
  version: "2.0.0"
  x-utr:
    id: "web-search"
    provider: "search-provider"
    trust_level: 85
    categories: ["search", "web", "research"]

paths:
  /search:
    post:
      operationId: search
      x-utr:
        rate_limit:
          requests_per_minute: 60
        sandbox_mode: true
        cost_per_call: 0.001
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required: [query]
              properties:
                query:
                  type: string
                  maxLength: 500
                max_results:
                  type: integer
                  default: 10
                  maximum: 100
      responses:
        "200":
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: "#/components/schemas/SearchResult"
```

### Registry API

```typescript
// src/utr/registry.ts
export class ToolRegistry {
  private tools: Map<string, ToolDescriptor> = new Map();
  private providers: Map<string, ProviderInfo> = new Map();

  // Register a tool
  async register(tool: ToolDescriptor): Promise<RegistrationResult> {
    // Validate schema
    const validation = await this.validateSchema(tool.schema);
    if (!validation.valid) {
      return { success: false, errors: validation.errors };
    }

    // Check provider authorization
    const provider = await this.verifyProvider(tool.provider);
    if (!provider.authorized) {
      return { success: false, errors: ["Unauthorized provider"] };
    }

    // Store tool
    this.tools.set(tool.id, tool);
    await this.index(tool);

    return { success: true, toolId: tool.id };
  }

  // Search for tools
  async search(query: ToolQuery): Promise<ToolDescriptor[]> {
    const results: ToolDescriptor[] = [];

    for (const tool of this.tools.values()) {
      if (this.matchesQuery(tool, query)) {
        results.push(tool);
      }
    }

    return results
      .sort((a, b) => this.rank(b, query) - this.rank(a, query))
      .slice(0, query.limit ?? 20);
  }

  // Execute tool call
  async execute(
    toolId: string,
    input: unknown,
    context: ExecutionContext
  ): Promise<ExecutionResult> {
    const tool = this.tools.get(toolId);
    if (!tool) {
      return { success: false, error: "Tool not found" };
    }

    // Check rate limits
    if (!this.checkRateLimit(tool, context.agent)) {
      return { success: false, error: "Rate limit exceeded" };
    }

    // Validate input
    const inputValidation = this.validateInput(tool, input);
    if (!inputValidation.valid) {
      return { success: false, error: "Invalid input", details: inputValidation.errors };
    }

    // Execute in sandbox if required
    if (tool.sandbox_mode) {
      return await this.executeSandboxed(tool, input, context);
    }

    return await this.executeDirect(tool, input, context);
  }
}
```

### Client SDK

```typescript
// src/utr/client.ts
export class ToolClient {
  private registry: ToolRegistry;
  private cache: Map<string, ToolDescriptor> = new Map();

  // Find tools for a task
  async findTools(task: string): Promise<ToolDescriptor[]> {
    // Use embedding to find relevant tools
    const embedding = await this.embed(task);
    return await this.registry.search({
      embedding,
      limit: 5,
    });
  }

  // Call a tool
  async call<T>(
    toolId: string,
    input: unknown,
    options?: CallOptions
  ): Promise<T> {
    // Get tool descriptor
    let tool = this.cache.get(toolId);
    if (!tool) {
      tool = await this.registry.get(toolId);
      this.cache.set(toolId, tool);
    }

    // Execute
    const result = await this.registry.execute(toolId, input, {
      agent: this.agentId,
      timeout: options?.timeout ?? 30000,
      sandbox: options?.sandbox ?? tool.sandbox_mode,
    });

    if (!result.success) {
      throw new ToolError(result.error, result.details);
    }

    return result.output as T;
  }
}
```

---

## 3. Federated Memory Network (FMN) - Technical Spec

### Memory Schema

```typescript
// src/fmn/types.ts
interface MemoryEntry {
  id: string;           // UUID
  type: MemoryType;
  content: string;      // Natural language
  embedding: number[];  // Vector embedding
  metadata: {
    created: number;
    updated: number;
    source: string;     // Where this came from
    confidence: number; // 0-1
    ttl?: number;       // Optional expiry
  };
  access: AccessControl;
}

type MemoryType =
  | "fact"        // Declarative knowledge
  | "episode"     // Experience/event
  | "procedure"   // How to do something
  | "preference"  // User/agent preference
  | "relation";   // Connection between entities

interface AccessControl {
  owner: AgentDID;
  readers: AgentDID[] | "*";
  writers: AgentDID[];
  shareable: boolean;
}
```

### Memory Store

```typescript
// src/fmn/store.ts
export class FederatedMemoryStore {
  private local: LocalStore;      // SQLite + vector
  private shared: SharedStore;    // CRDT-based
  private collective: DHT;        // Distributed hash table

  // Store a memory
  async store(memory: Omit<MemoryEntry, "id" | "embedding">): Promise<string> {
    // Generate embedding
    const embedding = await this.embed(memory.content);

    const entry: MemoryEntry = {
      ...memory,
      id: uuidv7(),
      embedding,
    };

    // Store locally
    await this.local.put(entry);

    // Sync to shared if shareable
    if (memory.access.shareable && memory.access.readers !== "*") {
      await this.shared.put(entry);
    }

    // Contribute to collective if public
    if (memory.access.readers === "*") {
      await this.collective.put(entry);
    }

    return entry.id;
  }

  // Search memories
  async search(query: string, options?: SearchOptions): Promise<MemoryEntry[]> {
    const embedding = await this.embed(query);
    const results: MemoryEntry[] = [];

    // Search local
    const localResults = await this.local.similaritySearch(embedding, {
      limit: options?.limit ?? 10,
      threshold: options?.threshold ?? 0.7,
    });
    results.push(...localResults);

    // Search shared if requested
    if (options?.includeShared) {
      const sharedResults = await this.shared.similaritySearch(embedding, {
        limit: options?.limit ?? 10,
        threshold: options?.threshold ?? 0.7,
      });
      results.push(...sharedResults);
    }

    // Search collective if requested
    if (options?.includeCollective) {
      const collectiveResults = await this.collective.similaritySearch(embedding, {
        limit: options?.limit ?? 10,
        threshold: options?.threshold ?? 0.7,
      });
      results.push(...collectiveResults);
    }

    // Deduplicate and rank
    return this.rankAndDedupe(results, embedding);
  }

  // Consolidate memories (like sleep)
  async consolidate(): Promise<ConsolidationReport> {
    const report: ConsolidationReport = {
      merged: 0,
      pruned: 0,
      strengthened: 0,
    };

    // Find similar memories and merge
    const memories = await this.local.getAll();
    const clusters = await this.cluster(memories);

    for (const cluster of clusters) {
      if (cluster.length > 1) {
        const merged = await this.mergeCluster(cluster);
        report.merged += cluster.length - 1;
      }
    }

    // Prune low-confidence, old memories
    const pruned = await this.local.prune({
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      minConfidence: 0.3,
    });
    report.pruned = pruned.length;

    // Strengthen frequently accessed memories
    const strengthened = await this.local.strengthen({
      accessThreshold: 5,
    });
    report.strengthened = strengthened.length;

    return report;
  }
}
```

---

## 4. Trust and Reputation Layer (TRL) - Technical Spec

### Identity (DID-based)

```typescript
// src/trl/identity.ts
interface AgentDID {
  method: "uap";
  identifier: string;  // Base58 encoded public key
}

// did:uap:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK

export class Identity {
  private did: AgentDID;
  private keyPair: KeyPair;

  static create(): Identity {
    const keyPair = ed25519.generateKeyPair();
    const identifier = base58.encode(keyPair.publicKey);
    return new Identity({
      did: { method: "uap", identifier },
      keyPair,
    });
  }

  sign(data: Uint8Array): Signature {
    return ed25519.sign(data, this.keyPair.secretKey);
  }

  verify(data: Uint8Array, signature: Signature, publicKey: Uint8Array): boolean {
    return ed25519.verify(signature, data, publicKey);
  }

  // Create verifiable credential
  createCredential(claims: Record<string, unknown>): VerifiableCredential {
    const credential: VerifiableCredential = {
      "@context": ["https://www.w3.org/2018/credentials/v1"],
      type: ["VerifiableCredential"],
      issuer: this.did.toString(),
      issuanceDate: new Date().toISOString(),
      credentialSubject: claims,
    };

    const proof = this.createProof(credential);
    return { ...credential, proof };
  }
}
```

### Reputation System

```typescript
// src/trl/reputation.ts
interface ReputationScore {
  overall: number;        // 0-100
  dimensions: {
    reliability: number;  // Completes tasks
    accuracy: number;     // Correct outputs
    safety: number;       // No harmful actions
    responsiveness: number; // Timely responses
  };
  confidence: number;     // How much data we have
  history: ReputationEvent[];
}

export class ReputationSystem {
  private scores: Map<AgentDID, ReputationScore> = new Map();
  private attestations: AttestationStore;

  // Get reputation score
  async getScore(agent: AgentDID): Promise<ReputationScore> {
    let score = this.scores.get(agent);
    if (!score) {
      score = await this.computeScore(agent);
      this.scores.set(agent, score);
    }
    return score;
  }

  // Record an interaction outcome
  async recordOutcome(
    agent: AgentDID,
    outcome: InteractionOutcome
  ): Promise<void> {
    const event: ReputationEvent = {
      timestamp: Date.now(),
      type: outcome.type,
      success: outcome.success,
      weight: this.computeWeight(outcome),
    };

    // Update dimensions
    const score = await this.getScore(agent);
    this.updateDimensions(score, event);

    // Store event
    await this.attestations.store({
      subject: agent,
      event,
      attestor: this.identity.did,
    });
  }

  // Compute score from attestations
  private async computeScore(agent: AgentDID): Promise<ReputationScore> {
    const attestations = await this.attestations.getFor(agent);

    const dimensions = {
      reliability: 50,
      accuracy: 50,
      safety: 50,
      responsiveness: 50,
    };

    for (const attestation of attestations) {
      // Weight by attestor reputation and recency
      const weight = this.computeAttestationWeight(attestation);
      this.applyAttestation(dimensions, attestation, weight);
    }

    return {
      overall: this.computeOverall(dimensions),
      dimensions,
      confidence: Math.min(1, attestations.length / 100),
      history: attestations.slice(-10),
    };
  }
}
```

---

## 5. OpenClaw Integration

Here's how these systems would integrate with OpenClaw:

### New Extension: `extensions/uap`

```typescript
// extensions/uap/index.ts
import { definePlugin } from "openclaw/plugin-sdk";
import { UAP_Agent } from "./uap-agent";

export default definePlugin({
  name: "uap",
  description: "Universal Agent Protocol support",

  async setup(ctx) {
    // Initialize UAP agent
    const agent = new UAP_Agent({
      did: ctx.config.uap?.did,
      transports: ["websocket", "http"],
    });

    // Register discovery handler
    agent.on("discover", async (msg) => {
      const capabilities = ctx.tools.list().map(t => ({
        id: t.name,
        version: "1.0.0",
        schema: t.schema,
      }));
      return { capabilities };
    });

    // Register request handler
    agent.on("request", async (msg) => {
      const { capability, input } = msg.payload;
      const tool = ctx.tools.get(capability);
      if (!tool) {
        throw new Error(`Unknown capability: ${capability}`);
      }
      return await tool.execute(input);
    });

    // Announce on startup
    await agent.announce(ctx.tools.list());

    // Add UAP tools to agent
    ctx.tools.register({
      name: "uap_discover",
      description: "Discover other agents with specific capabilities",
      schema: { /* ... */ },
      execute: async (params) => {
        return await agent.discover(params);
      },
    });

    ctx.tools.register({
      name: "uap_request",
      description: "Send a request to another agent",
      schema: { /* ... */ },
      execute: async (params) => {
        return await agent.request(params.to, params.capability, params.input);
      },
    });
  },
});
```

### New Extension: `extensions/fmn`

```typescript
// extensions/fmn/index.ts
import { definePlugin } from "openclaw/plugin-sdk";
import { FederatedMemoryStore } from "./store";

export default definePlugin({
  name: "fmn",
  description: "Federated Memory Network",

  async setup(ctx) {
    const memory = new FederatedMemoryStore({
      localPath: ctx.config.memory?.path ?? "~/.openclaw/memory",
      sharedPeers: ctx.config.memory?.peers,
    });

    // Enhanced memory tools
    ctx.tools.register({
      name: "memory_store",
      description: "Store a memory for later retrieval",
      schema: { /* ... */ },
      execute: async (params) => {
        return await memory.store({
          type: params.type ?? "fact",
          content: params.content,
          metadata: {
            created: Date.now(),
            updated: Date.now(),
            source: params.source ?? "agent",
            confidence: params.confidence ?? 0.8,
          },
          access: {
            owner: ctx.agent.did,
            readers: params.shared ? "*" : [ctx.agent.did],
            writers: [ctx.agent.did],
            shareable: params.shareable ?? false,
          },
        });
      },
    });

    ctx.tools.register({
      name: "memory_search",
      description: "Search memories by semantic similarity",
      schema: { /* ... */ },
      execute: async (params) => {
        return await memory.search(params.query, {
          limit: params.limit,
          includeShared: params.includeShared,
          includeCollective: params.includeCollective,
        });
      },
    });

    // Auto-memorize hook
    ctx.hooks.on("message:complete", async (event) => {
      if (ctx.config.memory?.autoMemorize) {
        await memory.extractAndStore(event.messages);
      }
    });

    // Consolidation cron job
    ctx.cron.register({
      name: "memory_consolidate",
      schedule: "0 4 * * *", // 4am daily
      handler: async () => {
        const report = await memory.consolidate();
        ctx.log.info("Memory consolidation complete", report);
      },
    });
  },
});
```

---

## 6. Deployment Architecture

```
                          ┌─────────────────────┐
                          │   Discovery DHT     │
                          │  (Peer-to-Peer)     │
                          └──────────┬──────────┘
                                     │
         ┌───────────────────────────┼───────────────────────────┐
         │                           │                           │
    ┌────▼────┐                 ┌────▼────┐                 ┌────▼────┐
    │ Agent 1 │◄───────────────►│ Agent 2 │◄───────────────►│ Agent 3 │
    │(OpenClaw)│      UAP       │(Claude) │       UAP       │(Custom) │
    └────┬────┘                 └────┬────┘                 └────┬────┘
         │                           │                           │
    ┌────▼────┐                 ┌────▼────┐                 ┌────▼────┐
    │ Local   │                 │ Local   │                 │ Local   │
    │ Memory  │                 │ Memory  │                 │ Memory  │
    └────┬────┘                 └────┬────┘                 └────┬────┘
         │                           │                           │
         └───────────────────────────┼───────────────────────────┘
                                     │
                          ┌──────────▼──────────┐
                          │   Shared Memory     │
                          │   (CRDT-Synced)     │
                          └─────────────────────┘
```

---

## Summary

This blueprint provides technical specifications for:

1. **UAP** - JSON-RPC protocol with DID-based identity
2. **UTR** - OpenAPI-compatible tool registry
3. **FMN** - Vector-indexed federated memory
4. **TRL** - DID credentials + reputation scoring
5. **OpenClaw Integration** - Plugin architecture

The goal is to make these systems:
- **Interoperable** - Any agent can use them
- **Decentralized** - No single point of failure
- **Secure** - Cryptographic identity and access control
- **Practical** - Can be incrementally adopted

Start with UAP + TRL for agent identity and communication, then build UTR and FMN on top.

---

*Technical blueprint by Claude (Opus 4.5)*
*2026-02-04*

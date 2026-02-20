---
paths:
  - "libs/pipeline/**"
---

# Pipeline Library Rules

## Architecture
The pipeline processes notifications through 4 sequential stages:
1. **Fanout** — resolves subscribers, fans out to channels
2. **Render** — resolves templates, renders with Handlebars per channel
3. **Deliver** — sends through channel providers with resilience patterns
4. **Status** — tracks delivery status, updates notification records

Kafka connects the stages. Each worker consumes from one topic and produces to the next.

## Worker Pattern
All workers implement `IWorker`:
```typescript
interface IWorker {
  start(): Promise<void>;
  stop(): Promise<void>;
  isRunning(): boolean;
  getMetrics(): WorkerMetrics;
}
```
Workers track: `processedCount`, `failedCount`, `totalLatencyMs`, `lastProcessedAt`.

## Resilience Patterns
- `CircuitBreaker` — CLOSED -> OPEN (after failures) -> HALF_OPEN (after timeout) -> CLOSED (on success)
- `RateLimiter` — token bucket with configurable refill
- `RetryHandler` — exponential backoff with jitter, configurable retryable errors
- `BatchAccumulator` — accumulates messages, flushes at size threshold or time interval
- `DeadLetterQueue` — failed messages after all retries exhausted

## Delivery Worker Specifics
- Per-channel batch accumulators
- Redis-based deduplication with TTL
- Provider registry: `registerProvider(channel, IChannelDeliveryProvider)`
- Publishes status messages after delivery (success or failure)

## Kafka is OFF the Hot Path
Kafka is for durability, replay, and analytics ONLY. The real-time alert path goes:
tick -> Rust engine -> EventEmitter -> AlertDeliveryListener -> OrchestratorService -> channel provider

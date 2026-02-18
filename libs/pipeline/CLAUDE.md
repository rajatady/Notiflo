# Pipeline Library — libs/pipeline/

Message processing pipeline for notification delivery.

## 4-Stage Pipeline
1. **Fanout** (`fanout-worker.service.ts`) — resolves subscribers, fans out to channels
2. **Render** (`render-worker.service.ts`) — resolves templates, renders with Handlebars
3. **Deliver** (`deliver-worker.service.ts`) — sends via channel providers with resilience
4. **Status** (`status-worker.service.ts`) — tracks delivery status

## Key Interfaces
- `IWorker` — common worker contract (start, stop, isRunning, getMetrics)
- `ISubscriberResolver` — injected into fanout worker
- `IChannelDeliveryProvider` — registered in delivery worker per channel

## Resilience (libs/pipeline/pipeline/src/lib/resilience/)
- CircuitBreaker, RateLimiter, RetryHandler, BatchAccumulator

## Kafka (libs/pipeline/pipeline/src/lib/kafka/)
- KafkaProducerService, KafkaConsumerService, KafkaAdminService
- Kafka is for durability/analytics ONLY — not on the real-time hot path

## Cache (libs/pipeline/pipeline/src/lib/cache/)
- Redis-based: SubscriberCacheService, TemplateCacheService

## Testing
```bash
npx nx test pipeline-pipeline
```

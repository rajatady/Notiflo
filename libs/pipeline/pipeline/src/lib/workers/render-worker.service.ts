import {
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import Handlebars from 'handlebars';

import { KafkaConsumerService } from '../kafka/kafka-consumer.service';
import { KafkaProducerService } from '../kafka/kafka-producer.service';
import { TemplateCacheService } from '../cache/template-cache.service';
import {
  DeliverMessage,
  PipelineTopics,
  RenderMessage,
  RenderedContent,
} from '../interfaces/pipeline.interfaces';
import { IWorker, WorkerMetrics } from '../interfaces/worker.interface';

// ---------------------------------------------------------------------------
// Injection tokens
// ---------------------------------------------------------------------------

/**
 * Token for a template resolver that fetches raw templates from the DB.
 *
 * Expected shape:
 * ```ts
 * interface ITemplateResolver {
 *   resolve(orgId: string, templateId: string, channel: string): Promise<{
 *     subject?: string;
 *     body: string;
 *     version: string;
 *     metadata?: Record<string, unknown>;
 *   }>;
 * }
 * ```
 */
export const TEMPLATE_RESOLVER = Symbol('TEMPLATE_RESOLVER');

export interface ResolvedTemplate {
  subject?: string;
  body: string;
  version: string;
  metadata?: Record<string, unknown>;
}

export interface ITemplateResolver {
  resolve(
    orgId: string,
    templateId: string,
    channel: string,
  ): Promise<ResolvedTemplate>;
}

// ---------------------------------------------------------------------------
// Default provider mapping (channel -> provider name)
// ---------------------------------------------------------------------------

const DEFAULT_PROVIDER_MAP: Record<string, string> = {
  email: 'ses',
  sms: 'twilio',
  push: 'fcm',
  whatsapp: 'twilio',
  in_app: 'internal',
  webhook: 'http',
  slack: 'slack',
};

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------

@Injectable()
export class RenderWorkerService implements OnModuleInit, IWorker {
  private readonly logger = new Logger(RenderWorkerService.name);
  private running = false;

  // Metrics
  private processedCount = 0;
  private failedCount = 0;
  private totalLatencyMs = 0;
  private lastProcessedAt: string | null = null;
  private cacheHitCount = 0;
  private cacheMissCount = 0;

  // Late-bound template resolver
  private templateResolver: ITemplateResolver | null = null;

  constructor(
    private readonly kafkaConsumer: KafkaConsumerService,
    private readonly kafkaProducer: KafkaProducerService,
    private readonly templateCache: TemplateCacheService,
    @Optional()
    @Inject(TEMPLATE_RESOLVER)
    templateResolver?: ITemplateResolver,
  ) {
    if (templateResolver) {
      this.templateResolver = templateResolver;
    }
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  async onModuleInit(): Promise<void> {
    await this.start();
  }

  async start(): Promise<void> {
    if (this.running) return;

    this.logger.log('Starting render worker...');
    await this.kafkaConsumer.subscribe(
      PipelineTopics.RENDER,
      'render-workers',
      (message: RenderMessage) => this.processRenderMessage(message),
    );
    this.running = true;
    this.logger.log('Render worker started');
  }

  async stop(): Promise<void> {
    this.running = false;
    this.logger.log('Render worker stopped');
  }

  isRunning(): boolean {
    return this.running;
  }

  getMetrics(): WorkerMetrics & {
    cacheHitCount: number;
    cacheMissCount: number;
  } {
    return {
      processed: this.processedCount,
      failed: this.failedCount,
      avgLatencyMs:
        this.processedCount > 0
          ? this.totalLatencyMs / this.processedCount
          : 0,
      lastProcessedAt: this.lastProcessedAt,
      cacheHitCount: this.cacheHitCount,
      cacheMissCount: this.cacheMissCount,
    };
  }

  // -----------------------------------------------------------------------
  // Late binding
  // -----------------------------------------------------------------------

  setTemplateResolver(resolver: ITemplateResolver): void {
    this.templateResolver = resolver;
    this.logger.log('Template resolver bound');
  }

  // -----------------------------------------------------------------------
  // Core logic
  // -----------------------------------------------------------------------

  async processRenderMessage(message: RenderMessage): Promise<void> {
    const start = Date.now();

    try {
      this.logger.debug(
        `Processing render message ${message.id} [template=${message.templateId}, channel=${message.channel}]`,
      );

      // 1. Try to get the compiled template from cache
      const { subjectTemplate, bodyTemplate, version } =
        await this.getOrFetchTemplate(message);

      // 2. Merge subscriber variables with message variables
      const mergedVariables = { ...message.variables };

      // 3. Render templates
      const renderedContent = this.renderContent(
        subjectTemplate,
        bodyTemplate,
        mergedVariables,
      );

      // 4. Determine provider for the channel
      const provider =
        DEFAULT_PROVIDER_MAP[message.channel] ?? message.channel;

      // 5. Create DeliverMessage
      const deliverMessage: DeliverMessage = {
        id: uuidv4(),
        orgId: message.orgId,
        timestamp: new Date().toISOString(),
        traceId: message.traceId,
        subscriberId: message.subscriberId,
        channel: message.channel,
        provider,
        renderedContent,
        campaignId: message.campaignId,
        workflowId: message.workflowId,
      };

      // 6. Publish to channel-specific deliver topic
      const deliverTopic = `${PipelineTopics.DELIVER}.${message.channel}`;
      await this.kafkaProducer.send(deliverTopic, deliverMessage);

      this.recordSuccess(start);
    } catch (error) {
      this.failedCount++;
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Failed to process render message ${message.id}: ${err.message}`,
        err.stack,
      );
      throw error;
    }
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private async getOrFetchTemplate(
    message: RenderMessage,
  ): Promise<{
    subjectTemplate: string | null;
    bodyTemplate: string;
    version: string;
  }> {
    // Attempt cache hit using a default version key first
    const cachedVersion = 'latest';
    const cached = await this.templateCache.get(
      message.templateId,
      cachedVersion,
      message.channel,
    );

    if (cached) {
      this.cacheHitCount++;
      // Cached value is JSON: { subject?, body }
      try {
        const parsed = JSON.parse(cached);
        return {
          subjectTemplate: parsed.subject ?? null,
          bodyTemplate: parsed.body,
          version: cachedVersion,
        };
      } catch {
        // If cached value is not JSON, treat it as body-only
        return {
          subjectTemplate: null,
          bodyTemplate: cached,
          version: cachedVersion,
        };
      }
    }

    this.cacheMissCount++;

    // Cache miss: fetch from template resolver
    if (!this.templateResolver) {
      throw new Error(
        `Template resolver not configured. Cannot fetch template ${message.templateId}`,
      );
    }

    const resolved = await this.templateResolver.resolve(
      message.orgId,
      message.templateId,
      message.channel,
    );

    // Compile and cache the template
    const cachePayload = JSON.stringify({
      subject: resolved.subject,
      body: resolved.body,
    });

    await this.templateCache.set(
      message.templateId,
      resolved.version,
      message.channel,
      cachePayload,
    );

    // Also cache under 'latest' for quick lookup
    if (resolved.version !== cachedVersion) {
      await this.templateCache.set(
        message.templateId,
        cachedVersion,
        message.channel,
        cachePayload,
      );
    }

    return {
      subjectTemplate: resolved.subject ?? null,
      bodyTemplate: resolved.body,
      version: resolved.version,
    };
  }

  private renderContent(
    subjectTemplate: string | null,
    bodyTemplate: string,
    variables: Record<string, unknown>,
  ): RenderedContent {
    const compiledBody = Handlebars.compile(bodyTemplate);
    const body = compiledBody(variables);

    let subject: string | undefined;
    if (subjectTemplate) {
      const compiledSubject = Handlebars.compile(subjectTemplate);
      subject = compiledSubject(variables);
    }

    return { subject, body };
  }

  private recordSuccess(startMs: number): void {
    const latency = Date.now() - startMs;
    this.processedCount++;
    this.totalLatencyMs += latency;
    this.lastProcessedAt = new Date().toISOString();
  }
}

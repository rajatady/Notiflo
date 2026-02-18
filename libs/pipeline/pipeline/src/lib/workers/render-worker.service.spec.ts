import { RenderWorkerService, ITemplateResolver, TEMPLATE_RESOLVER } from './render-worker.service';
import {
  Channel,
  PipelineTopics,
  RenderMessage,
} from '../interfaces/pipeline.interfaces';

describe('RenderWorkerService', () => {
  let service: RenderWorkerService;
  let mockKafkaConsumer: { subscribe: jest.Mock };
  let mockKafkaProducer: { send: jest.Mock };
  let mockTemplateCache: { get: jest.Mock; set: jest.Mock };
  let mockTemplateResolver: jest.Mocked<ITemplateResolver>;

  const makeRenderMessage = (overrides?: Partial<RenderMessage>): RenderMessage => ({
    id: 'render-001',
    orgId: 'org-1',
    timestamp: new Date().toISOString(),
    traceId: 'trace-001',
    subscriberId: 'sub-001',
    channel: Channel.EMAIL,
    templateId: 'tmpl-001',
    variables: { name: 'John', product: 'Widget' },
    ...overrides,
  });

  beforeEach(() => {
    mockKafkaConsumer = { subscribe: jest.fn().mockResolvedValue(undefined) };
    mockKafkaProducer = { send: jest.fn().mockResolvedValue(undefined) };
    mockTemplateCache = {
      get: jest.fn().mockResolvedValue(null), // cache miss by default
      set: jest.fn().mockResolvedValue(undefined),
    };
    mockTemplateResolver = {
      resolve: jest.fn().mockResolvedValue({
        subject: 'Hello {{name}}',
        body: '<p>Welcome {{name}}, you ordered {{product}}</p>',
        version: 'v1',
      }),
    };

    service = new RenderWorkerService(
      mockKafkaConsumer as any,
      mockKafkaProducer as any,
      mockTemplateCache as any,
      mockTemplateResolver,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('processRenderMessage', () => {
    it('should resolve template by ID from the resolver on cache miss', async () => {
      const msg = makeRenderMessage();
      await service.processRenderMessage(msg);

      expect(mockTemplateResolver.resolve).toHaveBeenCalledWith(
        'org-1',
        'tmpl-001',
        Channel.EMAIL,
      );
    });

    it('should use cached template on cache hit', async () => {
      mockTemplateCache.get.mockResolvedValueOnce(
        JSON.stringify({
          subject: 'Cached Subject {{name}}',
          body: '<p>Cached body for {{name}}</p>',
        }),
      );

      const msg = makeRenderMessage();
      await service.processRenderMessage(msg);

      // Template resolver should NOT be called on cache hit
      expect(mockTemplateResolver.resolve).not.toHaveBeenCalled();

      // Should publish a deliver message with rendered content
      expect(mockKafkaProducer.send).toHaveBeenCalledWith(
        `${PipelineTopics.DELIVER}.${Channel.EMAIL}`,
        expect.objectContaining({
          renderedContent: expect.objectContaining({
            subject: 'Cached Subject John',
            body: '<p>Cached body for John</p>',
          }),
        }),
      );
    });

    it('should render with Handlebars for target channel', async () => {
      const msg = makeRenderMessage();
      await service.processRenderMessage(msg);

      // Should publish to the channel-specific deliver topic
      expect(mockKafkaProducer.send).toHaveBeenCalledWith(
        `${PipelineTopics.DELIVER}.${Channel.EMAIL}`,
        expect.objectContaining({
          channel: Channel.EMAIL,
          provider: 'ses', // email -> ses from DEFAULT_PROVIDER_MAP
          renderedContent: expect.objectContaining({
            subject: 'Hello John',
            body: '<p>Welcome John, you ordered Widget</p>',
          }),
        }),
      );
    });

    it('should render for SMS channel with correct provider', async () => {
      mockTemplateResolver.resolve.mockResolvedValueOnce({
        body: 'Hi {{name}}, your order is shipped.',
        version: 'v1',
      });

      const msg = makeRenderMessage({
        channel: Channel.SMS,
        templateId: 'tmpl-sms-001',
      });

      await service.processRenderMessage(msg);

      expect(mockKafkaProducer.send).toHaveBeenCalledWith(
        `${PipelineTopics.DELIVER}.${Channel.SMS}`,
        expect.objectContaining({
          channel: Channel.SMS,
          provider: 'twilio',
          renderedContent: expect.objectContaining({
            body: 'Hi John, your order is shipped.',
          }),
        }),
      );
    });

    it('should throw when template resolver is not configured and cache misses', async () => {
      // Create service without template resolver
      const serviceNoResolver = new RenderWorkerService(
        mockKafkaConsumer as any,
        mockKafkaProducer as any,
        mockTemplateCache as any,
      );

      const msg = makeRenderMessage();
      await expect(serviceNoResolver.processRenderMessage(msg)).rejects.toThrow(
        /template resolver not configured/i,
      );
    });

    it('should cache the resolved template', async () => {
      const msg = makeRenderMessage();
      await service.processRenderMessage(msg);

      // Should cache under the resolved version
      expect(mockTemplateCache.set).toHaveBeenCalledWith(
        'tmpl-001',
        'v1',
        Channel.EMAIL,
        expect.any(String),
      );

      // Should also cache under 'latest'
      expect(mockTemplateCache.set).toHaveBeenCalledWith(
        'tmpl-001',
        'latest',
        Channel.EMAIL,
        expect.any(String),
      );
    });

    it('should track metrics on success', async () => {
      const msg = makeRenderMessage();
      await service.processRenderMessage(msg);

      const metrics = service.getMetrics();
      expect(metrics.processed).toBe(1);
      expect(metrics.failed).toBe(0);
      expect(metrics.cacheMissCount).toBe(1);
      expect(metrics.cacheHitCount).toBe(0);
    });

    it('should track cache hit metrics', async () => {
      mockTemplateCache.get.mockResolvedValueOnce(
        JSON.stringify({ subject: '{{name}}', body: '{{name}}' }),
      );

      const msg = makeRenderMessage();
      await service.processRenderMessage(msg);

      const metrics = service.getMetrics();
      expect(metrics.cacheHitCount).toBe(1);
      expect(metrics.cacheMissCount).toBe(0);
    });

    it('should increment failedCount on error', async () => {
      mockTemplateResolver.resolve.mockRejectedValueOnce(new Error('DB down'));

      const msg = makeRenderMessage();
      await expect(service.processRenderMessage(msg)).rejects.toThrow('DB down');

      const metrics = service.getMetrics();
      expect(metrics.failed).toBe(1);
      expect(metrics.processed).toBe(0);
    });
  });

  describe('lifecycle', () => {
    it('should subscribe to the render topic on start', async () => {
      await service.start();

      expect(mockKafkaConsumer.subscribe).toHaveBeenCalledWith(
        PipelineTopics.RENDER,
        'render-workers',
        expect.any(Function),
      );
    });

    it('should report running status', async () => {
      expect(service.isRunning()).toBe(false);
      await service.start();
      expect(service.isRunning()).toBe(true);
      await service.stop();
      expect(service.isRunning()).toBe(false);
    });
  });

  describe('setTemplateResolver', () => {
    it('should allow late binding of template resolver', async () => {
      const serviceNoResolver = new RenderWorkerService(
        mockKafkaConsumer as any,
        mockKafkaProducer as any,
        mockTemplateCache as any,
      );

      serviceNoResolver.setTemplateResolver(mockTemplateResolver);

      const msg = makeRenderMessage();
      await serviceNoResolver.processRenderMessage(msg);

      expect(mockTemplateResolver.resolve).toHaveBeenCalled();
    });
  });
});

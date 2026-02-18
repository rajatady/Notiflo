import { FanoutWorkerService, ISubscriberResolver } from './fanout-worker.service';
import {
  Channel,
  FanoutMessage,
  PipelineTopics,
} from '../interfaces/pipeline.interfaces';

describe('FanoutWorkerService', () => {
  let service: FanoutWorkerService;
  let mockKafkaConsumer: { subscribe: jest.Mock };
  let mockKafkaProducer: { send: jest.Mock };
  let mockSubscriberResolver: jest.Mocked<ISubscriberResolver>;

  const makeFanoutMessage = (overrides?: Partial<FanoutMessage>): FanoutMessage => ({
    id: 'fanout-001',
    orgId: 'org-1',
    timestamp: new Date().toISOString(),
    traceId: 'trace-001',
    subscriberId: 'sub-001',
    channels: [Channel.EMAIL, Channel.SMS],
    templateIds: {
      [Channel.EMAIL]: 'tmpl-email-001',
      [Channel.SMS]: 'tmpl-sms-001',
    },
    variables: { name: 'John' },
    ...overrides,
  });

  beforeEach(() => {
    mockKafkaConsumer = { subscribe: jest.fn().mockResolvedValue(undefined) };
    mockKafkaProducer = { send: jest.fn().mockResolvedValue(undefined) };
    mockSubscriberResolver = {
      resolveByIds: jest.fn().mockResolvedValue(['sub-001', 'sub-002']),
      resolveBySegment: jest.fn().mockResolvedValue(['sub-003', 'sub-004']),
    };

    service = new FanoutWorkerService(
      mockKafkaConsumer as any,
      mockKafkaProducer as any,
      mockSubscriberResolver,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('processFanoutMessage', () => {
    it('should resolve subscriber by ID when subscriberId is present', async () => {
      const msg = makeFanoutMessage({ subscriberId: 'sub-001' });
      await service.processFanoutMessage(msg);

      // When subscriberId is present, it shortcuts to [subscriberId]
      // without calling the resolver
      expect(mockSubscriberResolver.resolveByIds).not.toHaveBeenCalled();

      // Should publish render messages for each channel
      expect(mockKafkaProducer.send).toHaveBeenCalledTimes(2); // email + sms
    });

    it('should use resolveByIds when subscriberIds is provided', async () => {
      const msg = makeFanoutMessage({
        subscriberId: undefined as any,
      });
      // Extend with subscriberIds
      (msg as any).subscriberIds = ['sub-001', 'sub-002'];

      await service.processFanoutMessage(msg);

      expect(mockSubscriberResolver.resolveByIds).toHaveBeenCalledWith(
        'org-1',
        ['sub-001', 'sub-002'],
      );

      // 2 subscribers x 2 channels = 4 render messages
      expect(mockKafkaProducer.send).toHaveBeenCalledTimes(4);
    });

    it('should fan out to multiple channels per subscriber', async () => {
      const msg = makeFanoutMessage({ subscriberId: 'sub-001' });
      await service.processFanoutMessage(msg);

      // Should produce a render message for each channel
      expect(mockKafkaProducer.send).toHaveBeenCalledTimes(2);

      // Check that email render message was published
      expect(mockKafkaProducer.send).toHaveBeenCalledWith(
        PipelineTopics.RENDER,
        expect.objectContaining({
          subscriberId: 'sub-001',
          channel: Channel.EMAIL,
          templateId: 'tmpl-email-001',
        }),
      );

      // Check that SMS render message was published
      expect(mockKafkaProducer.send).toHaveBeenCalledWith(
        PipelineTopics.RENDER,
        expect.objectContaining({
          subscriberId: 'sub-001',
          channel: Channel.SMS,
          templateId: 'tmpl-sms-001',
        }),
      );
    });

    it('should skip channels with no template ID', async () => {
      const msg = makeFanoutMessage({
        subscriberId: 'sub-001',
        channels: [Channel.EMAIL, Channel.PUSH, Channel.SMS],
        templateIds: {
          [Channel.EMAIL]: 'tmpl-email-001',
          [Channel.SMS]: 'tmpl-sms-001',
          // No PUSH template
        },
      });

      await service.processFanoutMessage(msg);

      // Only email and SMS should be published (PUSH skipped due to missing template)
      expect(mockKafkaProducer.send).toHaveBeenCalledTimes(2);
    });

    it('should use default template when channel-specific template is missing', async () => {
      const msg = makeFanoutMessage({
        subscriberId: 'sub-001',
        channels: [Channel.EMAIL, Channel.PUSH],
        templateIds: {
          [Channel.EMAIL]: 'tmpl-email-001',
          default: 'tmpl-default-001',
        },
      });

      await service.processFanoutMessage(msg);

      // Both channels should have render messages (PUSH falls back to default)
      expect(mockKafkaProducer.send).toHaveBeenCalledTimes(2);
      expect(mockKafkaProducer.send).toHaveBeenCalledWith(
        PipelineTopics.RENDER,
        expect.objectContaining({
          channel: Channel.PUSH,
          templateId: 'tmpl-default-001',
        }),
      );
    });

    it('should handle empty subscriber resolution', async () => {
      const msg = makeFanoutMessage({ subscriberId: undefined as any });
      // No subscriberIds or segmentFilters either, and no subscriberId
      await service.processFanoutMessage(msg);

      // No subscribers resolved => no render messages published
      expect(mockKafkaProducer.send).not.toHaveBeenCalled();

      const metrics = service.getMetrics();
      expect(metrics.processed).toBe(1); // still counts as processed
    });

    it('should track metrics on success', async () => {
      const msg = makeFanoutMessage();
      await service.processFanoutMessage(msg);

      const metrics = service.getMetrics();
      expect(metrics.processed).toBe(1);
      expect(metrics.failed).toBe(0);
      expect(metrics.lastProcessedAt).toBeTruthy();
    });

    it('should increment failedCount on error', async () => {
      mockKafkaProducer.send.mockRejectedValueOnce(new Error('Kafka down'));

      const msg = makeFanoutMessage();
      await expect(service.processFanoutMessage(msg)).rejects.toThrow('Kafka down');

      const metrics = service.getMetrics();
      expect(metrics.failed).toBe(1);
    });
  });

  describe('lifecycle', () => {
    it('should subscribe to the fanout topic on start', async () => {
      await service.start();

      expect(mockKafkaConsumer.subscribe).toHaveBeenCalledWith(
        PipelineTopics.FANOUT,
        'fanout-workers',
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

  describe('setSubscriberResolver', () => {
    it('should allow late binding of subscriber resolver', async () => {
      const serviceNoResolver = new FanoutWorkerService(
        mockKafkaConsumer as any,
        mockKafkaProducer as any,
      );

      serviceNoResolver.setSubscriberResolver(mockSubscriberResolver);

      const msg = makeFanoutMessage({ subscriberId: undefined as any });
      (msg as any).subscriberIds = ['sub-001'];

      await serviceNoResolver.processFanoutMessage(msg);

      expect(mockSubscriberResolver.resolveByIds).toHaveBeenCalled();
    });
  });
});

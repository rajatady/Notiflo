import { StatusWorkerService, IBulkWriterService } from './status-worker.service';
import {
  Channel,
  NotificationStatus,
  PipelineTopics,
  StatusMessage,
} from '../interfaces/pipeline.interfaces';

describe('StatusWorkerService', () => {
  let service: StatusWorkerService;
  let mockKafkaConsumer: { subscribe: jest.Mock };
  let mockBulkWriter: jest.Mocked<IBulkWriterService>;

  const makeStatusMessage = (overrides?: Partial<StatusMessage>): StatusMessage => ({
    id: 'status-001',
    orgId: 'org-1',
    timestamp: new Date().toISOString(),
    traceId: 'trace-001',
    notificationId: 'notif-001',
    subscriberId: 'sub-001',
    channel: Channel.EMAIL,
    provider: 'ses',
    status: NotificationStatus.SENT,
    ...overrides,
  });

  beforeEach(() => {
    mockKafkaConsumer = { subscribe: jest.fn().mockResolvedValue(undefined) };
    mockBulkWriter = {
      bulkUpdateNotificationStatus: jest.fn().mockResolvedValue(undefined),
      bulkInsertAnalyticsEvents: jest.fn().mockResolvedValue(undefined),
      bulkUpdateCampaignAnalytics: jest.fn().mockResolvedValue(undefined),
    };

    service = new StatusWorkerService(
      mockKafkaConsumer as any,
      mockBulkWriter,
    );
  });

  afterEach(async () => {
    await service.stop();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('processStatusMessage', () => {
    it('should process a status message by adding it to the batch accumulator', async () => {
      const msg = makeStatusMessage();
      await service.processStatusMessage(msg);

      const metrics = service.getMetrics();
      expect(metrics.processed).toBe(1);
      expect(metrics.failed).toBe(0);
      expect(metrics.lastProcessedAt).toBeTruthy();
    });

    it('should handle multiple status messages', async () => {
      const msg1 = makeStatusMessage({ id: 'status-001' });
      const msg2 = makeStatusMessage({
        id: 'status-002',
        status: NotificationStatus.DELIVERED,
      });
      const msg3 = makeStatusMessage({
        id: 'status-003',
        status: NotificationStatus.FAILED,
        error: 'Bounce',
      });

      await service.processStatusMessage(msg1);
      await service.processStatusMessage(msg2);
      await service.processStatusMessage(msg3);

      const metrics = service.getMetrics();
      expect(metrics.processed).toBe(3);
    });

    it('should flush batch and call bulk writer methods on stop', async () => {
      // Start the service so the batch accumulator is running
      await service.start();

      const msg = makeStatusMessage({ campaignId: 'camp-001' });
      await service.processStatusMessage(msg);

      // Stop triggers a final flush
      await service.stop();

      expect(mockBulkWriter.bulkUpdateNotificationStatus).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            notificationId: 'notif-001',
            orgId: 'org-1',
            status: NotificationStatus.SENT,
          }),
        ]),
      );

      expect(mockBulkWriter.bulkInsertAnalyticsEvents).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            eventType: 'notification.sent',
            notificationId: 'notif-001',
          }),
        ]),
      );

      expect(mockBulkWriter.bulkUpdateCampaignAnalytics).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            campaignId: 'camp-001',
            status: NotificationStatus.SENT,
            count: 1,
          }),
        ]),
      );
    });

    it('should skip campaign analytics for messages without campaignId', async () => {
      await service.start();

      const msg = makeStatusMessage(); // no campaignId
      await service.processStatusMessage(msg);

      await service.stop();

      // bulkUpdateNotificationStatus and bulkInsertAnalyticsEvents are still called
      expect(mockBulkWriter.bulkUpdateNotificationStatus).toHaveBeenCalled();
      expect(mockBulkWriter.bulkInsertAnalyticsEvents).toHaveBeenCalled();

      // bulkUpdateCampaignAnalytics should NOT be called (no campaign messages)
      expect(mockBulkWriter.bulkUpdateCampaignAnalytics).not.toHaveBeenCalled();
    });

    it('should work without a bulk writer (logs warnings)', async () => {
      const serviceNoBulkWriter = new StatusWorkerService(
        mockKafkaConsumer as any,
      );

      await serviceNoBulkWriter.start();

      const msg = makeStatusMessage();
      await serviceNoBulkWriter.processStatusMessage(msg);

      // Should not throw even without bulk writer
      await serviceNoBulkWriter.stop();

      const metrics = serviceNoBulkWriter.getMetrics();
      expect(metrics.processed).toBe(1);
    });
  });

  describe('lifecycle', () => {
    it('should subscribe to the status topic on start', async () => {
      await service.start();

      expect(mockKafkaConsumer.subscribe).toHaveBeenCalledWith(
        PipelineTopics.STATUS,
        'status-workers',
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

    it('should track flushed batch count', async () => {
      await service.start();

      const msg = makeStatusMessage();
      await service.processStatusMessage(msg);

      await service.stop();

      const metrics = service.getMetrics();
      expect(metrics.flushedBatchCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('setBulkWriter', () => {
    it('should allow late binding of bulk writer', async () => {
      const serviceNoBulkWriter = new StatusWorkerService(
        mockKafkaConsumer as any,
      );

      serviceNoBulkWriter.setBulkWriter(mockBulkWriter);

      await serviceNoBulkWriter.start();

      const msg = makeStatusMessage();
      await serviceNoBulkWriter.processStatusMessage(msg);

      await serviceNoBulkWriter.stop();

      expect(mockBulkWriter.bulkUpdateNotificationStatus).toHaveBeenCalled();
    });
  });
});

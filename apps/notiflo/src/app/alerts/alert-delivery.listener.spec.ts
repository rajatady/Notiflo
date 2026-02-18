import { Test, TestingModule } from '@nestjs/testing';
import { AlertDeliveryListener } from './alert-delivery.listener';
import { AlertsService } from './alerts.service';
import { ConditionMatchBatch } from '@notiflo/bridge/napi-bridge';
import { Channel } from '../core';

describe('AlertDeliveryListener', () => {
  let listener: AlertDeliveryListener;
  let mockOrchestratorService: {
    sendNotification: jest.Mock;
  };
  let mockAlertsService: {
    recordTrigger: jest.Mock;
  };

  beforeEach(async () => {
    mockOrchestratorService = {
      sendNotification: jest.fn().mockResolvedValue({ id: 'notif-1' }),
    };
    mockAlertsService = {
      recordTrigger: jest.fn().mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AlertDeliveryListener,
        {
          provide: AlertsService,
          useValue: mockAlertsService,
        },
        {
          provide: 'OrchestratorService',
          useValue: mockOrchestratorService,
        },
      ],
    }).compile();

    listener = module.get<AlertDeliveryListener>(AlertDeliveryListener);
  });

  const makeBatch = (
    overrides: Partial<ConditionMatchBatch> = {},
  ): ConditionMatchBatch => ({
    matches: [
      {
        conditionId: 'cond-1',
        organizationId: 'org-1',
        subscriberId: 'sub-1',
        symbol: 'AAPL',
        matchedValue: 160,
        channels: ['email'],
        templateId: 'tpl-alert-1',
        timestampUs: 1000,
        matchDetail: 'Threshold crossed above 150',
      },
    ],
    batch_timestamp_us: 1000,
    ...overrides,
  });

  it('should call sendNotification for each match', async () => {
    await listener.handleConditionMatch(makeBatch());

    expect(mockOrchestratorService.sendNotification).toHaveBeenCalledTimes(1);
    expect(mockOrchestratorService.sendNotification).toHaveBeenCalledWith(
      'org-1',
      'sub-1',
      'email',
      'tpl-alert-1',
      expect.objectContaining({
        symbol: 'AAPL',
        matchedValue: 160,
      }),
      expect.objectContaining({
        alertConditionId: 'cond-1',
        source: 'rust_engine',
      }),
    );
  });

  it('should resolve channels from match data', async () => {
    const batch = makeBatch({
      matches: [
        {
          conditionId: 'cond-1',
          organizationId: 'org-1',
          subscriberId: 'sub-1',
          symbol: 'AAPL',
          matchedValue: 160,
          channels: ['email', 'sms', 'push'],
          templateId: 'tpl-1',
          timestampUs: 1000,
        },
      ],
    });

    await listener.handleConditionMatch(batch);

    expect(mockOrchestratorService.sendNotification).toHaveBeenCalledTimes(3);
    expect(mockOrchestratorService.sendNotification).toHaveBeenCalledWith(
      'org-1',
      'sub-1',
      'email',
      expect.any(String),
      expect.any(Object),
      expect.any(Object),
    );
    expect(mockOrchestratorService.sendNotification).toHaveBeenCalledWith(
      'org-1',
      'sub-1',
      'sms',
      expect.any(String),
      expect.any(Object),
      expect.any(Object),
    );
    expect(mockOrchestratorService.sendNotification).toHaveBeenCalledWith(
      'org-1',
      'sub-1',
      'push',
      expect.any(String),
      expect.any(Object),
      expect.any(Object),
    );
  });

  it('should handle multiple matches in a batch', async () => {
    const batch = makeBatch({
      matches: [
        {
          conditionId: 'cond-1',
          organizationId: 'org-1',
          subscriberId: 'sub-1',
          symbol: 'AAPL',
          matchedValue: 160,
          channels: ['email'],
          timestampUs: 1000,
        },
        {
          conditionId: 'cond-2',
          organizationId: 'org-1',
          subscriberId: 'sub-2',
          symbol: 'GOOG',
          matchedValue: 2800,
          channels: ['sms'],
          timestampUs: 1000,
        },
      ],
    });

    await listener.handleConditionMatch(batch);

    expect(mockOrchestratorService.sendNotification).toHaveBeenCalledTimes(2);
    expect(mockAlertsService.recordTrigger).toHaveBeenCalledWith('cond-1');
    expect(mockAlertsService.recordTrigger).toHaveBeenCalledWith('cond-2');
  });

  it('should continue processing when one match delivery fails', async () => {
    mockOrchestratorService.sendNotification
      .mockRejectedValueOnce(new Error('Provider down'))
      .mockResolvedValueOnce({ id: 'notif-2' });

    const batch = makeBatch({
      matches: [
        {
          conditionId: 'cond-1',
          organizationId: 'org-1',
          subscriberId: 'sub-1',
          symbol: 'AAPL',
          matchedValue: 160,
          channels: ['email'],
          timestampUs: 1000,
        },
        {
          conditionId: 'cond-2',
          organizationId: 'org-1',
          subscriberId: 'sub-2',
          symbol: 'GOOG',
          matchedValue: 2800,
          channels: ['email'],
          timestampUs: 1000,
        },
      ],
    });

    await listener.handleConditionMatch(batch);

    // Second match should still be processed
    expect(mockOrchestratorService.sendNotification).toHaveBeenCalledTimes(2);
    // First match's recordTrigger should not be called (failed)
    expect(mockAlertsService.recordTrigger).not.toHaveBeenCalledWith('cond-1');
    // Second match's recordTrigger should be called
    expect(mockAlertsService.recordTrigger).toHaveBeenCalledWith('cond-2');
  });

  it('should update alert condition triggerCount via recordTrigger', async () => {
    await listener.handleConditionMatch(makeBatch());

    expect(mockAlertsService.recordTrigger).toHaveBeenCalledWith('cond-1');
  });

  it('should use default-alert template when templateId is missing', async () => {
    const batch = makeBatch({
      matches: [
        {
          conditionId: 'cond-1',
          organizationId: 'org-1',
          subscriberId: 'sub-1',
          symbol: 'AAPL',
          matchedValue: 160,
          channels: ['email'],
          timestampUs: 1000,
          // No templateId
        },
      ],
    });

    await listener.handleConditionMatch(batch);

    expect(mockOrchestratorService.sendNotification).toHaveBeenCalledWith(
      'org-1',
      'sub-1',
      'email',
      'default-alert',
      expect.any(Object),
      expect.any(Object),
    );
  });
});

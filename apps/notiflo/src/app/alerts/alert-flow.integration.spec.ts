import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';
import { AlertsService } from './alerts.service';
import { AlertsController } from './alerts.controller';
import { AlertDeliveryListener } from './alert-delivery.listener';
import { getModelToken } from '@nestjs/mongoose';
import { AlertCondition } from './schemas/alert-condition.schema';
import {
  ENGINE_BRIDGE,
  MockEngineBridgeService,
} from '@notiflo/bridge/napi-bridge';
import { Channel } from '../core';

/**
 * Integration test: create alert → submit tick → engine matches → delivery listener fires.
 * Uses MockEngineBridgeService (no Rust addon needed) and real EventEmitter2.
 */
describe('Alert Flow Integration', () => {
  let controller: AlertsController;
  let service: AlertsService;
  let mockEngineBridge: MockEngineBridgeService;
  let eventEmitter: EventEmitter2;
  let mockOrchestratorService: { sendNotification: jest.Mock };
  let mockAlertModel: any;

  beforeEach(async () => {
    mockOrchestratorService = {
      sendNotification: jest.fn().mockResolvedValue({
        _id: 'notif-1',
        status: 'sent',
      }),
    };

    // Create a basic in-memory mock for the Mongoose model
    const docs: any[] = [];
    mockAlertModel = {
      create: jest.fn().mockImplementation(async (dto: any) => {
        const doc = {
          _id: { toString: () => `alert-${docs.length + 1}` },
          ...dto,
          active: dto.active !== false,
          triggerCount: 0,
        };
        docs.push(doc);
        return doc;
      }),
      find: jest.fn().mockImplementation(() => ({
        lean: () => ({
          exec: () => Promise.resolve(docs.filter((d) => d.active)),
        }),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        exec: () => Promise.resolve(docs),
      })),
      findById: jest.fn().mockReturnValue({
        exec: () => Promise.resolve(null),
      }),
      findByIdAndUpdate: jest.fn().mockReturnValue({
        exec: () => Promise.resolve(null),
      }),
      findByIdAndDelete: jest.fn().mockReturnValue({
        exec: () => Promise.resolve(null),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot()],
      controllers: [AlertsController],
      providers: [
        AlertsService,
        AlertDeliveryListener,
        {
          provide: getModelToken(AlertCondition.name),
          useValue: mockAlertModel,
        },
        {
          provide: ENGINE_BRIDGE,
          useClass: MockEngineBridgeService,
        },
        {
          provide: 'OrchestratorService',
          useValue: mockOrchestratorService,
        },
      ],
    }).compile();

    // Initialize module to wire up @OnEvent decorators
    await module.init();

    controller = module.get<AlertsController>(AlertsController);
    service = module.get<AlertsService>(AlertsService);
    mockEngineBridge = module.get<MockEngineBridgeService>(ENGINE_BRIDGE);
    eventEmitter = module.get<EventEmitter2>(EventEmitter2);
  });

  it('should complete: create alert → submit tick → match → delivery listener fires', async () => {
    // 1. Create an alert condition
    const alert = await controller.create({
      organizationId: 'org-1',
      subscriberId: 'sub-1',
      symbol: 'AAPL',
      strategyType: 'threshold_crossing',
      strategyParams: { threshold: 150, operator: 'cross_above' },
      channels: ['email'],
      templateId: 'tpl-alert-1',
    } as any);

    expect(alert).toBeDefined();
    expect(alert.symbol).toBe('AAPL');

    // 2. Verify the engine has the condition loaded
    expect(mockEngineBridge.getConditionCount()).toBe(1);

    // 3. Submit a tick that triggers the condition
    const tickResult = controller.submitTick({
      symbol: 'AAPL',
      value: 160,
      timestampUs: Date.now() * 1000,
    } as any);

    expect(tickResult.count).toBe(1);
    expect(tickResult.matches[0].symbol).toBe('AAPL');
    expect(tickResult.matches[0].matchedValue).toBe(160);

    // 4. Wait for the async event propagation
    // The MockEngineBridge emits 'engine.condition.match' synchronously during evaluateTick,
    // but the @OnEvent listener is async. Give it time to process.
    await new Promise((resolve) => setTimeout(resolve, 200));

    // 5. Verify the delivery listener called the orchestrator
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
        source: 'rust_engine',
      }),
    );
  });

  it('should not trigger delivery when tick does not match', async () => {
    // Create alert: AAPL > 150
    await controller.create({
      organizationId: 'org-1',
      subscriberId: 'sub-1',
      symbol: 'AAPL',
      strategyType: 'threshold_crossing',
      strategyParams: { threshold: 150, operator: 'cross_above' },
      channels: ['email'],
    } as any);

    // Submit tick below threshold
    const tickResult = controller.submitTick({
      symbol: 'AAPL',
      value: 140,
      timestampUs: Date.now() * 1000,
    } as any);

    expect(tickResult.count).toBe(0);

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mockOrchestratorService.sendNotification).not.toHaveBeenCalled();
  });

  it('should handle expression strategy alerts', async () => {
    await controller.create({
      organizationId: 'org-1',
      subscriberId: 'sub-1',
      symbol: 'TSLA',
      strategyType: 'expression',
      strategyParams: { expression: 'value > 200' },
      channels: ['sms'],
    } as any);

    const result = controller.submitTick({
      symbol: 'TSLA',
      value: 250,
      timestampUs: Date.now() * 1000,
    } as any);

    expect(result.count).toBe(1);
    expect(result.matches[0].channels).toContain('sms');
  });

  it('should handle multiple alerts for different symbols', async () => {
    await controller.create({
      organizationId: 'org-1',
      subscriberId: 'sub-1',
      symbol: 'AAPL',
      strategyType: 'threshold_crossing',
      strategyParams: { threshold: 150, operator: 'cross_above' },
      channels: ['email'],
    } as any);

    await controller.create({
      organizationId: 'org-1',
      subscriberId: 'sub-2',
      symbol: 'GOOG',
      strategyType: 'threshold_crossing',
      strategyParams: { threshold: 2500, operator: 'cross_above' },
      channels: ['push'],
    } as any);

    // AAPL tick should only match first alert
    const aaplResult = controller.submitTick({
      symbol: 'AAPL',
      value: 160,
      timestampUs: Date.now() * 1000,
    } as any);
    expect(aaplResult.count).toBe(1);
    expect(aaplResult.matches[0].subscriberId).toBe('sub-1');

    // GOOG tick should only match second alert
    const googResult = controller.submitTick({
      symbol: 'GOOG',
      value: 2600,
      timestampUs: Date.now() * 1000,
    } as any);
    expect(googResult.count).toBe(1);
    expect(googResult.matches[0].subscriberId).toBe('sub-2');
  });
});

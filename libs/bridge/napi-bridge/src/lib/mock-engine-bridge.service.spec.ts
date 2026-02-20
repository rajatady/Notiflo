import { EventEmitter2 } from '@nestjs/event-emitter';
import { MockEngineBridgeService } from './mock-engine-bridge.service';
import { AlertConditionInput } from './types/condition.types';
import { NormalizedTickInput } from './types/tick.types';

describe('MockEngineBridgeService', () => {
  let service: MockEngineBridgeService;
  let eventEmitter: EventEmitter2;

  const makeCondition = (
    overrides: Partial<AlertConditionInput> = {},
  ): AlertConditionInput => ({
    id: 'cond-1',
    organizationId: 'org-1',
    subscriberId: 'sub-1',
    symbol: 'AAPL',
    strategyType: 'threshold_crossing',
    strategyParams: JSON.stringify({
      threshold: 150,
      operator: 'cross_above',
    }),
    channels: ['email'],
    active: true,
    ...overrides,
  });

  const makeTick = (
    overrides: Partial<NormalizedTickInput> = {},
  ): NormalizedTickInput => ({
    symbol: 'AAPL',
    value: 160,
    timestampUs: 1000,
    ...overrides,
  });

  beforeEach(() => {
    eventEmitter = new EventEmitter2();
    service = new MockEngineBridgeService(eventEmitter);
  });

  it('should always report initialized', () => {
    expect(service.isInitialized()).toBe(true);
  });

  describe('condition management', () => {
    it('should add and count conditions', () => {
      service.addCondition(makeCondition());
      expect(service.getConditionCount()).toBe(1);
    });

    it('should remove conditions', () => {
      service.addCondition(makeCondition());
      expect(service.removeCondition('cond-1')).toBe(true);
      expect(service.getConditionCount()).toBe(0);
    });

    it('should return false when removing non-existent condition', () => {
      expect(service.removeCondition('non-existent')).toBe(false);
    });

    it('should update existing conditions', () => {
      service.addCondition(makeCondition());
      const updated = makeCondition({
        strategyParams: JSON.stringify({
          threshold: 200,
          operator: 'cross_above',
        }),
      });
      expect(service.updateCondition(updated)).toBe(true);
    });

    it('should return false when updating non-existent condition', () => {
      expect(service.updateCondition(makeCondition({ id: 'nope' }))).toBe(
        false,
      );
    });

    it('should bulk load multiple conditions', () => {
      const conditions = [
        makeCondition({ id: 'c1' }),
        makeCondition({ id: 'c2' }),
        makeCondition({ id: 'c3', active: false }),
      ];
      const loaded = service.bulkLoadConditions(conditions);
      // Only active conditions are loaded
      expect(loaded).toBe(2);
      expect(service.getConditionCount()).toBe(2);
    });
  });

  describe('threshold_crossing evaluation', () => {
    it('should match when value crosses above threshold', () => {
      service.addCondition(makeCondition());
      const matches = service.evaluateTick(makeTick({ value: 160 }));
      expect(matches).toHaveLength(1);
      expect(matches[0].conditionId).toBe('cond-1');
      expect(matches[0].matchedValue).toBe(160);
    });

    it('should not match when value is below threshold', () => {
      service.addCondition(makeCondition());
      const matches = service.evaluateTick(makeTick({ value: 140 }));
      expect(matches).toHaveLength(0);
    });

    it('should not match for different symbol', () => {
      service.addCondition(makeCondition());
      const matches = service.evaluateTick(
        makeTick({ symbol: 'GOOG', value: 160 }),
      );
      expect(matches).toHaveLength(0);
    });

    it('should match cross_below operator', () => {
      service.addCondition(
        makeCondition({
          strategyParams: JSON.stringify({
            threshold: 150,
            operator: 'cross_below',
          }),
        }),
      );
      const matches = service.evaluateTick(makeTick({ value: 140 }));
      expect(matches).toHaveLength(1);
    });

    it('should match greater_than_or_equal operator', () => {
      service.addCondition(
        makeCondition({
          strategyParams: JSON.stringify({
            threshold: 150,
            operator: 'greater_than_or_equal',
          }),
        }),
      );
      const matchesExact = service.evaluateTick(makeTick({ value: 150 }));
      expect(matchesExact).toHaveLength(1);

      const matchesBelow = service.evaluateTick(makeTick({ value: 149 }));
      expect(matchesBelow).toHaveLength(0);
    });
  });

  describe('expression evaluation', () => {
    it('should evaluate simple expression', () => {
      service.addCondition(
        makeCondition({
          strategyType: 'expression',
          strategyParams: JSON.stringify({ expression: 'value > 150' }),
        }),
      );

      expect(service.evaluateTick(makeTick({ value: 160 }))).toHaveLength(1);
      expect(service.evaluateTick(makeTick({ value: 140 }))).toHaveLength(0);
    });

    it('should evaluate AND expression with volume', () => {
      service.addCondition(
        makeCondition({
          strategyType: 'expression',
          strategyParams: JSON.stringify({
            expression: 'value > 150 AND volume > 1000000',
          }),
        }),
      );

      const noVolume = service.evaluateTick(makeTick({ value: 160 }));
      expect(noVolume).toHaveLength(0);

      const withVolume = service.evaluateTick(
        makeTick({ value: 160, secondaryValue: 2000000 }),
      );
      expect(withVolume).toHaveLength(1);
    });
  });

  describe('event emission', () => {
    it('should emit engine.condition.match event on match', () => {
      const emitSpy = jest.spyOn(eventEmitter, 'emit');
      service.addCondition(makeCondition());
      service.evaluateTick(makeTick({ value: 160 }));

      expect(emitSpy).toHaveBeenCalledWith(
        'engine.condition.match',
        expect.objectContaining({
          matches: expect.arrayContaining([
            expect.objectContaining({ conditionId: 'cond-1' }),
          ]),
        }),
      );
    });

    it('should not emit when no matches', () => {
      const emitSpy = jest.spyOn(eventEmitter, 'emit');
      service.addCondition(makeCondition());
      service.evaluateTick(makeTick({ value: 140 }));

      expect(emitSpy).not.toHaveBeenCalled();
    });
  });

  describe('metrics', () => {
    it('should return basic metrics', () => {
      service.addCondition(makeCondition());
      service.evaluateTick(makeTick({ value: 160 }));
      service.evaluateTick(makeTick({ value: 140 }));

      const metrics = service.getMetrics();
      expect(metrics.totalConditions).toBe(1);
      expect(metrics.totalTicksProcessed).toBe(2);
      expect(metrics.totalMatches).toBe(1);
    });
  });
});

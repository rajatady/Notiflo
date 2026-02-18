import { EventBusService } from './event-bus.service';
import { NotifloEvent, EventSource } from '../../core';

describe('EventBusService', () => {
  let eventBus: EventBusService;

  const createTestEvent = (overrides: Partial<NotifloEvent> = {}): NotifloEvent => ({
    id: 'evt-123',
    organizationId: 'org-1',
    name: 'user.signup',
    payload: { email: 'test@example.com' },
    timestamp: new Date(),
    source: EventSource.API,
    processed: false,
    ...overrides,
  });

  beforeEach(() => {
    eventBus = new EventBusService();
  });

  afterEach(() => {
    eventBus.clearAll();
  });

  it('should publish an event to subscribers', async () => {
    const handler = jest.fn().mockResolvedValue(undefined);
    eventBus.subscribe('user.signup', handler);

    const event = createTestEvent();
    await eventBus.publish(event);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(event);
  });

  it('should subscribe to events by exact name', async () => {
    const signupHandler = jest.fn().mockResolvedValue(undefined);
    const loginHandler = jest.fn().mockResolvedValue(undefined);

    eventBus.subscribe('user.signup', signupHandler);
    eventBus.subscribe('user.login', loginHandler);

    await eventBus.publish(createTestEvent({ name: 'user.signup' }));

    expect(signupHandler).toHaveBeenCalledTimes(1);
    expect(loginHandler).not.toHaveBeenCalled();
  });

  it('should subscribe to all events via subscribeAll', async () => {
    const allHandler = jest.fn().mockResolvedValue(undefined);
    eventBus.subscribeAll(allHandler);

    await eventBus.publish(createTestEvent({ name: 'user.signup' }));
    await eventBus.publish(createTestEvent({ name: 'order.created' }));

    expect(allHandler).toHaveBeenCalledTimes(2);
  });

  it('should support wildcard event names (e.g., "user.*" matches "user.signup")', async () => {
    const wildcardHandler = jest.fn().mockResolvedValue(undefined);
    eventBus.subscribe('user.*', wildcardHandler);

    await eventBus.publish(createTestEvent({ name: 'user.signup' }));
    await eventBus.publish(createTestEvent({ name: 'user.login' }));
    await eventBus.publish(createTestEvent({ name: 'order.created' }));

    expect(wildcardHandler).toHaveBeenCalledTimes(2);
  });

  it('should unsubscribe a handler by subscription ID', async () => {
    const handler = jest.fn().mockResolvedValue(undefined);
    const subscriptionId = eventBus.subscribe('user.signup', handler);

    await eventBus.publish(createTestEvent());
    expect(handler).toHaveBeenCalledTimes(1);

    const result = eventBus.unsubscribe(subscriptionId);
    expect(result).toBe(true);

    await eventBus.publish(createTestEvent());
    expect(handler).toHaveBeenCalledTimes(1); // still 1, not 2
  });

  it('should return false when unsubscribing a non-existent subscription', () => {
    const result = eventBus.unsubscribe('non-existent-id');
    expect(result).toBe(false);
  });

  it('should return correct subscription count', () => {
    expect(eventBus.getSubscriptionCount()).toBe(0);

    eventBus.subscribe('user.signup', jest.fn().mockResolvedValue(undefined));
    eventBus.subscribe('user.login', jest.fn().mockResolvedValue(undefined));
    eventBus.subscribeAll(jest.fn().mockResolvedValue(undefined));

    expect(eventBus.getSubscriptionCount()).toBe(3);
  });

  it('should clearAll subscriptions', () => {
    eventBus.subscribe('user.signup', jest.fn().mockResolvedValue(undefined));
    eventBus.subscribe('user.login', jest.fn().mockResolvedValue(undefined));
    eventBus.subscribeAll(jest.fn().mockResolvedValue(undefined));

    expect(eventBus.getSubscriptionCount()).toBe(3);

    eventBus.clearAll();

    expect(eventBus.getSubscriptionCount()).toBe(0);
  });

  it('should handle multiple subscribers for same event', async () => {
    const handler1 = jest.fn().mockResolvedValue(undefined);
    const handler2 = jest.fn().mockResolvedValue(undefined);
    const handler3 = jest.fn().mockResolvedValue(undefined);

    eventBus.subscribe('user.signup', handler1);
    eventBus.subscribe('user.signup', handler2);
    eventBus.subscribe('user.signup', handler3);

    await eventBus.publish(createTestEvent());

    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler2).toHaveBeenCalledTimes(1);
    expect(handler3).toHaveBeenCalledTimes(1);
  });

  it('should handle async handlers (await all)', async () => {
    const executionOrder: number[] = [];

    const handler1 = jest.fn().mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      executionOrder.push(1);
    });
    const handler2 = jest.fn().mockImplementation(async () => {
      executionOrder.push(2);
    });

    eventBus.subscribe('user.signup', handler1);
    eventBus.subscribe('user.signup', handler2);

    await eventBus.publish(createTestEvent());

    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler2).toHaveBeenCalledTimes(1);
    // Both handlers should have completed by the time publish resolves
    expect(executionOrder).toContain(1);
    expect(executionOrder).toContain(2);
  });

  it('should not fail if handler throws (log error, continue)', async () => {
    const failingHandler = jest.fn().mockRejectedValue(new Error('Handler failed'));
    const successHandler = jest.fn().mockResolvedValue(undefined);

    eventBus.subscribe('user.signup', failingHandler);
    eventBus.subscribe('user.signup', successHandler);

    // publish should not throw even if a handler throws
    await expect(eventBus.publish(createTestEvent())).resolves.not.toThrow();

    expect(failingHandler).toHaveBeenCalledTimes(1);
    expect(successHandler).toHaveBeenCalledTimes(1);
  });

  it('should call subscribeAll handlers for every event', async () => {
    const allHandler = jest.fn().mockResolvedValue(undefined);
    const specificHandler = jest.fn().mockResolvedValue(undefined);

    eventBus.subscribeAll(allHandler);
    eventBus.subscribe('user.signup', specificHandler);

    const signupEvent = createTestEvent({ name: 'user.signup' });
    const orderEvent = createTestEvent({ name: 'order.created' });
    const systemEvent = createTestEvent({ name: 'system.health' });

    await eventBus.publish(signupEvent);
    await eventBus.publish(orderEvent);
    await eventBus.publish(systemEvent);

    expect(allHandler).toHaveBeenCalledTimes(3);
    expect(allHandler).toHaveBeenCalledWith(signupEvent);
    expect(allHandler).toHaveBeenCalledWith(orderEvent);
    expect(allHandler).toHaveBeenCalledWith(systemEvent);
    expect(specificHandler).toHaveBeenCalledTimes(1);
    expect(specificHandler).toHaveBeenCalledWith(signupEvent);
  });

  it('should unsubscribe a subscribeAll handler', async () => {
    const allHandler = jest.fn().mockResolvedValue(undefined);
    const subId = eventBus.subscribeAll(allHandler);

    await eventBus.publish(createTestEvent());
    expect(allHandler).toHaveBeenCalledTimes(1);

    const result = eventBus.unsubscribe(subId);
    expect(result).toBe(true);

    await eventBus.publish(createTestEvent());
    expect(allHandler).toHaveBeenCalledTimes(1); // still 1
  });

  it('should match deeply nested wildcard patterns', async () => {
    const handler = jest.fn().mockResolvedValue(undefined);
    eventBus.subscribe('notification.*', handler);

    await eventBus.publish(createTestEvent({ name: 'notification.email.sent' }));
    await eventBus.publish(createTestEvent({ name: 'notification.sms' }));
    await eventBus.publish(createTestEvent({ name: 'user.signup' }));

    expect(handler).toHaveBeenCalledTimes(2);
  });
});

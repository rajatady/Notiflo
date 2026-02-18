import { NotifloEvent } from '../types/event.types';

export type EventHandler = (event: NotifloEvent) => Promise<void>;

/**
 * Event bus interface for decoupled event-driven architecture.
 * Start with in-memory, swap to Redis/Kafka for horizontal scaling.
 */
export interface IEventBus {
  /** Publish an event to all subscribers */
  publish(event: NotifloEvent): Promise<void>;

  /** Subscribe to events by name pattern */
  subscribe(eventName: string, handler: EventHandler): string;

  /** Unsubscribe a handler */
  unsubscribe(subscriptionId: string): boolean;

  /** Subscribe to all events */
  subscribeAll(handler: EventHandler): string;

  /** Get count of active subscriptions */
  getSubscriptionCount(): number;

  /** Clear all subscriptions */
  clearAll(): void;
}

export const EVENT_BUS = 'EVENT_BUS';

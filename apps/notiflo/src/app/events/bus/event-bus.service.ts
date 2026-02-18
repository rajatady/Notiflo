import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { IEventBus, EventHandler } from '../../core';
import { NotifloEvent } from '../../core';

@Injectable()
export class EventBusService implements IEventBus {
  private readonly logger = new Logger(EventBusService.name);

  /**
   * Named subscriptions: eventName -> Map<subscriptionId, handler>
   * Includes exact and wildcard patterns.
   */
  private readonly namedSubscriptions = new Map<
    string,
    Map<string, EventHandler>
  >();

  /**
   * Subscribe-all handlers: subscriptionId -> handler
   */
  private readonly allSubscriptions = new Map<string, EventHandler>();

  publish(event: NotifloEvent): Promise<void> {
    const handlers: EventHandler[] = [];

    // Collect exact match handlers
    const exactHandlers = this.namedSubscriptions.get(event.name);
    if (exactHandlers) {
      handlers.push(...exactHandlers.values());
    }

    // Collect wildcard match handlers
    for (const [pattern, handlerMap] of this.namedSubscriptions.entries()) {
      if (pattern === event.name) continue; // already added exact
      if (this.matchesWildcard(pattern, event.name)) {
        handlers.push(...handlerMap.values());
      }
    }

    // Collect subscribeAll handlers
    handlers.push(...this.allSubscriptions.values());

    // Execute all handlers, catching errors so one failure doesn't block others
    const promises = handlers.map((handler) =>
      handler(event).catch((error) => {
        this.logger.error(
          `Event handler error for event '${event.name}': ${error.message}`,
          error.stack,
        );
      }),
    );

    return Promise.all(promises).then(() => undefined);
  }

  subscribe(eventName: string, handler: EventHandler): string {
    const subscriptionId = uuidv4();

    if (!this.namedSubscriptions.has(eventName)) {
      this.namedSubscriptions.set(eventName, new Map());
    }

    this.namedSubscriptions.get(eventName).set(subscriptionId, handler);
    return subscriptionId;
  }

  subscribeAll(handler: EventHandler): string {
    const subscriptionId = uuidv4();
    this.allSubscriptions.set(subscriptionId, handler);
    return subscriptionId;
  }

  unsubscribe(subscriptionId: string): boolean {
    // Check allSubscriptions first
    if (this.allSubscriptions.has(subscriptionId)) {
      this.allSubscriptions.delete(subscriptionId);
      return true;
    }

    // Check named subscriptions
    for (const [, handlerMap] of this.namedSubscriptions.entries()) {
      if (handlerMap.has(subscriptionId)) {
        handlerMap.delete(subscriptionId);
        return true;
      }
    }

    return false;
  }

  getSubscriptionCount(): number {
    let count = this.allSubscriptions.size;
    for (const handlerMap of this.namedSubscriptions.values()) {
      count += handlerMap.size;
    }
    return count;
  }

  clearAll(): void {
    this.namedSubscriptions.clear();
    this.allSubscriptions.clear();
  }

  /**
   * Matches a wildcard pattern against an event name.
   * 'user.*' matches 'user.signup', 'user.login', 'user.anything'
   * The * acts as a glob matching one or more segments after the prefix.
   */
  private matchesWildcard(pattern: string, eventName: string): boolean {
    if (!pattern.includes('*')) {
      return false;
    }

    // Convert wildcard pattern to regex
    // 'user.*' -> /^user\..*$/
    const regexStr =
      '^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$';
    const regex = new RegExp(regexStr);
    return regex.test(eventName);
  }
}

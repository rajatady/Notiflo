import { useState, useEffect, useCallback, useRef } from 'react';
import { getNotifications } from '../lib/api-client';
import { NotificationRecord } from '../lib/types';
import { useWebSocket } from './useWebSocket';

const ORG_ID = 'default-org';
const MAX_ITEMS = 200;

export function useLiveNotifications() {
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const countRef = useRef(0);
  const [count, setCount] = useState(0);
  const { connected, subscribe } = useWebSocket();

  // Initial REST load
  const fetchInitial = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getNotifications(ORG_ID);
      setNotifications(result || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInitial();
  }, [fetchInitial]);

  // Live WebSocket updates
  useEffect(() => {
    const unsub = subscribe('delivery', (data: unknown) => {
      const event = data as Record<string, string>;
      const notif: NotificationRecord = {
        _id: event._id || event.request_id || '',
        organizationId: event.organization_id || '',
        subscriberId: event.subscriber_id || '',
        channel: event.channel || '',
        status: event.success === 'true' ? 'delivered' : 'failed',
        provider: event.provider || '',
        content: event.rendered_content
          ? tryParseJson(event.rendered_content)
          : {},
        result: {
          success: event.success === 'true',
          messageId: event.message_id || undefined,
          error: event.error || undefined,
        },
        metadata: {
          latencyUs: event.latency_us ? Number(event.latency_us) : undefined,
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        sentAt: event.timestamp_us
          ? new Date(Number(event.timestamp_us) / 1000).toISOString()
          : undefined,
      };

      setNotifications((prev) => [notif, ...prev].slice(0, MAX_ITEMS));
      countRef.current += 1;
      setCount(countRef.current);
    });

    return unsub;
  }, [subscribe]);

  return { notifications, loading, error, connected, count };
}

function tryParseJson(str: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(str);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

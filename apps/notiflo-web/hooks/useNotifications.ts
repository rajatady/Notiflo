import { useState, useEffect, useCallback } from 'react';
import { getNotifications } from '../lib/api-client';
import { NotificationRecord } from '../lib/types';

const ORG_ID = 'default-org';

export function useNotifications() {
  const [data, setData] = useState<NotificationRecord[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getNotifications(ORG_ID);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}

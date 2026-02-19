import { useState, useEffect, useCallback } from 'react';
import { getChannelHealth } from '../lib/api-client';
import { ChannelHealth } from '../lib/types';

const ORG_ID = 'default-org';

export function useChannelHealth() {
  const [data, setData] = useState<ChannelHealth[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getChannelHealth(ORG_ID);
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

import { useState, useEffect, useCallback } from 'react';
import { getEngineStatus } from '../lib/api-client';
import { EngineStatusResponse } from '../lib/types';

export function useEngineStatus() {
  const [data, setData] = useState<EngineStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getEngineStatus();
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

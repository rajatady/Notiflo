import { useState, useEffect } from 'react';
import { PipelineMetrics } from '../lib/types';
import { useWebSocket } from './useWebSocket';

export function useLiveMetrics() {
  const [metrics, setMetrics] = useState<PipelineMetrics | null>(null);
  const { connected, subscribe } = useWebSocket();

  useEffect(() => {
    const unsub = subscribe('metrics', (data: unknown) => {
      setMetrics(data as PipelineMetrics);
    });
    return unsub;
  }, [subscribe]);

  return { metrics, connected };
}

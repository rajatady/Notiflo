import React from 'react';
import { EngineStatusResponse } from '../../lib/types';

interface EngineStatusProps {
  data: EngineStatusResponse | null;
  loading: boolean;
  error: string | null;
}

export default function EngineStatus({ data, loading, error }: EngineStatusProps) {
  if (loading) {
    return (
      <div data-testid="engine-status-loading" className="text-text-muted">
        Loading...
      </div>
    );
  }

  if (error) {
    return (
      <div data-testid="engine-status-error" className="text-neon-rose">
        {error}
      </div>
    );
  }

  if (!data) {
    return null;
  }

  return (
    <div data-testid="engine-status" className="card p-5">
      <div className="flex items-center gap-3 mb-4">
        <span
          data-testid="engine-available"
          className={`inline-block w-3 h-3 rounded-full ${data.available ? 'bg-neon-green animate-glow-pulse' : 'bg-neon-rose'}`}
        />
        <h3 className="text-sm font-semibold text-text-primary">
          Engine {data.available ? 'Available' : 'Unavailable'}
        </h3>
      </div>
      {data.available && (
        <dl className="space-y-2">
          {data.conditionsLoaded !== undefined && (
            <div className="flex justify-between">
              <dt className="text-xs text-text-muted">Conditions Loaded</dt>
              <dd data-testid="engine-conditions" className="font-mono text-xs text-neon-cyan">
                {data.conditionsLoaded}
              </dd>
            </div>
          )}
          {data.evaluationsPerSecond !== undefined && (
            <div className="flex justify-between">
              <dt className="text-xs text-text-muted">Evaluations/sec</dt>
              <dd data-testid="engine-evaluations" className="font-mono text-xs text-neon-cyan">
                {data.evaluationsPerSecond}
              </dd>
            </div>
          )}
          {data.avgLatencyUs !== undefined && (
            <div className="flex justify-between">
              <dt className="text-xs text-text-muted">Avg Latency</dt>
              <dd data-testid="engine-latency" className="font-mono text-xs text-neon-cyan">
                {data.avgLatencyUs}us
              </dd>
            </div>
          )}
        </dl>
      )}
    </div>
  );
}

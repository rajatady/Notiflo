import React from 'react';
import OverviewMetrics from '../components/dashboard/OverviewMetrics';
import PipelineMetrics from '../components/dashboard/PipelineMetrics';
import ChannelHealthGrid from '../components/dashboard/ChannelHealthGrid';
import EngineStatus from '../components/dashboard/EngineStatus';
import { useDashboardOverview } from '../hooks/useDashboardOverview';
import { useChannelHealth } from '../hooks/useChannelHealth';
import { useEngineStatus } from '../hooks/useEngineStatus';
import { useLiveMetrics } from '../hooks/useLiveMetrics';

export default function DashboardPage() {
  const overview = useDashboardOverview();
  const channels = useChannelHealth();
  const engine = useEngineStatus();
  const { metrics, connected } = useLiveMetrics();

  return (
    <div data-testid="dashboard-page" className="max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="page-title">Dashboard</h1>
        <p className="text-text-secondary mt-1">Real-time overview of your notification infrastructure</p>
      </div>
      <div>
        <div className="flex items-center gap-2 mb-3">
          <h2 className="section-title">Pipeline Performance</h2>
          <span className="flex items-center gap-1.5 text-xs font-mono">
            <span
              className={`inline-block w-2 h-2 rounded-full ${
                connected ? 'bg-neon-green' : 'bg-neon-rose'
              }`}
            />
            {connected ? 'LIVE' : 'OFFLINE'}
          </span>
        </div>
        <PipelineMetrics metrics={metrics} connected={connected} />
      </div>
      <OverviewMetrics
        data={overview.data}
        loading={overview.loading}
        error={overview.error}
      />
      <div>
        <h2 className="section-title">Channel Health</h2>
        <ChannelHealthGrid
          data={channels.data}
          loading={channels.loading}
          error={channels.error}
        />
      </div>
      <div>
        <h2 className="section-title">Rust Engine</h2>
        <EngineStatus
          data={engine.data}
          loading={engine.loading}
          error={engine.error}
        />
      </div>
    </div>
  );
}

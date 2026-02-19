import React from 'react';
import OverviewMetrics from '../components/dashboard/OverviewMetrics';
import ChannelHealthGrid from '../components/dashboard/ChannelHealthGrid';
import EngineStatus from '../components/dashboard/EngineStatus';
import { useDashboardOverview } from '../hooks/useDashboardOverview';
import { useChannelHealth } from '../hooks/useChannelHealth';
import { useEngineStatus } from '../hooks/useEngineStatus';

export default function DashboardPage() {
  const overview = useDashboardOverview();
  const channels = useChannelHealth();
  const engine = useEngineStatus();

  return (
    <div data-testid="dashboard-page" className="max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="page-title">Dashboard</h1>
        <p className="text-text-secondary mt-1">Real-time overview of your notification infrastructure</p>
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

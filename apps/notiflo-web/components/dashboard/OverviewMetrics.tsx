import React from 'react';
import { DashboardOverview } from '../../lib/types';

interface OverviewMetricsProps {
  data: DashboardOverview | null;
  loading: boolean;
  error: string | null;
}

interface KpiCard {
  testId: string;
  label: string;
  value: string | number;
}

export default function OverviewMetrics({ data, loading, error }: OverviewMetricsProps) {
  if (loading) {
    return (
      <div data-testid="overview-loading" className="text-text-muted">
        Loading...
      </div>
    );
  }

  if (error) {
    return (
      <div data-testid="overview-error" className="text-neon-rose">
        {error}
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const cards: KpiCard[] = [
    { testId: 'kpi-totalSent', label: 'Total Sent', value: data.totalNotificationsSent },
    { testId: 'kpi-delivered', label: 'Delivered', value: data.totalDelivered },
    { testId: 'kpi-failed', label: 'Failed', value: data.totalFailed },
    { testId: 'kpi-deliveryRate', label: 'Delivery Rate', value: `${data.deliveryRate}%` },
    { testId: 'kpi-activeCampaigns', label: 'Active Campaigns', value: data.activeCampaigns },
    { testId: 'kpi-totalSubscribers', label: 'Total Subscribers', value: data.totalSubscribers },
  ];

  return (
    <div data-testid="overview-metrics" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {cards.map((card) => (
        <div
          key={card.testId}
          data-testid={card.testId}
          className="card p-5"
        >
          <p className="text-xs font-mono text-text-muted uppercase tracking-wider">{card.label}</p>
          <p className="text-2xl font-display font-bold text-text-primary mt-1">{card.value}</p>
        </div>
      ))}
    </div>
  );
}

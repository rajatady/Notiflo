import React from 'react';
import { PipelineMetrics as PipelineMetricsType } from '../../lib/types';

interface PipelineMetricsProps {
  metrics: PipelineMetricsType | null;
  connected: boolean;
}

interface MetricCard {
  label: string;
  value: string;
  accent: string;
}

function formatUs(us: number): string {
  if (us < 1000) return `${us.toFixed(0)}us`;
  return `${(us / 1000).toFixed(2)}ms`;
}

export default function PipelineMetrics({ metrics, connected }: PipelineMetricsProps) {
  if (!metrics) {
    return (
      <div className="text-text-muted py-4">
        Waiting for pipeline metrics...
      </div>
    );
  }

  const cards: MetricCard[] = [
    {
      label: 'Throughput',
      value: `${metrics.throughput_tps.toFixed(1)} tps`,
      accent: 'text-neon-cyan',
    },
    {
      label: 'Eval Latency (avg)',
      value: formatUs(metrics.avg_eval_latency_us),
      accent: 'text-neon-green',
    },
    {
      label: 'Eval Latency (max)',
      value: formatUs(metrics.max_eval_latency_us),
      accent: 'text-neon-amber',
    },
    {
      label: 'Deliveries',
      value: metrics.deliveries_completed.toLocaleString(),
      accent: 'text-neon-cyan',
    },
    {
      label: 'Ticks Ingested',
      value: metrics.ticks_ingested.toLocaleString(),
      accent: 'text-text-primary',
    },
    {
      label: 'Matches',
      value: metrics.matches_found.toLocaleString(),
      accent: 'text-neon-green',
    },
    {
      label: 'Dropped',
      value: metrics.ticks_dropped.toLocaleString(),
      accent: metrics.ticks_dropped > 0 ? 'text-neon-rose' : 'text-text-primary',
    },
    {
      label: 'Active Connectors',
      value: metrics.active_connectors.toString(),
      accent: 'text-neon-cyan',
    },
  ];

  return (
    <div data-testid="pipeline-metrics" className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {cards.map((card) => (
        <div key={card.label} className="card p-4">
          <p className="text-[10px] font-mono text-text-muted uppercase tracking-wider">
            {card.label}
          </p>
          <p className={`text-xl font-mono font-bold mt-1 ${card.accent}`}>
            {card.value}
          </p>
        </div>
      ))}
    </div>
  );
}

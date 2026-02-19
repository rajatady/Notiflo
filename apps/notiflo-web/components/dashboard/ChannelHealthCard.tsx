import React from 'react';
import { ChannelHealth } from '../../lib/types';

interface ChannelHealthCardProps {
  channel: ChannelHealth;
}

const statusBadge: Record<ChannelHealth['status'], string> = {
  healthy: 'badge-green',
  degraded: 'badge-amber',
  down: 'badge-rose',
};

export default function ChannelHealthCard({ channel }: ChannelHealthCardProps) {
  return (
    <div
      data-testid={`channel-card-${channel.channel}`}
      className="card p-5"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-text-primary">{channel.channel}</h3>
        <span
          data-testid={`status-badge-${channel.channel}`}
          className={statusBadge[channel.status]}
        >
          {channel.status}
        </span>
      </div>
      <dl className="space-y-2">
        <div className="flex justify-between">
          <dt className="text-xs text-text-muted">Throughput</dt>
          <dd className="font-mono text-xs text-text-primary">{channel.throughputPerSecond}/s</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-xs text-text-muted">Error Rate</dt>
          <dd className="font-mono text-xs text-text-primary">{channel.errorRate}%</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-xs text-text-muted">Avg Latency</dt>
          <dd className="font-mono text-xs text-text-primary">{channel.avgLatencyMs}ms</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-xs text-text-muted">Circuit Breaker</dt>
          <dd className="font-mono text-xs text-text-primary">{channel.circuitBreakerState}</dd>
        </div>
      </dl>
    </div>
  );
}

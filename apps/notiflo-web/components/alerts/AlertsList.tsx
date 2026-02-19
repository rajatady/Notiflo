import React from 'react';
import { Alert } from '../../lib/types';

interface AlertsListProps {
  alerts: Alert[] | null;
  loading: boolean;
  error: string | null;
}

const strategyBadge: Record<string, { label: string; className: string }> = {
  threshold_crossing: { label: 'Threshold', className: 'badge-green' },
  expression: { label: 'Expression', className: 'badge-cyan' },
  script: { label: 'Rhai Script', className: 'badge-violet' },
};

export default function AlertsList({ alerts, loading, error }: AlertsListProps) {
  if (loading) {
    return <div className="text-text-muted py-4 text-sm">Loading...</div>;
  }

  if (error) {
    return <div className="text-neon-rose py-4 text-sm">{error}</div>;
  }

  if (!alerts || alerts.length === 0) {
    return (
      <div className="text-text-muted py-8 text-center text-sm">
        <p>No alerts</p>
        <p className="text-[11px] mt-1">Create your first alert to start evaluating conditions.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table data-testid="alerts-table" className="min-w-full">
        <thead>
          <tr className="bg-elevated border-b border-border">
            <th className="px-4 py-3 text-left text-[10px] font-semibold text-text-muted uppercase tracking-wider">Name</th>
            <th className="px-4 py-3 text-left text-[10px] font-semibold text-text-muted uppercase tracking-wider">Symbol</th>
            <th className="px-4 py-3 text-left text-[10px] font-semibold text-text-muted uppercase tracking-wider">Strategy</th>
            <th className="px-4 py-3 text-left text-[10px] font-semibold text-text-muted uppercase tracking-wider">Channels</th>
            <th className="px-4 py-3 text-left text-[10px] font-semibold text-text-muted uppercase tracking-wider">Status</th>
            <th className="px-4 py-3 text-left text-[10px] font-semibold text-text-muted uppercase tracking-wider">Created</th>
          </tr>
        </thead>
        <tbody>
          {alerts.map((alert, index) => {
            const badge = strategyBadge[alert.strategyType] || {
              label: alert.strategyType,
              className: 'badge bg-elevated text-text-secondary border border-border',
            };
            return (
              <tr
                key={alert._id}
                data-testid={`alert-row-${alert._id}`}
                className={`border-b border-border/50 transition-colors hover:bg-elevated/50 ${
                  index % 2 === 0 ? 'bg-surface' : 'bg-surface/50'
                }`}
              >
                <td className="px-4 py-3 text-sm text-text-primary">{alert.name || '-'}</td>
                <td className="px-4 py-3 text-sm text-neon-cyan font-mono font-medium">{alert.symbol}</td>
                <td className="px-4 py-3 text-sm">
                  <span className={badge.className}>{badge.label}</span>
                </td>
                <td className="px-4 py-3 text-sm text-text-secondary">
                  <div className="flex gap-1">
                    {alert.channels.map((ch) => (
                      <span key={ch} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-elevated border border-border text-text-muted">
                        {ch}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3 text-sm">
                  <span className={alert.active ? 'badge-green' : 'badge bg-elevated text-text-muted border border-border'}>
                    {alert.active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-text-muted font-mono text-xs">
                  {new Date(alert.createdAt).toLocaleDateString()}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

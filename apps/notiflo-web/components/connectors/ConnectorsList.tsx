import React from 'react';
import { Connector, ConnectorType, ConnectorStatus } from '../../lib/types';
import { deleteConnector } from '../../lib/api-client';

interface ConnectorsListProps {
  connectors: Connector[] | null;
  loading: boolean;
  error: string | null;
  onDeleted: () => void;
}

const typeBadge: Record<ConnectorType, { label: string; className: string }> = {
  redis_stream: { label: 'Redis Stream', className: 'badge-cyan' },
  redis_queue: { label: 'Redis Queue', className: 'badge-green' },
  websocket: { label: 'WebSocket', className: 'badge-violet' },
  kafka: { label: 'Kafka', className: 'badge bg-elevated text-text-secondary border border-border' },
};

const statusDot: Record<ConnectorStatus, string> = {
  connected: 'bg-neon-green',
  disconnected: 'bg-text-muted',
  error: 'bg-neon-rose',
};

export default function ConnectorsList({ connectors, loading, error, onDeleted }: ConnectorsListProps) {
  if (loading) {
    return <div className="text-text-muted py-4 text-sm">Loading...</div>;
  }

  if (error) {
    return <div className="text-neon-rose py-4 text-sm">{error}</div>;
  }

  if (!connectors || connectors.length === 0) {
    return (
      <div className="text-text-muted py-8 text-center text-sm">
        <p>No connectors</p>
        <p className="text-[11px] mt-1">Add a connector to start ingesting data.</p>
      </div>
    );
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteConnector(id);
      onDeleted();
    } catch {
      // silent — refetch will show current state
    }
  };

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table data-testid="connectors-table" className="min-w-full">
        <thead>
          <tr className="bg-elevated border-b border-border">
            <th className="px-4 py-3 text-left text-[10px] font-semibold text-text-muted uppercase tracking-wider">Name</th>
            <th className="px-4 py-3 text-left text-[10px] font-semibold text-text-muted uppercase tracking-wider">Type</th>
            <th className="px-4 py-3 text-left text-[10px] font-semibold text-text-muted uppercase tracking-wider">Status</th>
            <th className="px-4 py-3 text-right text-[10px] font-semibold text-text-muted uppercase tracking-wider">Ticks</th>
            <th className="px-4 py-3 text-left text-[10px] font-semibold text-text-muted uppercase tracking-wider">Last Tick</th>
            <th className="px-4 py-3 text-left text-[10px] font-semibold text-text-muted uppercase tracking-wider">Active</th>
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody>
          {connectors.map((conn, index) => {
            const badge = typeBadge[conn.type] || {
              label: conn.type,
              className: 'badge bg-elevated text-text-secondary border border-border',
            };
            const dot = statusDot[conn.status] || 'bg-text-muted';

            return (
              <tr
                key={conn._id}
                data-testid={`connector-row-${conn._id}`}
                className={`border-b border-border/50 transition-colors hover:bg-elevated/50 ${
                  index % 2 === 0 ? 'bg-surface' : 'bg-surface/50'
                }`}
              >
                <td className="px-4 py-3 text-sm text-text-primary">{conn.name}</td>
                <td className="px-4 py-3 text-sm">
                  <span className={badge.className}>{badge.label}</span>
                </td>
                <td className="px-4 py-3 text-sm">
                  <span className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${dot}`} />
                    <span className="text-text-secondary text-xs capitalize">{conn.status}</span>
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-right font-mono text-text-secondary">
                  {conn.ticksIngested.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-sm text-text-muted font-mono text-xs">
                  {conn.lastTickAt
                    ? new Date(conn.lastTickAt).toLocaleTimeString()
                    : '-'}
                </td>
                <td className="px-4 py-3 text-sm">
                  <span className={conn.active ? 'badge-green' : 'badge bg-elevated text-text-muted border border-border'}>
                    {conn.active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => handleDelete(conn._id)}
                    className="text-text-muted hover:text-neon-rose transition-colors text-xs font-mono"
                  >
                    delete
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

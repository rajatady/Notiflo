import React from 'react';
import CreateConnectorForm from '../components/connectors/CreateConnectorForm';
import ConnectorsList from '../components/connectors/ConnectorsList';
import { useConnectors } from '../hooks/useConnectors';

export default function ConnectorsPage() {
  const { data, loading, error, refetch } = useConnectors();

  return (
    <div data-testid="connectors-page" className="max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="page-title">Connectors</h1>
        <p className="text-sm text-text-secondary mt-1">
          Data source connectors feed real-time ticks into the evaluation engine. Each connector runs as an independent ingest task.
        </p>
      </div>

      {/* Type overview cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 animate-fade-in">
        {[
          {
            name: 'Redis Stream',
            desc: 'XREADGROUP consumer group. Ordered, durable, highest throughput.',
            protocol: 'RESP3',
            color: 'neon-cyan',
          },
          {
            name: 'Redis Queue',
            desc: 'BRPOP consumer. Simple FIFO queue ingestion.',
            protocol: 'RESP3',
            color: 'neon-green',
          },
          {
            name: 'WebSocket',
            desc: 'Persistent connection with auto-reconnect. Real-time push.',
            protocol: 'WS/WSS',
            color: 'neon-violet',
          },
          {
            name: 'Kafka',
            desc: 'Consumer group reader. Partitioned, distributed streaming.',
            protocol: 'TCP',
            color: 'neon-rose',
          },
        ].map((ct) => (
          <div
            key={ct.name}
            className={`card p-4 border-l-2 border-l-${ct.color}`}
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className={`text-sm font-semibold text-${ct.color}`}>{ct.name}</h3>
              <span className="text-[10px] font-mono text-text-muted bg-deep px-2 py-0.5 rounded">{ct.protocol}</span>
            </div>
            <p className="text-xs text-text-secondary leading-relaxed">{ct.desc}</p>
          </div>
        ))}
      </div>

      {/* Create connector form */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-5">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-neon-cyan">
            <path d="M12 5v14M5 12h14" />
          </svg>
          <h2 className="section-title">Add Connector</h2>
        </div>
        <CreateConnectorForm onCreated={refetch} />
      </div>

      {/* Connectors table */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h2 className="section-title">Active Connectors</h2>
            {data && (
              <span className="text-[10px] font-mono text-text-muted bg-elevated px-2 py-0.5 rounded border border-border">
                {data.length}
              </span>
            )}
          </div>
          <button
            onClick={refetch}
            className="text-xs text-text-muted hover:text-neon-cyan transition-colors font-mono"
          >
            refresh
          </button>
        </div>
        <ConnectorsList connectors={data} loading={loading} error={error} onDeleted={refetch} />
      </div>
    </div>
  );
}

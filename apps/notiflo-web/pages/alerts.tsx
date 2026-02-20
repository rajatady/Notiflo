import React from 'react';
import CreateAlertForm from '../components/alerts/CreateAlertForm';
import AlertsList from '../components/alerts/AlertsList';
import SubmitTickButton from '../components/alerts/SubmitTickButton';
import LoadTestPanel from '../components/alerts/LoadTestPanel';
import { useAlerts } from '../hooks/useAlerts';

export default function AlertsPage() {
  const { data, loading, error, refetch } = useAlerts();

  return (
    <div data-testid="alerts-page" className="max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="page-title">Condition Engine</h1>
        <p className="text-sm text-text-secondary mt-1">
          Deploy evaluation strategies, test with live ticks, and run load benchmarks against the Rust engine.
        </p>
      </div>

      {/* Strategy overview cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 animate-fade-in">
        {[
          {
            name: 'Threshold Crossing',
            desc: 'O(1) B-tree sentinel check. Price must cross the boundary (below-to-above or above-to-below).',
            latency: '~18ns/eval',
            color: 'neon-green',
            use: 'Financial alerts, price targets',
          },
          {
            name: 'Expression DSL',
            desc: 'Compiled AST with AND/OR/NOT operators. Zero-allocation evaluation per tick.',
            latency: '~50ns/eval',
            color: 'neon-cyan',
            use: 'IoT monitoring, threshold bands',
          },
          {
            name: 'Rhai Script Engine',
            desc: 'Sandboxed Rhai VM with configurable limits. Full custom logic with metadata access.',
            latency: '~1-5us/eval',
            color: 'neon-violet',
            use: 'Custom logic, complex conditions',
          },
        ].map((strategy) => (
          <div
            key={strategy.name}
            className={`card p-4 border-l-2 border-l-${strategy.color}`}
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className={`text-sm font-semibold text-${strategy.color}`}>{strategy.name}</h3>
              <span className="text-[10px] font-mono text-text-muted bg-deep px-2 py-0.5 rounded">{strategy.latency}</span>
            </div>
            <p className="text-xs text-text-secondary leading-relaxed">{strategy.desc}</p>
            <p className="text-[10px] text-text-muted mt-2 font-mono">{strategy.use}</p>
          </div>
        ))}
      </div>

      {/* Main content: Create + Test */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Create alert — takes 3 cols */}
        <div className="lg:col-span-3">
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-5">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-neon-cyan">
                <path d="M12 5v14M5 12h14" />
              </svg>
              <h2 className="section-title">Deploy Alert</h2>
            </div>
            <CreateAlertForm onCreated={refetch} />
          </div>
        </div>

        {/* Test panels — takes 2 cols */}
        <div className="lg:col-span-2 space-y-4">
          <SubmitTickButton />
          <LoadTestPanel />
        </div>
      </div>

      {/* Active alerts table */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h2 className="section-title">Active Alerts</h2>
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
        <AlertsList alerts={data} loading={loading} error={error} />
      </div>
    </div>
  );
}

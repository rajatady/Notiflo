import React, { useState, FormEvent } from 'react';
import { createConnector } from '../../lib/api-client';
import { ConnectorType, CreateConnectorPayload } from '../../lib/types';

interface CreateConnectorFormProps {
  onCreated: () => void;
}

const CONNECTOR_TYPES: {
  value: ConnectorType;
  label: string;
  description: string;
  color: string;
  icon: React.ReactNode;
  fields: { key: string; label: string; placeholder: string; type?: string }[];
}[] = [
  {
    value: 'redis_stream',
    label: 'Redis Stream',
    description: 'XREADGROUP consumer. Highest throughput for ordered event streams.',
    color: 'neon-cyan',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M2 12h20M2 6h20M2 18h20" />
      </svg>
    ),
    fields: [
      { key: 'url', label: 'Redis URL', placeholder: 'redis://localhost:6379' },
      { key: 'streamKey', label: 'Stream Key', placeholder: 'notiflo:ticks' },
      { key: 'consumerGroup', label: 'Consumer Group', placeholder: 'notiflo-runtime' },
    ],
  },
  {
    value: 'redis_queue',
    label: 'Redis Queue',
    description: 'BRPOP consumer. Simple queue-based ingestion.',
    color: 'neon-green',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M12 2v20M2 12h20" />
      </svg>
    ),
    fields: [
      { key: 'url', label: 'Redis URL', placeholder: 'redis://localhost:6379' },
      { key: 'queueKey', label: 'Queue Key', placeholder: 'notiflo:ticks' },
    ],
  },
  {
    value: 'websocket',
    label: 'WebSocket',
    description: 'Persistent WS connection with auto-reconnect.',
    color: 'neon-violet',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
      </svg>
    ),
    fields: [
      { key: 'url', label: 'WebSocket URL', placeholder: 'wss://stream.example.com/ticks' },
      { key: 'reconnectMs', label: 'Reconnect Delay (ms)', placeholder: '3000', type: 'number' },
    ],
  },
  {
    value: 'kafka',
    label: 'Kafka',
    description: 'Consumer group reader for Apache Kafka topics.',
    color: 'neon-rose',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="12" cy="12" r="3" />
        <circle cx="19" cy="5" r="2" />
        <circle cx="5" cy="5" r="2" />
        <circle cx="19" cy="19" r="2" />
        <circle cx="5" cy="19" r="2" />
        <path d="M14.5 10l3-3.5M9.5 10l-3-3.5M14.5 14l3 3.5M9.5 14l-3 3.5" />
      </svg>
    ),
    fields: [
      { key: 'brokers', label: 'Brokers', placeholder: 'localhost:9092,localhost:9093' },
      { key: 'topic', label: 'Topic', placeholder: 'ticks' },
      { key: 'groupId', label: 'Group ID', placeholder: 'notiflo-runtime' },
    ],
  },
];

export default function CreateConnectorForm({ onCreated }: CreateConnectorFormProps) {
  const [name, setName] = useState('');
  const [connectorType, setConnectorType] = useState<ConnectorType>('redis_stream');
  const [configFields, setConfigFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const selected = CONNECTOR_TYPES.find((t) => t.value === connectorType)!;
  const isValid = name.trim() !== '';

  const handleFieldChange = (key: string, value: string) => {
    setConfigFields((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);

    const config: Record<string, unknown> = {};
    for (const field of selected.fields) {
      const val = configFields[field.key]?.trim();
      if (val) {
        config[field.key] = field.type === 'number' ? Number(val) : val;
      }
    }

    const payload: CreateConnectorPayload = {
      organizationId: 'default-org',
      name: name.trim(),
      type: connectorType,
      config,
    };

    try {
      await createConnector(payload);
      setSuccess('Connector created');
      setName('');
      setConfigFields({});
      onCreated();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form data-testid="connector-form" onSubmit={handleSubmit} className="space-y-5">
      {/* Type selector cards */}
      <div>
        <label className="label">Connector Type</label>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2" data-testid="connector-type">
          {CONNECTOR_TYPES.map((ct) => {
            const isSelected = connectorType === ct.value;
            const colorMap: Record<string, string> = {
              'neon-cyan': isSelected
                ? 'border-neon-cyan/40 bg-glow-cyan shadow-glow-cyan'
                : 'border-border hover:border-neon-cyan/20',
              'neon-green': isSelected
                ? 'border-neon-green/40 bg-glow-green shadow-glow-green'
                : 'border-border hover:border-neon-green/20',
              'neon-violet': isSelected
                ? 'border-neon-violet/40 bg-glow-violet shadow-glow-violet'
                : 'border-border hover:border-neon-violet/20',
              'neon-rose': isSelected
                ? 'border-neon-rose/40 bg-glow-rose shadow-glow-rose'
                : 'border-border hover:border-neon-rose/20',
            };
            const textColor: Record<string, string> = {
              'neon-cyan': isSelected ? 'text-neon-cyan' : 'text-text-secondary',
              'neon-green': isSelected ? 'text-neon-green' : 'text-text-secondary',
              'neon-violet': isSelected ? 'text-neon-violet' : 'text-text-secondary',
              'neon-rose': isSelected ? 'text-neon-rose' : 'text-text-secondary',
            };

            return (
              <button
                key={ct.value}
                type="button"
                data-testid={`connector-type-${ct.value}`}
                onClick={() => {
                  setConnectorType(ct.value);
                  setConfigFields({});
                }}
                className={`relative p-3 rounded-lg border text-left transition-all duration-200 bg-elevated ${
                  colorMap[ct.color]
                }`}
              >
                <div className={`mb-2 ${textColor[ct.color]}`}>
                  {ct.icon}
                </div>
                <p className={`text-sm font-semibold ${isSelected ? 'text-text-primary' : 'text-text-secondary'}`}>
                  {ct.label}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Name */}
      <div>
        <label htmlFor="connector-name" className="label">Name</label>
        <input
          id="connector-name"
          data-testid="connector-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="input-field"
          placeholder="My Redis Stream"
        />
      </div>

      {/* Dynamic config fields */}
      <div className="rounded-lg border border-border bg-elevated/50 p-4">
        <div className="flex items-center gap-2 mb-3">
          <span className={`text-${selected.color}`}>{selected.icon}</span>
          <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
            {selected.label} Configuration
          </span>
        </div>
        <p className="text-[10px] text-text-muted mb-3">{selected.description}</p>
        <div className="space-y-3">
          {selected.fields.map((field) => (
            <div key={field.key}>
              <label htmlFor={`connector-${field.key}`} className="label">{field.label}</label>
              <input
                id={`connector-${field.key}`}
                data-testid={`connector-${field.key}`}
                type={field.type || 'text'}
                value={configFields[field.key] || ''}
                onChange={(e) => handleFieldChange(field.key, e.target.value)}
                className="input-field font-mono"
                placeholder={field.placeholder}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Submit */}
      <button
        type="submit"
        data-testid="connector-submit"
        disabled={!isValid || submitting}
        className="btn-primary w-full"
      >
        {submitting ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
              <path d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" fill="currentColor" className="opacity-75" />
            </svg>
            Creating...
          </span>
        ) : (
          'Add Connector'
        )}
      </button>

      {success && (
        <div data-testid="connector-success" className="rounded-lg border border-neon-green/20 bg-glow-green p-3 text-sm text-neon-green flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
            <path d="M22 4L12 14.01l-3-3" />
          </svg>
          Connector created
        </div>
      )}

      {error && (
        <div data-testid="connector-error" className="rounded-lg border border-neon-rose/20 bg-glow-rose p-3 text-sm text-neon-rose flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
          {error}
        </div>
      )}
    </form>
  );
}

import React, { useState, FormEvent } from 'react';
import { createAlert } from '../../lib/api-client';
import { CreateAlertPayload } from '../../lib/types';

interface CreateAlertFormProps {
  onCreated: () => void;
}

const STRATEGIES = [
  {
    value: 'threshold_crossing',
    label: 'Threshold',
    description: 'B-tree sentinel check. Triggers when price crosses a boundary.',
    latency: '~18ns',
    color: 'neon-green',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
      </svg>
    ),
  },
  {
    value: 'expression',
    label: 'Expression',
    description: 'DSL for compound conditions. Supports AND/OR/NOT operators.',
    latency: '~50ns',
    color: 'neon-cyan',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M16 18l6-6-6-6M8 6l-6 6 6 6" />
      </svg>
    ),
  },
  {
    value: 'script',
    label: 'Rhai Script',
    description: 'Sandboxed scripting engine. Full custom logic with safety limits.',
    latency: '~1-5us',
    color: 'neon-violet',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M4 17l6-6-6-6M12 19h8" />
      </svg>
    ),
  },
] as const;

const CHANNEL_OPTIONS = [
  { value: 'email', label: 'Email', icon: '@' },
  { value: 'sms', label: 'SMS', icon: '#' },
  { value: 'push', label: 'Push', icon: '!' },
  { value: 'in_app', label: 'In-App', icon: '*' },
] as const;

const RHAI_EXAMPLES = [
  { label: 'Simple threshold', code: 'value > 150.0' },
  { label: 'Volume-weighted', code: 'value > 150.0 && volume > 1_000_000.0' },
  {
    label: 'Percentage change',
    code: `let change_pct = (value - prev_close) / prev_close * 100.0;
change_pct > 5.0 || change_pct < -5.0`,
  },
  {
    label: 'Bollinger range',
    code: `let mid = 150.0;
let band = 10.0;
value >= mid - band && value <= mid + band`,
  },
];

const EXPRESSION_EXAMPLES = [
  'value > 150',
  'value >= 100 AND value <= 200',
  'price > 150 AND volume > 1000000',
  '(value > 200 OR value < 50)',
];

export default function CreateAlertForm({ onCreated }: CreateAlertFormProps) {
  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [strategyType, setStrategyType] = useState('threshold_crossing');
  const [targetPrice, setTargetPrice] = useState('');
  const [direction, setDirection] = useState('above');
  const [expression, setExpression] = useState('');
  const [script, setScript] = useState('');
  const [channels, setChannels] = useState<string[]>([]);
  const [subscriberId, setSubscriberId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isValid = symbol.trim() !== '' && subscriberId.trim() !== '';

  const handleChannelChange = (channel: string) => {
    setChannels((prev) =>
      prev.includes(channel)
        ? prev.filter((c) => c !== channel)
        : [...prev, channel]
    );
  };

  const buildStrategyParams = (): Record<string, unknown> => {
    switch (strategyType) {
      case 'threshold_crossing':
        return {
          threshold: targetPrice ? Number(targetPrice) : undefined,
          operator: direction === 'above' ? 'cross_above' : 'cross_below',
        };
      case 'expression':
        return { expression: expression.trim() };
      case 'script':
        return { script: script.trim() };
      default:
        return {};
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);

    const payload: CreateAlertPayload = {
      organizationId: 'default-org',
      subscriberId: subscriberId.trim(),
      symbol: symbol.trim().toUpperCase(),
      strategyType,
      strategyParams: buildStrategyParams(),
      channels,
    };

    if (name.trim()) {
      payload.name = name.trim();
    }

    try {
      await createAlert(payload);
      setSuccess('Alert created successfully');
      onCreated();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'An error occurred';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const selectedStrategy = STRATEGIES.find((s) => s.value === strategyType);

  return (
    <form data-testid="alert-form" onSubmit={handleSubmit} className="space-y-5">
      {/* Strategy Selector Cards */}
      <div>
        <label className="label">Evaluation Strategy</label>
        <div className="grid grid-cols-3 gap-2" data-testid="alert-strategy">
          {STRATEGIES.map((strategy) => {
            const isSelected = strategyType === strategy.value;
            const colorMap: Record<string, string> = {
              'neon-green': isSelected
                ? 'border-neon-green/40 bg-glow-green shadow-glow-green'
                : 'border-border hover:border-neon-green/20',
              'neon-cyan': isSelected
                ? 'border-neon-cyan/40 bg-glow-cyan shadow-glow-cyan'
                : 'border-border hover:border-neon-cyan/20',
              'neon-violet': isSelected
                ? 'border-neon-violet/40 bg-glow-violet shadow-glow-violet'
                : 'border-border hover:border-neon-violet/20',
            };
            const textColor: Record<string, string> = {
              'neon-green': isSelected ? 'text-neon-green' : 'text-text-secondary',
              'neon-cyan': isSelected ? 'text-neon-cyan' : 'text-text-secondary',
              'neon-violet': isSelected ? 'text-neon-violet' : 'text-text-secondary',
            };

            return (
              <button
                key={strategy.value}
                type="button"
                data-testid={`strategy-${strategy.value}`}
                onClick={() => setStrategyType(strategy.value)}
                className={`relative p-3 rounded-lg border text-left transition-all duration-200 bg-elevated ${
                  colorMap[strategy.color]
                }`}
              >
                <div className={`mb-2 ${textColor[strategy.color]}`}>
                  {strategy.icon}
                </div>
                <p className={`text-sm font-semibold ${isSelected ? 'text-text-primary' : 'text-text-secondary'}`}>
                  {strategy.label}
                </p>
                <p className="text-[10px] font-mono text-text-muted mt-1">
                  {strategy.latency}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Common fields */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="alert-name" className="label">Name</label>
          <input
            id="alert-name"
            data-testid="alert-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input-field"
            placeholder="My Alert"
          />
        </div>
        <div>
          <label htmlFor="alert-symbol" className="label">Symbol</label>
          <input
            id="alert-symbol"
            data-testid="alert-symbol"
            type="text"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            className="input-field font-mono"
            placeholder="AAPL"
          />
        </div>
      </div>

      {/* Strategy-specific params */}
      <div className="rounded-lg border border-border bg-elevated/50 p-4">
        <div className="flex items-center gap-2 mb-3">
          <span className={`text-${selectedStrategy?.color}`}>
            {selectedStrategy?.icon}
          </span>
          <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
            {selectedStrategy?.label} Parameters
          </span>
        </div>

        {strategyType === 'threshold_crossing' && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="alert-target-price" className="label">Threshold</label>
              <input
                id="alert-target-price"
                data-testid="alert-target-price"
                type="number"
                step="any"
                value={targetPrice}
                onChange={(e) => setTargetPrice(e.target.value)}
                className="input-field font-mono"
                placeholder="150.00"
              />
            </div>
            <div>
              <label htmlFor="alert-direction" className="label">Direction</label>
              <select
                id="alert-direction"
                data-testid="alert-direction"
                value={direction}
                onChange={(e) => setDirection(e.target.value)}
                className="select-field"
              >
                <option value="above">Cross Above</option>
                <option value="below">Cross Below</option>
              </select>
            </div>
          </div>
        )}

        {strategyType === 'expression' && (
          <div>
            <label htmlFor="alert-expression" className="label">Expression DSL</label>
            <input
              id="alert-expression"
              data-testid="alert-expression"
              type="text"
              value={expression}
              onChange={(e) => setExpression(e.target.value)}
              className="input-field font-mono text-neon-cyan"
              placeholder="value > 150 AND volume > 1000000"
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {EXPRESSION_EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => setExpression(ex)}
                  className="text-[10px] font-mono px-2 py-1 rounded border border-border bg-deep text-text-muted hover:text-neon-cyan hover:border-neon-cyan/30 transition-colors"
                >
                  {ex}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-text-muted mt-2">
              Fields: <span className="font-mono text-neon-cyan">value</span>, <span className="font-mono text-neon-cyan">secondary_value</span> (aliases: <span className="font-mono text-neon-cyan">price</span>, <span className="font-mono text-neon-cyan">volume</span>). Operators: {'>'} {'>='} {'<'} {'<='} == != AND OR NOT
            </p>
          </div>
        )}

        {strategyType === 'script' && (
          <div>
            <label htmlFor="alert-script" className="label">Rhai Script</label>
            <textarea
              id="alert-script"
              data-testid="alert-script"
              value={script}
              onChange={(e) => setScript(e.target.value)}
              className="code-editor"
              placeholder={`// Available variables: value, price, volume, symbol, timestamp\n// Metadata fields are injected as top-level variables\n// Must return a boolean\n\nvalue > 150.0`}
              rows={7}
            />
            <div className="mt-2">
              <p className="text-[10px] font-semibold text-text-muted mb-1.5 uppercase tracking-wider">Examples</p>
              <div className="grid grid-cols-2 gap-1.5">
                {RHAI_EXAMPLES.map((ex) => (
                  <button
                    key={ex.label}
                    type="button"
                    onClick={() => setScript(ex.code)}
                    className="text-left text-[10px] font-mono px-2.5 py-1.5 rounded border border-border bg-deep text-text-muted hover:text-neon-violet hover:border-neon-violet/30 transition-colors"
                  >
                    <span className="text-text-secondary font-body font-medium block mb-0.5">{ex.label}</span>
                    <span className="truncate block">{ex.code.split('\n')[0]}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-2 p-2 rounded border border-neon-violet/10 bg-glow-violet">
              <p className="text-[10px] text-neon-violet">
                Sandboxed: max 10,000 operations, max depth 32, no I/O access. Scripts that exceed limits are safely terminated.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Channels */}
      <fieldset>
        <legend className="label mb-2">Delivery Channels</legend>
        <div className="flex flex-wrap gap-2">
          {CHANNEL_OPTIONS.map((ch) => {
            const isChecked = channels.includes(ch.value);
            return (
              <label
                key={ch.value}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium cursor-pointer transition-all duration-150 ${
                  isChecked
                    ? 'border-neon-cyan/30 bg-glow-cyan text-neon-cyan'
                    : 'border-border bg-elevated text-text-muted hover:text-text-secondary hover:border-border-bright'
                }`}
              >
                <input
                  type="checkbox"
                  data-testid={`alert-channel-${ch.value}`}
                  checked={isChecked}
                  onChange={() => handleChannelChange(ch.value)}
                  className="sr-only"
                />
                <span className="font-mono text-xs w-4 text-center">{ch.icon}</span>
                {ch.label}
              </label>
            );
          })}
        </div>
      </fieldset>

      {/* Subscriber */}
      <div>
        <label htmlFor="alert-subscriber" className="label">Subscriber ID</label>
        <input
          id="alert-subscriber"
          data-testid="alert-subscriber"
          type="text"
          value={subscriberId}
          onChange={(e) => setSubscriberId(e.target.value)}
          className="input-field font-mono"
          placeholder="sub-001"
        />
      </div>

      {/* Submit */}
      <button
        type="submit"
        data-testid="alert-submit"
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
          'Deploy Alert'
        )}
      </button>

      {success && (
        <div data-testid="alert-success" className="rounded-lg border border-neon-green/20 bg-glow-green p-3 text-sm text-neon-green flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
            <path d="M22 4L12 14.01l-3-3" />
          </svg>
          Alert created successfully
        </div>
      )}

      {error && (
        <div data-testid="alert-error" className="rounded-lg border border-neon-rose/20 bg-glow-rose p-3 text-sm text-neon-rose flex items-center gap-2">
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

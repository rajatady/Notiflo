import React, { useState, useRef, useCallback, useEffect } from 'react';
import { startLoadTest, cancelLoadTest } from '../../lib/api-client';
import {
  LoadTestConfig,
  LoadTestEvent,
  LoadTestResult,
  ScaleStepResult,
} from '../../lib/types';

const DEFAULT_SCALE_STEPS = [10, 50, 100, 500, 1000];
const STRATEGY_OPTIONS = [
  { value: 'threshold_crossing', label: 'Threshold', color: 'neon-green' },
  { value: 'expression', label: 'Expression DSL', color: 'neon-cyan' },
  { value: 'script', label: 'Rhai Script', color: 'neon-violet' },
] as const;
const CHANNEL_OPTIONS = ['email', 'sms', 'push', 'in_app', 'webhook'] as const;

function round(n: number, d = 2): number {
  const f = Math.pow(10, d);
  return Math.round(n * f) / f;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${round(n / 1_000_000, 1)}M`;
  if (n >= 1_000) return `${round(n / 1_000, 1)}K`;
  return String(round(n));
}

function formatUs(us: number): string {
  if (us >= 1000) return `${round(us / 1000)}ms`;
  return `${round(us)}us`;
}

export default function LoadTestPanel() {
  // Config form state
  const [symbols, setSymbols] = useState('AAPL');
  const [strategyType, setStrategyType] = useState<LoadTestConfig['strategyType']>('threshold_crossing');
  const [ticksPerStep, setTicksPerStep] = useState('500');
  const [scaleSteps, setScaleSteps] = useState(DEFAULT_SCALE_STEPS.join(', '));
  const [channels, setChannels] = useState<string[]>(['email']);
  const [measureDelivery, setMeasureDelivery] = useState(true);

  // Test state
  const [running, setRunning] = useState(false);
  const [testId, setTestId] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(-1);
  const [currentStepConditions, setCurrentStepConditions] = useState(0);
  const [tickProgress, setTickProgress] = useState({ completed: 0, total: 0 });
  const [completedSteps, setCompletedSteps] = useState<ScaleStepResult[]>([]);
  const [result, setResult] = useState<LoadTestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const parsedSteps = scaleSteps.split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n) && n > 0);
  const isValid = symbols.trim() !== '' && Number(ticksPerStep) > 0 && parsedSteps.length > 0 && channels.length > 0;

  // Cleanup event source on unmount
  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
    };
  }, []);

  const handleStart = useCallback(async () => {
    if (!isValid) return;

    setRunning(true);
    setResult(null);
    setError(null);
    setCompletedSteps([]);
    setCurrentStep(-1);
    setTickProgress({ completed: 0, total: 0 });

    const config: LoadTestConfig = {
      scaleSteps: parsedSteps,
      ticksPerStep: Number(ticksPerStep),
      symbols: symbols.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean),
      strategyType,
      measureDeliveryPipeline: measureDelivery,
      channels,
      organizationId: 'default-org',
    };

    try {
      const { testId: id } = await startLoadTest(config);
      setTestId(id);

      // Connect to SSE stream
      const apiBase = process.env.NEXT_PUBLIC_API_URL || '/api';
      const evtSource = new EventSource(`${apiBase}/load-test/${id}/stream`);
      eventSourceRef.current = evtSource;

      evtSource.onmessage = (event) => {
        try {
          const data: LoadTestEvent = JSON.parse(event.data);

          switch (data.type) {
            case 'step_started':
              setCurrentStep(data.step);
              setCurrentStepConditions(data.conditionCount);
              setTickProgress({ completed: 0, total: 0 });
              break;
            case 'step_progress':
              setTickProgress({
                completed: data.ticksCompleted,
                total: data.ticksTotal,
              });
              break;
            case 'step_completed':
              setCompletedSteps((prev) => [...prev, data.result]);
              break;
            case 'completed':
              setResult(data.result);
              setRunning(false);
              evtSource.close();
              break;
            case 'failed':
              setError(data.error);
              setRunning(false);
              evtSource.close();
              break;
            case 'cancelled':
              setRunning(false);
              evtSource.close();
              break;
          }
        } catch {
          // ignore parse errors
        }
      };

      evtSource.onerror = () => {
        setRunning(false);
        evtSource.close();
      };
    } catch (err: any) {
      setError(err.message || 'Failed to start load test');
      setRunning(false);
    }
  }, [isValid, symbols, strategyType, ticksPerStep, parsedSteps, channels, measureDelivery]);

  const handleCancel = useCallback(async () => {
    if (testId) {
      await cancelLoadTest(testId).catch(() => {});
    }
    eventSourceRef.current?.close();
    setRunning(false);
  }, [testId]);

  const toggleChannel = (ch: string) => {
    setChannels((prev) =>
      prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch],
    );
  };

  const totalSteps = parsedSteps.length;
  const overallProgress = totalSteps > 0
    ? ((completedSteps.length + (tickProgress.total > 0 ? tickProgress.completed / tickProgress.total : 0)) / totalSteps) * 100
    : 0;

  return (
    <div data-testid="load-test-panel" className="space-y-4">
      {/* Config Form */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-neon-amber">
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
          </svg>
          <h3 className="section-title">Load Test</h3>
          <span className="text-[10px] font-mono text-text-muted ml-auto">server-side simulation</span>
        </div>

        <div className="space-y-3">
          {/* Symbol & Strategy */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="lt-symbol" className="label">Symbol(s)</label>
              <input
                id="lt-symbol"
                data-testid="lt-symbol"
                type="text"
                value={symbols}
                onChange={(e) => setSymbols(e.target.value)}
                className="input-field font-mono"
                placeholder="AAPL, MSFT"
                disabled={running}
              />
            </div>
            <div>
              <label className="label">Strategy</label>
              <div className="flex gap-1.5">
                {STRATEGY_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setStrategyType(opt.value as LoadTestConfig['strategyType'])}
                    disabled={running}
                    className={`flex-1 rounded-md px-2 py-2 text-[10px] font-semibold uppercase tracking-wider border transition-all ${
                      strategyType === opt.value
                        ? `border-${opt.color}/50 bg-${opt.color}/10 text-${opt.color}`
                        : 'border-border bg-elevated text-text-muted hover:border-border-bright'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Scale Steps & Ticks Per Step */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="lt-scale" className="label">Scale Steps (conditions)</label>
              <input
                id="lt-scale"
                data-testid="lt-scale-steps"
                type="text"
                value={scaleSteps}
                onChange={(e) => setScaleSteps(e.target.value)}
                className="input-field font-mono text-xs"
                placeholder="10, 50, 100, 500, 1000"
                disabled={running}
              />
            </div>
            <div>
              <label htmlFor="lt-ticks" className="label">Ticks Per Step</label>
              <input
                id="lt-ticks"
                data-testid="lt-tick-count"
                type="number"
                min="10"
                max="50000"
                value={ticksPerStep}
                onChange={(e) => setTicksPerStep(e.target.value)}
                className="input-field font-mono"
                disabled={running}
              />
            </div>
          </div>

          {/* Channels */}
          <div>
            <label className="label">Channels</label>
            <div className="flex flex-wrap gap-1.5">
              {CHANNEL_OPTIONS.map((ch) => (
                <button
                  key={ch}
                  type="button"
                  onClick={() => toggleChannel(ch)}
                  disabled={running}
                  className={`rounded-md px-2.5 py-1.5 text-[10px] font-mono uppercase border transition-all ${
                    channels.includes(ch)
                      ? 'border-neon-cyan/50 bg-neon-cyan/10 text-neon-cyan'
                      : 'border-border bg-elevated text-text-muted hover:border-border-bright'
                  }`}
                >
                  {ch.replace('_', '-')}
                </button>
              ))}
            </div>
          </div>

          {/* Delivery Pipeline Toggle */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={measureDelivery}
              onChange={(e) => setMeasureDelivery(e.target.checked)}
              disabled={running}
              className="rounded border-border bg-elevated text-neon-cyan focus:ring-neon-cyan"
            />
            <span className="text-xs text-text-secondary">Measure delivery pipeline overhead</span>
          </label>

          {/* Progress */}
          {running && (
            <div data-testid="lt-progress" className="space-y-2">
              <div className="flex justify-between text-xs font-mono text-text-muted">
                <span>
                  Step {currentStep + 1}/{totalSteps}
                  {currentStepConditions > 0 && ` — ${currentStepConditions} conditions`}
                </span>
                <span>{Math.round(overallProgress)}%</span>
              </div>
              <div className="h-1.5 bg-deep rounded-full overflow-hidden">
                <div
                  className="h-full bg-neon-amber rounded-full transition-all duration-150"
                  style={{ width: `${overallProgress}%` }}
                />
              </div>
              {tickProgress.total > 0 && (
                <div className="text-[10px] font-mono text-text-muted">
                  {tickProgress.completed}/{tickProgress.total} ticks evaluated
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            {!running ? (
              <button
                type="button"
                data-testid="lt-run"
                onClick={handleStart}
                disabled={!isValid}
                className="btn-primary flex-1"
              >
                Run Load Test
              </button>
            ) : (
              <button
                type="button"
                onClick={handleCancel}
                className="btn-danger flex-1"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Live Step Results */}
      {completedSteps.length > 0 && (
        <div className="space-y-3">
          {/* Scaling Chart */}
          <div className="card p-5">
            <p className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider mb-3">
              Scaling Behavior
            </p>
            <div className="space-y-2">
              {completedSteps.map((step, i) => {
                const maxThroughput = Math.max(
                  ...completedSteps.map((s) => s.throughput.ticksPerSecond),
                );
                const barWidth =
                  maxThroughput > 0
                    ? (step.throughput.ticksPerSecond / maxThroughput) * 100
                    : 0;
                return (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-[10px] font-mono text-text-muted w-20 text-right shrink-0">
                      {step.conditionCount} conds
                    </span>
                    <div className="flex-1 h-6 bg-elevated rounded overflow-hidden relative">
                      <div
                        className="h-full bg-neon-green/20 border-r border-neon-green rounded transition-all duration-300"
                        style={{ width: `${Math.max(2, barWidth)}%` }}
                      />
                      <span className="absolute inset-0 flex items-center px-2 text-[10px] font-mono text-neon-green">
                        {formatNumber(step.throughput.ticksPerSecond)} ticks/s
                        <span className="text-text-muted ml-2">
                          | {formatUs(step.engineEvaluation.mean)} avg
                          | p99: {formatUs(step.engineEvaluation.p99)}
                        </span>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Per-Step Detail Cards */}
          <div className="grid grid-cols-1 gap-3">
            {completedSteps.map((step, i) => (
              <StepDetailCard key={i} step={step} index={i} measureDelivery={measureDelivery} />
            ))}
          </div>
        </div>
      )}

      {/* Final Summary */}
      {result && result.status === 'completed' && result.steps.length > 0 && (
        <div className="card p-5">
          <p className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider mb-3">
            Summary
          </p>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div>
              <p className="text-[10px] font-mono text-text-muted">Total Ticks</p>
              <p className="text-lg font-display font-bold text-text-primary">
                {result.steps.reduce((a, s) => a + s.ticksEvaluated, 0)}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-mono text-text-muted">Total Matches</p>
              <p className="text-lg font-display font-bold text-neon-green">
                {result.steps.reduce((a, s) => a + s.totalMatches, 0)}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-mono text-text-muted">Total Duration</p>
              <p className="text-lg font-display font-bold text-text-primary">
                {round(result.steps.reduce((a, s) => a + s.stepDurationMs, 0))}ms
              </p>
            </div>
          </div>

          {/* Peak performance at max scale */}
          {(() => {
            const lastStep = result.steps[result.steps.length - 1];
            const firstStep = result.steps[0];
            const degradation = firstStep.throughput.ticksPerSecond > 0
              ? round((lastStep.throughput.ticksPerSecond / firstStep.throughput.ticksPerSecond) * 100, 1)
              : 0;
            return (
              <div className="rounded-lg border border-border bg-deep p-4">
                <p className="text-xs text-text-secondary mb-2">
                  At <span className="text-neon-cyan font-mono font-semibold">{lastStep.conditionCount}</span> conditions:
                </p>
                <div className="grid grid-cols-3 gap-3 text-[10px] font-mono">
                  <div>
                    <p className="text-text-muted">Throughput</p>
                    <p className="text-sm font-semibold text-neon-green">
                      {formatNumber(lastStep.throughput.ticksPerSecond)} ticks/s
                    </p>
                  </div>
                  <div>
                    <p className="text-text-muted">Engine p99</p>
                    <p className="text-sm font-semibold text-neon-amber">
                      {formatUs(lastStep.engineEvaluation.p99)}
                    </p>
                  </div>
                  <div>
                    <p className="text-text-muted">Retained</p>
                    <p className={`text-sm font-semibold ${degradation >= 80 ? 'text-neon-green' : degradation >= 50 ? 'text-neon-amber' : 'text-neon-rose'}`}>
                      {degradation}% of baseline
                    </p>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-neon-rose/20 bg-glow-rose p-3 text-sm text-neon-rose">
          {error}
        </div>
      )}
    </div>
  );
}

function StepDetailCard({
  step,
  index,
  measureDelivery,
}: {
  step: ScaleStepResult;
  index: number;
  measureDelivery: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-border bg-surface overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-3 hover:bg-elevated transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="badge-cyan text-[10px]">{step.conditionCount} conditions</span>
          <span className="text-[10px] font-mono text-text-muted">
            {formatNumber(step.throughput.ticksPerSecond)} ticks/s
          </span>
          <span className="text-[10px] font-mono text-text-muted">
            avg {formatUs(step.engineEvaluation.mean)}
          </span>
          <span className="text-[10px] font-mono text-text-muted">
            {step.totalMatches} matches
          </span>
        </div>
        <svg
          width="12" height="12" viewBox="0 0 12 12"
          className={`text-text-muted transition-transform ${expanded ? 'rotate-180' : ''}`}
        >
          <path fill="currentColor" d="M6 8L1 3h10z" />
        </svg>
      </button>

      {expanded && (
        <div className="border-t border-border p-4 space-y-4">
          {/* Engine Evaluation */}
          <div>
            <p className="text-[10px] font-semibold text-neon-green uppercase tracking-wider mb-2">
              Rust Engine Evaluation
            </p>
            <div className="grid grid-cols-6 gap-2 text-[10px] font-mono">
              {(['min', 'p50', 'p90', 'p95', 'p99', 'max'] as const).map((key) => (
                <div key={key}>
                  <p className="text-text-muted">{key}</p>
                  <p className="text-text-secondary">{formatUs(step.engineEvaluation[key])}</p>
                </div>
              ))}
            </div>
            <div className="mt-1 text-[10px] font-mono text-text-muted">
              mean: {formatUs(step.engineEvaluation.mean)} | {step.engineEvaluation.count} samples
            </div>
          </div>

          {/* Delivery Pipeline */}
          {measureDelivery && step.deliveryPipeline && (
            <div>
              <p className="text-[10px] font-semibold text-neon-amber uppercase tracking-wider mb-2">
                Internal Delivery Pipeline
              </p>
              <div className="grid grid-cols-6 gap-2 text-[10px] font-mono">
                {(['min', 'p50', 'p90', 'p95', 'p99', 'max'] as const).map((key) => (
                  <div key={key}>
                    <p className="text-text-muted">{key}</p>
                    <p className="text-text-secondary">{round(step.deliveryPipeline![key])}ms</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Provider Estimates */}
          {Object.keys(step.providerEstimates).length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-neon-violet uppercase tracking-wider mb-2">
                Provider Delivery Estimates
              </p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(step.providerEstimates).map(([ch, est]) => (
                  <div key={ch} className="rounded-md border border-border bg-deep px-3 py-2">
                    <p className="text-[10px] font-mono text-neon-violet font-semibold uppercase">{ch.replace('_', '-')}</p>
                    <p className="text-[10px] font-mono text-text-muted">{est.minMs}–{est.maxMs}ms</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Latency Waterfall */}
          <div>
            <p className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider mb-2">
              Latency Waterfall (avg per notification)
            </p>
            <WaterfallChart step={step} />
          </div>

          {/* Throughput */}
          <div className="grid grid-cols-3 gap-3 text-[10px] font-mono">
            <div>
              <p className="text-text-muted">Throughput</p>
              <p className="text-sm font-semibold text-neon-green">
                {formatNumber(step.throughput.ticksPerSecond)} ticks/s
              </p>
            </div>
            <div>
              <p className="text-text-muted">Match Rate</p>
              <p className="text-sm font-semibold text-text-primary">
                {step.ticksEvaluated > 0
                  ? round((step.totalMatches / step.ticksEvaluated) * 100, 1)
                  : 0}%
              </p>
            </div>
            <div>
              <p className="text-text-muted">Step Duration</p>
              <p className="text-sm font-semibold text-text-primary">
                {step.stepDurationMs}ms
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function WaterfallChart({ step }: { step: ScaleStepResult }) {
  const engineMs = step.engineEvaluation.mean / 1000; // convert us to ms
  const pipelineMs = step.deliveryPipeline?.mean ?? 0;

  // Get the first channel's estimate for the waterfall
  const providerEntries = Object.entries(step.providerEstimates);
  const avgProviderMs = providerEntries.length > 0
    ? providerEntries.reduce((sum, [, est]) => sum + (est.minMs + est.maxMs) / 2, 0) / providerEntries.length
    : 0;

  const totalMs = engineMs + pipelineMs + avgProviderMs;
  if (totalMs === 0) return null;

  const segments = [
    { label: 'Engine', ms: engineMs, color: 'bg-neon-green', textColor: 'text-neon-green' },
    ...(pipelineMs > 0
      ? [{ label: 'Pipeline', ms: pipelineMs, color: 'bg-neon-amber', textColor: 'text-neon-amber' }]
      : []),
    ...(avgProviderMs > 0
      ? [{ label: 'Provider (est)', ms: avgProviderMs, color: 'bg-neon-violet', textColor: 'text-neon-violet' }]
      : []),
  ];

  return (
    <div className="space-y-1.5">
      <div className="h-6 bg-elevated rounded overflow-hidden flex">
        {segments.map((seg) => (
          <div
            key={seg.label}
            className={`${seg.color}/30 border-r border-${seg.color} h-full flex items-center justify-center`}
            style={{ width: `${Math.max(2, (seg.ms / totalMs) * 100)}%` }}
          >
            <span className={`text-[8px] font-mono ${seg.textColor} truncate px-1`}>
              {seg.ms < 1 ? `${round(seg.ms * 1000)}us` : `${round(seg.ms)}ms`}
            </span>
          </div>
        ))}
      </div>
      <div className="flex gap-3">
        {segments.map((seg) => (
          <span key={seg.label} className={`text-[9px] font-mono ${seg.textColor}`}>
            {seg.label}: {seg.ms < 1 ? `${round(seg.ms * 1000)}us` : `${round(seg.ms)}ms`}
          </span>
        ))}
      </div>
    </div>
  );
}

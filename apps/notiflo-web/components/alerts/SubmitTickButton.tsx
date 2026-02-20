import React, { useState, FormEvent } from 'react';
import { submitTick } from '../../lib/api-client';

export default function SubmitTickButton() {
  const [symbol, setSymbol] = useState('');
  const [value, setValue] = useState('');
  const [result, setResult] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isValid = symbol.trim() !== '';

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setResult(null);
    setSubmitting(true);

    try {
      const res = await submitTick({
        symbol: symbol.trim().toUpperCase(),
        value: Number(value),
        timestampUs: Date.now() * 1000,
      });
      setResult(res.count);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'An error occurred';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-4">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-neon-green">
          <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
        </svg>
        <h3 className="section-title">Single Tick</h3>
      </div>

      <form data-testid="tick-form" onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="tick-symbol" className="label">Symbol</label>
            <input
              id="tick-symbol"
              data-testid="tick-symbol"
              type="text"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              className="input-field font-mono"
              placeholder="AAPL"
            />
          </div>
          <div>
            <label htmlFor="tick-value" className="label">Value</label>
            <input
              id="tick-value"
              data-testid="tick-value"
              type="number"
              step="any"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="input-field font-mono"
              placeholder="155.00"
            />
          </div>
        </div>

        <button
          type="submit"
          data-testid="tick-submit"
          disabled={!isValid || submitting}
          className="btn-secondary w-full"
        >
          {submitting ? 'Evaluating...' : 'Submit Tick'}
        </button>

        {result !== null && (
          <div data-testid="tick-result" className="rounded-lg border border-neon-green/20 bg-glow-green p-3 flex items-center justify-between">
            <span className="text-sm text-neon-green font-medium">{result} matches found</span>
            {result > 0 && (
              <span className="w-2 h-2 rounded-full bg-neon-green animate-glow-pulse" />
            )}
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-neon-rose/20 bg-glow-rose p-3 text-sm text-neon-rose">
            {error}
          </div>
        )}
      </form>
    </div>
  );
}

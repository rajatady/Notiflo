/**
 * Mirrors Rust NormalizedTickJs — the JS-facing tick shape.
 */
export interface NormalizedTickInput {
  symbol: string;
  value: number;
  secondaryValue?: number;
  textContent?: string;
  timestampUs: number;
  /** JSON string of arbitrary metadata */
  metadata?: string;
}

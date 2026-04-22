/**
 * Default value formatters used across the chart library.
 *
 * Two shapes are exposed:
 *   - `formatCompact` — compact K/M/B/T suffixes for large magnitudes, adaptive
 *     precision for values < 1. Intended for axis labels, legends, pie slices.
 *   - `formatPriceAdaptive` — full-precision display that scales decimal count
 *     to the magnitude. Intended for tooltip rows where users want to read the
 *     exact number.
 *
 * Both handle the full range of JS numbers the library is likely to see:
 *   - 0, ±Infinity, NaN
 *   - BTC-style sub-cent prices (0.00001234 → "0.00001234", not "1.234e-5")
 *   - trillion-scale values (5.4e12 → "5.40T")
 *   - Number.MAX_SAFE_INTEGER falls back to scientific notation (>= 1e15)
 *
 * Consumers can import these directly, or swap them in per-component via the
 * `format` prop on Tooltip/InfoBar/YAxis/etc. (see framework wrappers).
 */

/** Signature for a value-to-string formatter (YAxis, YLabel, Pie, Sparkline, NumberFlow). */
export type ValueFormatter = (value: number) => string;

/** Fields surfaced to a `Tooltip` / `InfoBar` formatter. */
export type TooltipField = 'open' | 'high' | 'low' | 'close' | 'volume' | 'value';

/** Signature for the tooltip formatter — single prop, field hint. */
export type TooltipFormatter = (value: number, field: TooltipField) => string;

/**
 * Human-readable rendering for values with leading zeros after the decimal
 * point. Picks enough decimals to show ~4 significant digits; trims trailing
 * zeros so `0.5000` comes back as `"0.5"`. Falls through to `toExponential`
 * only for values below `1e-12` where a decimal form would be unreasonably
 * long.
 */
function formatSmall(v: number): string {
  const abs = Math.abs(v);
  if (abs === 0) return '0';
  if (abs < 1e-12) return v.toExponential(2);
  const leadingZeros = Math.max(0, Math.ceil(-Math.log10(abs)) - 1);
  const decimals = Math.min(12, leadingZeros + 4);
  const fixed = v.toFixed(decimals);
  return fixed.includes('.') ? fixed.replace(/\.?0+$/, '') : fixed;
}

function handleEdge(v: number): string | null {
  if (Number.isNaN(v)) return '—';
  if (v === Infinity) return '∞';
  if (v === -Infinity) return '−∞';
  return null;
}

/**
 * Compact notation for large magnitudes (K / M / B / T) with adaptive
 * precision for values below 1. Default decimal count for the compact
 * suffixes can be overridden via `opts.decimals`.
 */
export function formatCompact(v: number, opts?: { decimals?: number }): string {
  const edge = handleEdge(v);
  if (edge !== null) return edge;

  const abs = Math.abs(v);
  const d = opts?.decimals ?? 2;

  // Pick the largest unit first, but fall through if rounding tips the
  // divided value past 1000 — otherwise 999_999 renders as "1000.00K"
  // instead of "1.00M". Repeat until rounding is stable in the current bucket.
  const scale = (v: number, divisor: number, suffix: string) => {
    const scaled = v / divisor;
    const rounded = Number.parseFloat(scaled.toFixed(d));
    if (Math.abs(rounded) >= 1000) return null;
    return `${scaled.toFixed(d)}${suffix}`;
  };

  if (abs >= 1e15) return v.toExponential(2);
  if (abs >= 1e12) return scale(v, 1e12, 'T') ?? v.toExponential(2);
  if (abs >= 1e9) return scale(v, 1e9, 'B') ?? `${(v / 1e12).toFixed(d)}T`;
  if (abs >= 1e6) return scale(v, 1e6, 'M') ?? `${(v / 1e9).toFixed(d)}B`;
  if (abs >= 1e3) return scale(v, 1e3, 'K') ?? `${(v / 1e6).toFixed(d)}M`;
  if (abs < 1) return formatSmall(v);
  if (abs < 100) return v.toFixed(2);
  return v.toFixed(0);
}

/**
 * Full-precision display that adapts decimal count to the value's magnitude.
 * No K/M/B compression — callers wanting a short label should use
 * `formatCompact` instead.
 */
export function formatPriceAdaptive(v: number): string {
  const edge = handleEdge(v);
  if (edge !== null) return edge;

  const abs = Math.abs(v);
  if (abs === 0) return '0';
  if (abs < 1) return formatSmall(v);
  if (abs < 100) return v.toFixed(4);
  // Beyond ~10M the raw digit string grows past readability — hand off to
  // formatCompact so 5.4e12 → "5.40T" instead of "5400000000000". Tooltips
  // and OHLC cells use this formatter.
  if (abs >= 1e7) return formatCompact(v);
  if (abs < 10_000) return v.toFixed(2);
  return v.toFixed(0);
}

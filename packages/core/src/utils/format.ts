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

const SUBSCRIPT_DIGITS = '₀₁₂₃₄₅₆₇₈₉';
const SUPERSCRIPT_DIGITS = '⁰¹²³⁴⁵⁶⁷⁸⁹';

function toScript(n: number, glyphs: string): string {
  return String(n).replace(/\d/g, (d) => glyphs[Number(d)]);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface CollapseZerosOptions {
  /** Shortest run of zeros after the decimal point that collapses. Default `4`. */
  from?: number;
  /** Decimal separator of the input. Default `'.'`. */
  decimal?: string;
}

/**
 * Collapses the leading zeros of a fraction into a subscript count:
 * `0.000008123` → `0.0₅8123`. Shorter runs and every other string pass
 * through unchanged, so it can wrap any formatter's output.
 */
export function collapseZeros(text: string, opts: CollapseZerosOptions = {}): string {
  const { from = 4, decimal = '.' } = opts;
  const pattern = new RegExp(`(^|[^0-9])0${escapeRegExp(decimal)}(0{${from},})(?=[1-9])`);

  return text.replace(pattern, (_, prefix: string, zeros: string) => {
    return `${prefix}0${decimal}0${toScript(zeros.length, SUBSCRIPT_DIGITS)}`;
  });
}

export interface SignificantFormatOptions {
  /** Significant digits to keep. Default `4`. */
  digits?: number;
  /** Zeros after the decimal point from which the run collapses into a count: `0.0₅8123`. Default `4`. */
  collapseZeros?: number;
  /** Magnitude from which values compact into K / M / B / T: `1.235B`. Default `1e6`. */
  compactFrom?: number;
  /**
   * Drop trailing zeros: `0.0₄1`, `1.2B`. Pass `false` for a live value, so
   * its width holds while it moves: `0.0₄1000`, `1.200B`. The grouped range
   * between 1 and `compactFrom` keeps up to three decimals either way.
   * Default `true`.
   */
  trimZeros?: boolean;
}

interface Notation {
  digits: number;
  collapseFrom: number;
  trim: boolean;
}

const COMPACT_UNITS: ReadonlyArray<readonly [number, string]> = [
  [1e12, 'T'],
  [1e9, 'B'],
  [1e6, 'M'],
  [1e3, 'K'],
];

const MID_RANGE = new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 });

function trimZeros(fixed: string): string {
  return fixed.includes('.') ? fixed.replace(/\.?0+$/, '') : fixed;
}

/** `x` (> 0) with `digits` significant digits, re-rounded when rounding adds an integer digit (9.9996 → 10.00). */
function toSignificant(x: number, digits: number): string {
  const decimals = (n: number) => Math.max(0, digits - Math.floor(Math.log10(n)) - 1);
  const rounded = Number(x.toFixed(decimals(x)));

  return rounded.toFixed(decimals(rounded));
}

function formatScientific(abs: number, notation: Notation): string {
  const [mantissa, exponent] = abs.toExponential(notation.digits - 1).split('e');
  const power = Number(exponent);
  const powerText = toScript(Math.abs(power), SUPERSCRIPT_DIGITS);
  const shown = notation.trim ? trimZeros(mantissa) : mantissa;

  return `${shown}×10${power < 0 ? '⁻' : ''}${powerText}`;
}

function formatCompactUnit(abs: number, notation: Notation): string {
  const shown = (text: string) => (notation.trim ? trimZeros(text) : text);

  for (let i = 0; i < COMPACT_UNITS.length; i++) {
    const [unit, suffix] = COMPACT_UNITS[i];
    if (abs < unit) continue;

    const text = toSignificant(abs / unit, notation.digits);
    if (Number(text) < 1000) return `${shown(text)}${suffix}`;

    // Rounding tipped the value into the next unit: 999.95M is 1B, not 1000M.
    // Divide the rounded text, not `abs`: 0.99995B would round down again.
    if (i === 0) break;

    return `${shown(toSignificant(Number(text) / 1000, notation.digits))}${COMPACT_UNITS[i - 1][1]}`;
  }

  return formatScientific(abs, notation);
}

function formatFraction(abs: number, notation: Notation): string {
  const [mantissa, exponent] = abs.toExponential(notation.digits - 1).split('e');
  const zeros = -Number(exponent) - 1;
  const significant = (notation.trim ? trimZeros(mantissa) : mantissa).replace('.', '');

  if (zeros >= notation.collapseFrom) return `0.0${toScript(zeros, SUBSCRIPT_DIGITS)}${significant}`;

  return `0.${'0'.repeat(zeros)}${significant}`;
}

/**
 * Keeps the digits that carry the value and drops the ones that only place
 * it: leading zeros collapse into a subscript count (`0.0₅8123`), large
 * values take a K / M / B / T suffix (`1.235B`), and values past the
 * trillions use a superscript power (`5.4×10¹⁵`). Between 1 and
 * `compactFrom` the output is a grouped number with up to three decimals
 * (`68,432.17`). The result is a plain string, so it works anywhere a
 * formatter does.
 */
export function formatSignificant(v: number, opts: SignificantFormatOptions = {}): string {
  const edge = handleEdge(v);
  if (edge !== null) return edge;
  if (v === 0) return '0';

  const notation: Notation = {
    digits: Math.min(21, Math.max(1, Math.round(opts.digits ?? 4))),
    collapseFrom: opts.collapseZeros ?? 4,
    trim: opts.trimZeros ?? true,
  };
  const compactFrom = opts.compactFrom ?? 1e6;
  const sign = v < 0 ? '-' : '';
  const abs = Math.abs(v);

  // The branch follows the rounded value: 0.99996 prints as 1, 999,999.9996 as 1M.
  const roundedFraction = Number(abs.toPrecision(notation.digits));
  if (roundedFraction < 1) return sign + formatFraction(abs, notation);

  // No suffix exists below a thousand, so a lower `compactFrom` starts there.
  const roundedMid = Math.round(abs * 1000) / 1000;
  if (roundedMid < Math.max(compactFrom, 1e3)) return sign + MID_RANGE.format(Math.max(roundedMid, 1));

  return sign + formatCompactUnit(abs, notation);
}

/**
 * Default `Tooltip` / `InfoBar` formatter: compact volume, and prices with
 * fixed digits so a live row keeps its width. Below 1 the leading zeros
 * collapse (`0.0₅8120`); from 1 up it matches {@link formatPriceAdaptive}.
 */
export function formatTooltipValue(v: number, field: TooltipField): string {
  if (field === 'volume') return formatCompact(v);
  if (Math.abs(v) < 1) return formatSignificant(v, { trimZeros: false });

  return formatPriceAdaptive(v);
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

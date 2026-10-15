import type { ScaleTickArgs, YScaleTransform } from '../types';
import { formatCompact } from '../utils/format';

/** Slack for float drift when a tick sits exactly on a domain bound. */
const LOG_EPSILON = 1e-9;

export interface LogScaleOptions {
  /**
   * Base whose powers carry the ticks. The mapping itself is the same for
   * every base — only tick placement changes. Default: 10.
   */
  base?: number;
}

/** One transform per base, so an inline `logScale()` in a render stays the same scale. */
const byBase = new Map<number, YScaleTransform>();

/**
 * Logarithmic Y scale for `axis.y.scale`: each power of the base gets the same
 * height. Ticks sit on powers of the base, thinned when they crowd and — for
 * base 10 — with 2× / 5× steps when a decade has room; a range too narrow to
 * catch a power falls back to linear ticks. Values ≤ 0 have no position.
 *
 * Tree-shakeable: charts that never call it don't ship the log code.
 */
export function logScale(options: LogScaleOptions = {}): YScaleTransform {
  const base = options.base ?? 10;
  if (!Number.isFinite(base) || base <= 0 || base === 1) {
    throw new Error(`[wick-charts] logScale: base must be a positive number other than 1, got ${base}.`);
  }

  const cached = byBase.get(base);
  if (cached) return cached;

  const transform = createLogScale(base);
  byBase.set(base, transform);

  return transform;
}

function createLogScale(base: number): YScaleTransform {
  const lnBase = Math.log(base);
  const forward = base === 10 ? Math.log10 : base === 2 ? Math.log2 : (value: number) => Math.log(value) / lnBase;
  // A decade has room for 2× and 5× steps; other bases tick on powers only.
  const mantissas = base === 10 ? [1, 2, 5] : [1];

  return {
    forward,
    inverse: (scaled) => base ** scaled,
    isPlottable: (value) => value > 0,
    ticks: (args) => closerToTarget(args, powerTicks({ ...args, forward, base, mantissas })),
    format: (value) => trimFractionZeros(formatCompact(value)),
  };
}

/**
 * Powers, unless the linear ticks land clearly closer to the label target — a
 * narrow range catches too few powers. The margin favors powers so a range
 * near the tie doesn't flip the whole label set on every update.
 */
function closerToTarget(args: ScaleTickArgs, powers: number[]): readonly number[] {
  const { linear, labelCount, height, minSpacing } = args;
  if (linear.length < 2) return powers;
  if (powers.length < 2) return linear;

  const target = labelCount ?? Math.max(2, Math.floor(height / minSpacing));
  const powersMiss = Math.abs(powers.length - target);
  const linearMiss = Math.abs(linear.length - target);

  return linearMiss + 1 < powersMiss ? linear : powers;
}

/**
 * Ticks on powers of `base` inside `[min, max]`. Powers too dense for
 * `minSpacing` (or `labelCount`) are thinned to every 2nd / 5th / 10th one; a
 * power tall enough for the tightest mantissa gap gains the extra mantissas.
 */
function powerTicks(
  args: ScaleTickArgs & { forward: (value: number) => number; base: number; mantissas: readonly number[] },
): number[] {
  const { min, max, height, minSpacing, labelCount, forward, base, mantissas } = args;

  const lo = forward(min);
  const hi = forward(max);
  const pxPerPower = height / (hi - lo);

  const step = powerStep({ lo, hi, pxPerPower, minSpacing, labelCount, base });
  if (step > 1) return steppedPowers({ lo, hi, step, base });

  const powers = mantissaTicks({ lo, hi, base, mantissas: [1], forward });
  if (mantissas.length === 1) return powers;

  // Tightest gap in the set: 1 → 2 (and 5 → 10) in log units of the base.
  const tightestGap = forward(mantissas[1]) - forward(mantissas[0]);
  if (pxPerPower * tightestGap < minSpacing) return powers;

  const subdivided = mantissaTicks({ lo, hi, base, mantissas, forward });
  const overHint = labelCount !== null && subdivided.length > labelCount;

  return overHint ? powers : subdivided;
}

/** Smallest {1,2,5}×10^k power step whose ticks clear `minSpacing` and fit `labelCount`. */
function powerStep(args: {
  lo: number;
  hi: number;
  pxPerPower: number;
  minSpacing: number;
  labelCount: number | null;
  base: number;
}): number {
  const { lo, hi, pxPerPower, minSpacing, labelCount, base } = args;

  let step = 1;
  // Past 1e6 powers the axis spans more than a double can hold anyway.
  while (step < 1e6) {
    const spaced = step * pxPerPower >= minSpacing;
    const withinHint = labelCount === null || steppedPowers({ lo, hi, step, base }).length <= labelCount;
    if (spaced && withinHint) return step;

    step = nextNiceStep(step);
  }

  return step;
}

/** 1 → 2 → 5 → 10 → 20 → … */
function nextNiceStep(step: number): number {
  const mantissa = step / 10 ** Math.floor(Math.log10(step));

  return mantissa < 2 ? step * 2 : mantissa < 5 ? step * 2.5 : step * 2;
}

function steppedPowers(args: { lo: number; hi: number; step: number; base: number }): number[] {
  const { lo, hi, step, base } = args;
  const first = Math.ceil(lo / step - LOG_EPSILON);
  const last = Math.floor(hi / step + LOG_EPSILON);

  const ticks: number[] = [];
  for (let k = first; k <= last; k++) {
    ticks.push(scaleByPower(1, base, k * step));
  }

  return ticks;
}

function mantissaTicks(args: {
  lo: number;
  hi: number;
  base: number;
  mantissas: readonly number[];
  forward: (value: number) => number;
}): number[] {
  const { lo, hi, base, mantissas, forward } = args;
  const first = Math.floor(lo);
  const last = Math.floor(hi + LOG_EPSILON);

  const ticks: number[] = [];
  for (let exponent = first; exponent <= last; exponent++) {
    for (const mantissa of mantissas) {
      const value = scaleByPower(mantissa, base, exponent);
      const position = forward(value);
      if (position < lo - LOG_EPSILON || position > hi + LOG_EPSILON) continue;

      ticks.push(value);
    }
  }

  return ticks;
}

/** `mantissa × base^exponent`, dividing for negative exponents so `2e-7` comes out exact. */
function scaleByPower(mantissa: number, base: number, exponent: number): number {
  if (exponent >= 0) return mantissa * base ** exponent;

  return mantissa / base ** -exponent;
}

/** `"1.00K"` → `"1K"`, `"2.50M"` → `"2.5M"`, `"20.00"` → `"20"`. */
function trimFractionZeros(label: string): string {
  return label.replace(/(\.\d*?)0+([KMBT]?)$/, '$1$2').replace(/\.([KMBT]?)$/, '$1');
}

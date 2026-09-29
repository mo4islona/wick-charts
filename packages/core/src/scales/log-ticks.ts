/**
 * Power-of-ten tick placement for the log Y scale. Pure — `YScale` decides
 * whether these beat plain linear ticks on a narrow range and caches the result.
 */

/** Smallest log10 gap inside a {1, 2, 5} decade: 1→2 and 5→10. */
const MANTISSA_125_GAP = Math.log10(2);

/** Slack for float drift when a tick sits exactly on a domain bound. */
const LOG_EPSILON = 1e-9;

export interface LogTickArgs {
  /** Lower value bound — must be positive. */
  min: number;
  max: number;
  /** Plot height in CSS pixels. */
  height: number;
  /** Minimum pixel gap between adjacent labels. */
  minSpacing: number;
  /** Desired label count, or `null` to fill the height at `minSpacing`. */
  labelCount: number | null;
}

/**
 * Ticks on powers of ten inside `[min, max]`. Decades too dense for
 * `minSpacing` (or for `labelCount`) are thinned to every 2nd / 5th / 10th
 * power; a decade tall enough for three labels gains the 2× and 5× steps.
 * Returns `[]` for a non-positive or empty domain.
 */
export function logDecadeTicks(args: LogTickArgs): number[] {
  const { min, max, height, minSpacing, labelCount } = args;
  if (!(min > 0) || !(max > min) || !(height > 0)) return [];

  const lo = Math.log10(min);
  const hi = Math.log10(max);
  const pxPerDecade = height / (hi - lo);

  const step = decadeStep({ lo, hi, pxPerDecade, minSpacing, labelCount });
  if (step > 1) return steppedDecades({ lo, hi, step });

  const powers = mantissaTicks({ lo, hi, mantissas: [1] });
  if (pxPerDecade * MANTISSA_125_GAP < minSpacing) return powers;

  const subdivided = mantissaTicks({ lo, hi, mantissas: [1, 2, 5] });
  const overHint = labelCount !== null && subdivided.length > labelCount;

  return overHint ? powers : subdivided;
}

/** Smallest {1,2,5}×10^k decade step whose ticks clear `minSpacing` and fit `labelCount`. */
function decadeStep(args: {
  lo: number;
  hi: number;
  pxPerDecade: number;
  minSpacing: number;
  labelCount: number | null;
}): number {
  const { lo, hi, pxPerDecade, minSpacing, labelCount } = args;

  let step = 1;
  // Past 1e6 decades the axis spans more than a double can hold anyway.
  while (step < 1e6) {
    const spaced = step * pxPerDecade >= minSpacing;
    const withinHint = labelCount === null || countStepped({ lo, hi, step }) <= labelCount;
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

function countStepped(args: { lo: number; hi: number; step: number }): number {
  const { lo, hi, step } = args;
  const first = Math.ceil(lo / step - LOG_EPSILON);
  const last = Math.floor(hi / step + LOG_EPSILON);

  return Math.max(0, last - first + 1);
}

function steppedDecades(args: { lo: number; hi: number; step: number }): number[] {
  const { lo, hi, step } = args;
  const first = Math.ceil(lo / step - LOG_EPSILON);
  const last = Math.floor(hi / step + LOG_EPSILON);

  const ticks: number[] = [];
  for (let k = first; k <= last; k++) {
    ticks.push(scaleByPowerOfTen(1, k * step));
  }

  return ticks;
}

function mantissaTicks(args: { lo: number; hi: number; mantissas: readonly number[] }): number[] {
  const { lo, hi, mantissas } = args;
  const first = Math.floor(lo);
  const last = Math.floor(hi + LOG_EPSILON);

  const ticks: number[] = [];
  for (let decade = first; decade <= last; decade++) {
    for (const mantissa of mantissas) {
      const value = scaleByPowerOfTen(mantissa, decade);
      const position = Math.log10(value);
      if (position < lo - LOG_EPSILON || position > hi + LOG_EPSILON) continue;

      ticks.push(value);
    }
  }

  return ticks;
}

/** `mantissa × 10^exponent`, dividing for negative exponents so `2e-7` comes out exact. */
function scaleByPowerOfTen(mantissa: number, exponent: number): number {
  if (exponent >= 0) return mantissa * 10 ** exponent;

  return mantissa / 10 ** -exponent;
}

/**
 * Data and config a non-linear Y scale can't render, surfaced to the
 * integrator: a hard error for percent stacking, dev-mode warnings for the rest.
 */

import type { YAxisConfig } from '../types';

/**
 * Throw when a percent-stacked series meets a Y scale with no position for 0 —
 * the 0–100% axis starts there.
 */
export function assertStackingFitsScale(args: {
  seriesId: string;
  stacking: unknown;
  isPlottable: (value: number) => boolean;
}): void {
  if (args.stacking !== 'percent' || args.isPlottable(0)) return;

  throw new Error(
    `[wick-charts] Series '${args.seriesId}' uses stacking: 'percent', which this Y scale can't show — ` +
      'a 0–100% axis starts at 0, and the scale has no position for 0. Use a linear axis, ' +
      "or stacking: 'normal' / 'off'.",
  );
}

/** Dev-only: a fixed `min` / `max` the scale can't place is ignored in favor of `'auto'`. */
export function warnUnplottableBounds(args: {
  y: YAxisConfig | undefined;
  isPlottable: (value: number) => boolean;
  /** Option path of the config in the message. Default: `axis.y`. */
  path?: string;
}): void {
  if (process.env.NODE_ENV === 'production') return;

  const { y, isPlottable, path = 'axis.y' } = args;
  for (const side of ['min', 'max'] as const) {
    const bound = y?.[side];
    if (typeof bound !== 'number' || isPlottable(bound)) continue;

    console.warn(
      `[wick-charts] ${path}.${side} is ${bound}, which the Y scale can't place — ` +
        "falling back to 'auto'. Use a bound inside the scale's domain.",
    );
  }
}

/** Dev-only: data in view has values the Y scale skips. */
export function warnUnplottableValues(args: { seriesId: string; value: number }): void {
  if (process.env.NODE_ENV === 'production') return;

  console.warn(
    `[wick-charts] Series '${args.seriesId}' has values in view the Y scale can't place (e.g. ${args.value}; ` +
      'a log axis has no position for values ≤ 0). They are skipped — gaps in a line, no bar or candle. ' +
      'Filter or offset the data, or use a linear axis.',
  );
}

/** Dev-only: a series names a scale `scales` doesn't define. */
export function warnUnknownScale(args: { seriesId: string; scaleId: string }): void {
  if (process.env.NODE_ENV === 'production') return;

  console.warn(
    `[wick-charts] Series '${args.seriesId}' uses scale '${args.scaleId}', which \`scales\` doesn't define — ` +
      'it maps through the default Y scale.',
  );
}

/** Dev-only: a visible named scale asks for a side whose axis column is taken. */
export function warnScaleSideTaken(args: { scaleId: string; side: string }): void {
  if (process.env.NODE_ENV === 'production') return;

  console.warn(
    `[wick-charts] Scale '${args.scaleId}' asks for the ${args.side} axis column, which another Y axis already holds — ` +
      'it renders as an overlay scale with no column. One axis column fits on each side.',
  );
}

/** Dev-only: a percent-stacked series on a named scale with no position for 0. */
export function warnStackingOffScale(args: { seriesId: string }): void {
  if (process.env.NODE_ENV === 'production') return;

  console.warn(
    `[wick-charts] Series '${args.seriesId}' uses stacking: 'percent' on a Y scale that can't place 0 — ` +
      "a 0–100% axis starts at 0. Put it on a linear scale, or use stacking: 'normal' / 'off'.",
  );
}

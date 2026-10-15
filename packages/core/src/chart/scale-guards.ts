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
}): void {
  if (process.env.NODE_ENV === 'production') return;

  const { y, isPlottable } = args;
  for (const side of ['min', 'max'] as const) {
    const bound = y?.[side];
    if (typeof bound !== 'number' || isPlottable(bound)) continue;

    console.warn(
      `[wick-charts] axis.y.${side} is ${bound}, which the Y scale can't place — ` +
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

/**
 * Misconfigurations a log Y scale can't render, surfaced to the integrator:
 * a hard error for percent stacking, dev-mode warnings for the rest.
 */

import type { YAxisConfig } from '../types';

/**
 * Throw when a percent-stacked series meets a log Y scale — its 0–100% axis
 * starts at 0, which a log axis has no position for.
 */
export function assertLogStacking(args: { seriesId: string; stacking: unknown }): void {
  if (args.stacking !== 'percent') return;

  throw new Error(
    `[wick-charts] Series '${args.seriesId}' uses stacking: 'percent', which a log Y scale can't show — ` +
      "a 0–100% axis starts at 0, and a log axis has no zero. Use axis.y.type: 'linear', " +
      "or stacking: 'normal' / 'off'.",
  );
}

/** Dev-only: a fixed `min` / `max` ≤ 0 on a log axis is ignored in favor of `'auto'`. */
export function warnNonPositiveBounds(y: YAxisConfig | undefined): void {
  if (process.env.NODE_ENV === 'production') return;
  if (y?.type !== 'log') return;

  for (const side of ['min', 'max'] as const) {
    const bound = y[side];
    if (typeof bound !== 'number' || bound > 0) continue;

    console.warn(
      `[wick-charts] axis.y.${side} is ${bound}, which a log Y scale can't place — ` +
        "falling back to 'auto'. Use a positive bound or a linear axis.",
    );
  }
}

/** Dev-only: data in view has values a log axis skips. */
export function warnNonPositiveValues(args: { seriesId: string; min: number }): void {
  if (process.env.NODE_ENV === 'production') return;

  console.warn(
    `[wick-charts] Series '${args.seriesId}' has values ≤ 0 in view (min ${args.min}) on a log Y scale. ` +
      'A log axis has no position for them, so they are skipped — gaps in a line, no bar or candle. ' +
      'Filter or offset the data, or use a linear axis.',
  );
}

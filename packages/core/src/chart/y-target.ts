/**
 * Y-bound resolution. Pulled out of ChartInstance because the math is pure
 * series-store reads + axis-bound interpretation — no chart state beyond
 * what the caller passes in.
 *
 * Two stages:
 *   1. {@link computeTargetYRange} sweeps visible series and returns the
 *      raw [min, max] of in-window data.
 *   2. {@link resolveBound} interprets an `AxisBound` (number / 'auto' /
 *      function / percentage string) against that raw range to produce the
 *      final per-side bound.
 *
 * The chart's `#computeYTarget` wires both stages together.
 */

import type { SeriesRenderer } from '../series/types';
import type { AxisBound, XRange } from '../types';

export interface YTargetSeries {
  readonly renderer: SeriesRenderer;
  readonly visible: boolean;
}

/**
 * Sample data inside `targetVisible` and return the unbounded [min, max] of
 * visible series, or `null` when nothing is in view. Bounds are NOT applied
 * here — the caller composes them via {@link resolveBound}.
 *
 * When `allValues` is non-null, individual sampled values are pushed into
 * it so function- / percentage-style bounds can reference the full
 * distribution (otherwise only min/max are visited).
 */
export function computeTargetYRange(
  targetVisible: XRange,
  series: readonly YTargetSeries[],
  allValues: number[] | null,
): { min: number; max: number } | null {
  let min = Infinity;
  let max = -Infinity;

  // Single path: every time-series renderer answers `getValueRange` directly
  // (stacked totals, raw min/max, or candle high/low). Pie has no Y range.
  // `allValues` now receives `[min, max]` per series rather than every sample
  // — function-style bounds see the range, not the full distribution (this
  // already held for multi-layer; see INTERNAL_REFACTOR.md).
  for (const entry of series) {
    if (!entry.visible) continue;
    if (entry.renderer.kind === 'pie') continue;

    const r = entry.renderer.getValueRange(targetVisible.from, targetVisible.to);
    if (!r) continue;

    if (r.max > max) max = r.max;
    if (r.min < min) min = r.min;
    allValues?.push(r.min, r.max);
  }

  if (min === Infinity || max === -Infinity) return null;

  return { min, max };
}

/** Resolve an {@link AxisBound} to a concrete numeric value. */
export function resolveBound(
  bound: AxisBound | undefined,
  autoValue: number,
  otherValue: number,
  values: number[],
  side: 'min' | 'max',
): number {
  if (bound === undefined || bound === 'auto') return autoValue;
  if (typeof bound === 'number') return bound;
  if (typeof bound === 'function') return bound(values);

  // Parse percentage string like "+10%", "-5%".
  const match = String(bound).match(/^([+-]?)\s*(\d+(?:\.\d+)?)\s*%$/);
  if (match) {
    const sign = match[1] === '-' ? -1 : 1;
    const pct = parseFloat(match[2]) / 100;
    const dataRange = Math.abs(otherValue - autoValue) || Math.abs(autoValue) || 1;

    return autoValue + sign * pct * dataRange * (side === 'max' ? 1 : -1);
  }

  return autoValue;
}

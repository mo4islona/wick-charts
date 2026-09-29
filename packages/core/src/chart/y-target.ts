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

import { type SeriesRenderer, isTimeSeriesRenderer } from '../series/types';
import type { AxisBound, XRange, YRange, YScaleType } from '../types';

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
export function computeTargetYRange(args: {
  targetVisible: XRange;
  series: readonly YTargetSeries[];
  allValues: number[] | null;
  /** Leave out values ≤ 0 (log Y scale). */
  positiveOnly?: boolean;
}): { min: number; max: number } | null {
  const { targetVisible, series, allValues, positiveOnly = false } = args;
  const rangeOptions = positiveOnly ? { positiveOnly } : undefined;

  let min = Infinity;
  let max = -Infinity;

  // Single path: every time-series renderer answers `getValueRange` directly
  // (stacked totals, raw min/max, or candle high/low). Spatial kinds (pie, heatmap) have no Y range.
  // `allValues` now receives `[min, max]` per series rather than every sample
  // — function-style bounds see the range, not the full distribution (this
  // already held for multi-layer; see INTERNAL_REFACTOR.md).
  for (const entry of series) {
    if (!entry.visible) continue;
    if (!isTimeSeriesRenderer(entry.renderer)) continue;

    const r = entry.renderer.getValueRange(targetVisible.from, targetVisible.to, rangeOptions);
    if (!r) continue;
    // A custom renderer may not honor `positiveOnly` — keep what a log axis can place.
    if (positiveOnly && !(r.max > 0)) continue;

    if (r.max > max) max = r.max;
    if (r.min < min && (!positiveOnly || r.min > 0)) min = r.min;
    allValues?.push(r.min, r.max);
  }

  if (max === -Infinity) return null;
  // Only non-compliant renderers contributed: span one decade below their max.
  if (min === Infinity) min = max / 10;

  return { min, max };
}

/** User-pinned Y bounds, straight from `axis.y`. */
export interface YBounds {
  min?: AxisBound;
  max?: AxisBound;
}

/**
 * Apply axis bounds to the raw data range and return the Y target in *scale
 * space* — the space the viewport engine animates in, so autoscale easing and
 * sticky-Y contraction run evenly on the axis the user sees. Linear: the
 * resolved bounds as-is. Log: their `log10`.
 *
 * On a log scale a percentage bound (`"+10%"`) pads by a share of the range in
 * log space, and a non-positive fixed or computed bound falls back to auto.
 */
export function resolveYTarget(args: { raw: YRange; bounds: YBounds; allValues: number[]; type: YScaleType }): YRange {
  const { raw, bounds, allValues, type } = args;

  if (type === 'linear') {
    return {
      min: resolveBound(bounds.min, raw.min, raw.max, allValues, 'min'),
      max: resolveBound(bounds.max, raw.max, raw.min, allValues, 'max'),
    };
  }

  const logRaw = { min: Math.log10(raw.min), max: Math.log10(raw.max) };

  return {
    min: resolveLogBound({ bound: bounds.min, raw, logRaw, allValues, side: 'min' }),
    max: resolveLogBound({ bound: bounds.max, raw, logRaw, allValues, side: 'max' }),
  };
}

function resolveLogBound(args: {
  bound: AxisBound | undefined;
  raw: YRange;
  logRaw: YRange;
  allValues: number[];
  side: 'min' | 'max';
}): number {
  const { bound, raw, logRaw, allValues, side } = args;
  const other = side === 'min' ? 'max' : 'min';

  if (typeof bound === 'string' && bound !== 'auto') {
    return resolveBound(bound, logRaw[side], logRaw[other], [], side);
  }

  const value = resolveBound(bound, raw[side], raw[other], allValues, side);
  const placeable = Number.isFinite(value) && value > 0;

  return Math.log10(placeable ? value : raw[side]);
}

/** Map a scale-space range (see {@link resolveYTarget}) back to values. */
export function fromScaleSpace(range: YRange, type: YScaleType): YRange {
  if (type === 'linear') return range;

  return { min: 10 ** range.min, max: 10 ** range.max };
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

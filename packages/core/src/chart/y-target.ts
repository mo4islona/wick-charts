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

import { isPlottableOn } from '../scales/y-scale';
import { type SeriesRenderer, isTimeSeriesRenderer } from '../series/types';
import type { AxisBound, XRange, YRange, YScaleTransform } from '../types';

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
  /** Leave out values the Y scale can't place (≤ 0 on log). */
  plottable?: (value: number) => boolean;
}): { min: number; max: number } | null {
  const { targetVisible, series, allValues, plottable } = args;
  const rangeOptions = plottable ? { plottable } : undefined;

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
    // A custom renderer may not honor `plottable` — keep what the scale can place.
    if (plottable && !plottable(r.max)) continue;

    if (r.max > max) max = r.max;
    if (r.min < min && (!plottable || plottable(r.min))) min = r.min;
    allValues?.push(r.min, r.max);
  }

  if (max === -Infinity) return null;
  // Only renderers that ignored `plottable` contributed — a flat range at their max.
  if (min === Infinity) min = max;

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
 * sticky-Y contraction run evenly on the axis the user sees. Linear
 * (`transform` null): the resolved bounds as-is. Otherwise their `forward`.
 *
 * Under a transform a percentage bound (`"+10%"`) pads by a share of the
 * range in scale space, and a fixed or computed bound the scale can't place
 * falls back to auto.
 */
export function resolveYTarget(args: {
  raw: YRange;
  bounds: YBounds;
  allValues: number[];
  transform: YScaleTransform | null;
}): YRange {
  const { raw, bounds, allValues, transform } = args;

  if (transform === null) {
    return {
      min: resolveBound(bounds.min, raw.min, raw.max, allValues, 'min'),
      max: resolveBound(bounds.max, raw.max, raw.min, allValues, 'max'),
    };
  }

  const scaledRaw = { min: transform.forward(raw.min), max: transform.forward(raw.max) };

  return {
    min: resolveScaledBound({ bound: bounds.min, raw, scaledRaw, allValues, side: 'min', transform }),
    max: resolveScaledBound({ bound: bounds.max, raw, scaledRaw, allValues, side: 'max', transform }),
  };
}

function resolveScaledBound(args: {
  bound: AxisBound | undefined;
  raw: YRange;
  scaledRaw: YRange;
  allValues: number[];
  side: 'min' | 'max';
  transform: YScaleTransform;
}): number {
  const { bound, raw, scaledRaw, allValues, side, transform } = args;
  const other = side === 'min' ? 'max' : 'min';

  if (typeof bound === 'string' && bound !== 'auto') {
    return resolveBound(bound, scaledRaw[side], scaledRaw[other], [], side);
  }

  const value = resolveBound(bound, raw[side], raw[other], allValues, side);
  const placeable = isPlottableOn(transform, value);

  return transform.forward(placeable ? value : raw[side]);
}

/** Map a scale-space range (see {@link resolveYTarget}) back to values. */
export function fromScaleSpace(range: YRange, transform: YScaleTransform | null): YRange {
  if (transform === null) return range;

  return { min: transform.inverse(range.min), max: transform.inverse(range.max) };
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

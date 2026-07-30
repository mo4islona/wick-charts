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
  // (stacked totals, raw min/max, or candle high/low). Spatial kinds (pie, heatmap) have no Y range.
  // `allValues` now receives `[min, max]` per series rather than every sample
  // — function-style bounds see the range, not the full distribution (this
  // already held for multi-layer; see INTERNAL_REFACTOR.md).
  for (const entry of series) {
    if (!entry.visible) continue;
    if (!isTimeSeriesRenderer(entry.renderer)) continue;

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

/** EMA weight for the drift estimate. High enough to pick a fresh trend up
 *  within a couple of ticks, low enough that one outlier doesn't set the rate. */
const DRIFT_ALPHA = 0.4;

/** Arrivals closer together than this are a burst, not a cadence — folding
 *  their gap in would report an enormous rate. */
const MIN_SAMPLE_GAP_MS = 5;

/**
 * Rate at which each Y bound is travelling, in units per second.
 *
 * One measured quantity, used twice, because a trending series defeats a
 * position-only chase in two separate ways:
 *
 * - The target is a *staircase*, not a ramp — it only ever reports where the
 *   data was at the last tick. So the curve must {@link aimAhead}, by the
 *   distance the data covers while the bound is in flight (`rate × settle`).
 *   Velocity matching alone does not fix this; measured on its own it left the
 *   newest point clipped on 64 % of frames at a 1 s cadence.
 * - Cubic Hermite brakes to rest at each segment end, so between ticks the
 *   axis stalls. Handing the curve the rate as {@link RetargetOptions.drift}
 *   makes it arrive still moving at the data's speed.
 *
 * Only expansion is measured. A receding bound is the sticky contract's
 * business, and handing it a drift would race it.
 *
 * The rate is learned from streaming appends only: a zoom or a series toggle
 * moves the raw range too, but by moving the window, not because the data
 * trended.
 */
export class YTrendDrift {
  /** Units per second, `<= 0` — the lower bound only ever drifts downward. */
  #min = 0;
  /** Units per second, `>= 0`. */
  #max = 0;
  /** Consecutive samples that expanded this side. */
  #runMin = 0;
  #runMax = 0;
  #prev: { min: number; max: number; at: number } | null = null;

  observe(raw: { min: number; max: number }, nowMs: number): void {
    const prev = this.#prev;
    if (prev !== null) {
      const gapMs = nowMs - prev.at;
      if (gapMs >= MIN_SAMPLE_GAP_MS) {
        const seconds = gapMs / 1000;
        const rateMin = Math.min(0, (raw.min - prev.min) / seconds);
        const rateMax = Math.max(0, (raw.max - prev.max) / seconds);
        this.#min = DRIFT_ALPHA * rateMin + (1 - DRIFT_ALPHA) * this.#min;
        this.#max = DRIFT_ALPHA * rateMax + (1 - DRIFT_ALPHA) * this.#max;
        this.#runMin = rateMin < 0 ? this.#runMin + 1 : 0;
        this.#runMax = rateMax > 0 ? this.#runMax + 1 : 0;
      }
    }

    this.#prev = { min: raw.min, max: raw.max, at: nowMs };
  }

  /**
   * Rate to hand the curve, zero on a side that isn't currently trending.
   * Gated on the run, not the EMA, for the same reason {@link aimAhead} is.
   */
  get value(): { min: number; max: number } {
    return { min: this.#trending(this.#runMin) ? this.#min : 0, max: this.#trending(this.#runMax) ? this.#max : 0 };
  }

  /**
   * A side leads only while its *current* sample confirms the trend, and only
   * from the second consecutive one.
   *
   * Gating on the EMA alone breaks the invariant that matters most to the
   * eye — an axis that moves while the visible extremes stand still. At a
   * turning point the EMA still carries the old direction, so the bound
   * shoots past the peak *after* the peak and then crawls back for seconds.
   * Requiring two in a row also keeps a lone step from being read as a trend;
   * containment already covers that case without predicting anything.
   */
  #trending(run: number): boolean {
    return run >= 2;
  }

  /**
   * Widen `raw` by the distance the data travels while the bound is in
   * flight, so the curve aims where the extreme is going rather than where
   * the last tick reported it.
   */
  aimAhead(raw: { min: number; max: number }, settleMs: number): { min: number; max: number } {
    const seconds = Math.max(0, settleMs) / 1000;
    const leadMin = this.#trending(this.#runMin) ? this.#min * seconds : 0;
    const leadMax = this.#trending(this.#runMax) ? this.#max * seconds : 0;

    return { min: raw.min + leadMin, max: raw.max + leadMax };
  }

  /** Drop the learned trend — the dataset it was measured against is gone. */
  reset(): void {
    this.#min = 0;
    this.#max = 0;
    this.#runMin = 0;
    this.#runMax = 0;
    this.#prev = null;
  }
}

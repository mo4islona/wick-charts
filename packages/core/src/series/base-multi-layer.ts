import { DEFAULT_ENTER_MS, DEFAULT_SMOOTH_MS, MAX_FRAME_DT_S } from '../animation-constants';
import { TimeSeriesStore } from '../data/store';
import type { TimePoint, TimePointInput } from '../types';
import { smoothToward } from '../utils/math';
import { normalizeTime, normalizeTimePointArray } from '../utils/time';
import { computeEntranceProgress, resolveMs, valueDiffers } from './shared-animation';
import { renderedStackPercentTop, renderedStackTop, sumStack } from './stack-math';
import type { SeriesRenderer } from './types';

/**
 * Shape of the options that {@link BaseMultiLayerSeries} reads directly from
 * its concrete subclass. Each subclass narrows its own options type and
 * returns this projection via {@link BaseMultiLayerSeries.getCommonOptions}.
 */
export interface CommonSeriesOptions {
  colors: string[];
  stacking: 'off' | 'normal' | 'percent';
  entryMs?: number | false;
  smoothMs?: number | false;
}

/** Minimum shape for a per-point entrance animation entry. */
export interface EntryBase {
  startTime: number;
}

/**
 * Abstract base for multi-layer time-series renderers (Bar, Line). Concentrates
 * the bookkeeping that those renderers share in full: multi-store ownership,
 * entrance-animation state, live-value smoothing, tooltip snapshots, stacked
 * totals, and lifecycle. Concrete subclasses supply only their options accessor,
 * entry factory, theming, and the actual drawing primitives.
 */
export abstract class BaseMultiLayerSeries<TData extends TimePoint, TEntry extends EntryBase>
  implements SeriesRenderer
{
  protected readonly stores: TimeSeriesStore<TData>[];
  /** Per-layer smoothed last value (tracks store.last().value under live updates). */
  protected displayedLastValues: Array<number | null>;
  /** Per-layer `time` of the point seeded into {@link displayedLastValues}. */
  protected lastSeededTimes: number[];
  /** Per-layer entrance animations keyed by the point's `time`. */
  protected entries: Array<Map<number, TEntry>>;
  /** Last render timestamp for frame-rate-independent smoothing. */
  protected lastRenderTime = 0;

  constructor(layerCount: number) {
    this.stores = Array.from({ length: layerCount }, () => new TimeSeriesStore<TData>());
    this.displayedLastValues = new Array(layerCount).fill(null);
    this.lastSeededTimes = new Array(layerCount).fill(Number.NaN);
    this.entries = Array.from({ length: layerCount }, () => new Map());
  }

  // --- Subclass hooks -------------------------------------------------------

  /** Return the subset of options that the base class needs to read. */
  protected abstract getCommonOptions(): CommonSeriesOptions;

  /**
   * Build an entrance-animation entry for a newly appended point. Called
   * BEFORE the point is appended to the store, so subclasses can peek the
   * penultimate point via `this.stores[layerIndex].last()`. Return `null` to
   * opt out of animation (e.g. when style is `'none'` or duration is `0`).
   */
  protected abstract createEntry(layerIndex: number, time: number, now: number): TEntry | null;

  // --- SeriesRenderer interface (abstract — subclass provides) --------------

  abstract render(ctx: import('./types').SeriesRenderContext): void;
  abstract applyTheme(theme: import('../theme/types').ChartTheme, prev: import('../theme/types').ChartTheme): void;
  // biome-ignore lint/suspicious/noExplicitAny: each renderer narrows this in its concrete signature
  abstract updateOptions(options: any): void;

  // --- Color accessors ------------------------------------------------------

  getColor(): string {
    return this.getCommonOptions().colors[0];
  }

  getColors(): string[] {
    return this.getCommonOptions().colors;
  }

  // --- Data ingest ----------------------------------------------------------

  setData(data: unknown, layerIndex = 0): void {
    const store = this.stores[layerIndex];
    if (!store) return;

    const normalized = normalizeTimePointArray((data ?? []) as TimePointInput[]) as unknown as TData[];
    store.setData(normalized);
    // Bulk loads don't animate — clear any in-flight entries for this layer.
    this.entries[layerIndex]?.clear();
  }

  appendPoint(point: unknown, layerIndex = 0): void {
    const store = this.stores[layerIndex];
    if (!store) return;

    const p = point as TimePointInput;
    const time = normalizeTime(p.time);

    // Build the entry BEFORE append so `createEntry` can peek penultimate.
    const entry = this.createEntry(layerIndex, time, performance.now());
    store.append({ ...p, time } as unknown as TData);
    if (entry) this.entries[layerIndex]?.set(time, entry);
  }

  updateLastPoint(point: unknown, layerIndex = 0): void {
    const store = this.stores[layerIndex];
    if (!store) return;

    const p = point as TimePointInput;
    store.updateLast({ ...p, time: normalizeTime(p.time) } as unknown as TData);
  }

  // --- Layer model ----------------------------------------------------------

  getLayerCount(): number {
    return this.stores.length;
  }

  setLayerVisible(index: number, visible: boolean): void {
    this.stores[index]?.setVisible(visible);
  }

  isLayerVisible(index: number): boolean {
    return this.stores[index]?.isVisible() ?? true;
  }

  getLayerColors(): string[] {
    return this.getColors();
  }

  // --- Lifecycle ------------------------------------------------------------

  onDataChanged(listener: () => void): () => void {
    for (const s of this.stores) s.on('update', listener);

    return () => {
      for (const s of this.stores) s.off('update', listener);
    };
  }

  dispose(): void {
    for (const s of this.stores) s.removeAllListeners();
    for (const m of this.entries) m.clear();
    this.displayedLastValues = this.displayedLastValues.map(() => null);
    this.lastSeededTimes = this.lastSeededTimes.map(() => Number.NaN);
    this.lastRenderTime = 0;
  }

  /**
   * Drop all in-flight per-point entrance animations across every layer.
   * Displayed-last smoothing is intentionally preserved.
   */
  cancelEntranceAnimations(): void {
    for (const m of this.entries) m.clear();
  }

  /** True while any entrance is active OR any layer's displayed-last hasn't converged. */
  get needsAnimation(): boolean {
    for (const m of this.entries) if (m.size > 0) return true;

    for (let li = 0; li < this.stores.length; li++) {
      const displayed = this.displayedLastValues[li];
      const actualLast = this.stores[li].last();
      if (displayed == null || !actualLast) continue;
      if (this.lastSeededTimes[li] !== actualLast.time) continue;
      if (valueDiffers(displayed, actualLast.value)) return true;
    }

    return false;
  }

  // --- Animation primitives -------------------------------------------------

  /**
   * Advance smoothed last-value per layer. Seeds directly on first render or
   * when the last point's time changes; otherwise exponentially chases the
   * target value. Must run at the top of every render pass (and drawOverlay)
   * so snapshots see fresh state regardless of which pass ticks first.
   */
  protected advanceLiveTracking(now: number): void {
    if (now === this.lastRenderTime) return;

    const dt = this.lastRenderTime ? Math.min(MAX_FRAME_DT_S, (now - this.lastRenderTime) / 1000) : 0;
    this.lastRenderTime = now;

    const smoothMs = resolveMs(this.getCommonOptions().smoothMs, DEFAULT_SMOOTH_MS);
    const rate = smoothMs > 0 ? 1000 / smoothMs : 0;
    for (let li = 0; li < this.stores.length; li++) {
      const actualLast = this.stores[li].last();
      if (!actualLast) {
        this.displayedLastValues[li] = null;
        this.lastSeededTimes[li] = Number.NaN;
        continue;
      }

      const displayed = this.displayedLastValues[li];
      const isNewPoint = this.lastSeededTimes[li] !== actualLast.time;
      if (displayed === null || isNewPoint || rate <= 0) {
        this.displayedLastValues[li] = actualLast.value;
        this.lastSeededTimes[li] = actualLast.time;
        continue;
      }

      this.displayedLastValues[li] = smoothToward(displayed, actualLast.value, rate, dt);
    }
  }

  protected entranceProgress(layerIndex: number, time: number, now: number): number {
    const duration = resolveMs(this.getCommonOptions().entryMs, DEFAULT_ENTER_MS);

    return computeEntranceProgress(this.entries[layerIndex], time, now, duration);
  }

  /** The effective Y-value to render for (layer, time) — substitutes smoothed value for the live last point. */
  protected effectiveValue(layerIndex: number, time: number, rawValue: number): number {
    const displayed = this.displayedLastValues[layerIndex];
    if (displayed == null || this.lastSeededTimes[layerIndex] !== time) return rawValue;

    return displayed;
  }

  // --- Data queries ---------------------------------------------------------

  getLastValue(): number | null {
    for (let i = this.stores.length - 1; i >= 0; i--) {
      const last = this.stores[i].last();
      if (last) return last.value;
    }

    return null;
  }

  getDataAtTime(time: number, interval: number): TData | null {
    return this.stores[0]?.findNearest(time, interval) ?? null;
  }

  getLayerSnapshots(
    time: number,
    interval: number,
  ): { layerIndex: number; time: number; value: number; color: string }[] | null {
    if (this.stores.length <= 1) return null;

    const colors = this.getColors();
    const results: { layerIndex: number; time: number; value: number; color: string }[] = [];
    for (let li = 0; li < this.stores.length; li++) {
      if (!this.stores[li].isVisible()) continue;

      const data = this.stores[li].getVisibleData(time - interval, time + interval);
      if (data.length === 0) continue;

      let closest = data[0];
      let minDist = Math.abs(data[0].time - time);
      // Midpoint tie → later point wins. Matches `TimeSeriesStore.findNearest`
      // so single-layer (getDataAtTime) and multi-layer snapshots agree on
      // the same sample at exactly-between cursor times.
      for (let i = 1; i < data.length; i++) {
        const dist = Math.abs(data[i].time - time);
        if (dist <= minDist) {
          minDist = dist;
          closest = data[i];
        }
      }

      results.push({
        layerIndex: li,
        time: closest.time,
        value: closest.value,
        color: colors[li % colors.length],
      });
    }

    return results.length > 0 ? results : null;
  }

  getStackedLastValue(): { value: number; isLive: boolean } | null {
    if (this.stores.length <= 1) {
      const last = this.stores[0]?.last();

      return last ? { value: last.value, isLive: true } : null;
    }

    // Stacked renderers draw the top edge as the cumulative sum of visible
    // layers at the *last shared time*. Mirrors renderStacked's cumulative
    // construction but evaluated at a single time point.
    let lastTime = -Infinity;
    for (const s of this.stores) {
      if (!s.isVisible()) continue;

      const l = s.last();
      if (l && l.time > lastTime) lastTime = l.time;
    }
    if (lastTime === -Infinity) return null;

    const stacking = this.getCommonOptions().stacking;
    if (stacking === 'off') {
      // Non-stacked multi-layer: there's no single "top" — report the last
      // value of the last visible layer. Callers that want per-layer values
      // should use getLayerLastSnapshots.
      for (let i = this.stores.length - 1; i >= 0; i--) {
        if (!this.stores[i].isVisible()) continue;

        const last = this.stores[i].last();
        if (last) return { value: last.value, isLive: true };
      }

      return null;
    }

    const values: number[] = [];
    for (const s of this.stores) {
      if (!s.isVisible()) continue;

      const l = s.last();
      values.push(l && l.time === lastTime ? l.value : 0);
    }

    const totals = sumStack(values);
    const value = stacking === 'percent' ? renderedStackPercentTop(totals) : renderedStackTop(totals);

    return { value, isLive: true };
  }

  getLayerLastSnapshots(): { layerIndex: number; time: number; value: number; color: string }[] | null {
    if (this.stores.length <= 1) return null;

    const colors = this.getColors();
    const results: { layerIndex: number; time: number; value: number; color: string }[] = [];
    for (let li = 0; li < this.stores.length; li++) {
      if (!this.stores[li].isVisible()) continue;

      const last = this.stores[li].last();
      if (!last) continue;

      results.push({
        layerIndex: li,
        time: last.time,
        value: last.value,
        color: colors[li % colors.length],
      });
    }

    return results.length > 0 ? results : null;
  }

  getTotalLength(): number {
    let total = 0;
    for (const s of this.stores) total += s.length;

    return total;
  }

  getValueRange(from: number, to: number): { min: number; max: number } | null {
    const stacking = this.getCommonOptions().stacking;
    if (stacking === 'percent') {
      return { min: 0, max: 100 };
    }
    if (this.stores.length <= 1) {
      return null; // single store — chart handles it via entry.store
    }

    const layers = this.stores.map((s) => (s.isVisible() ? s.getVisibleData(from, to) : []));

    if (stacking === 'off') {
      // Union of all layers' individual ranges. Skip non-finite values so
      // null / NaN / ±Infinity / undefined don't corrupt the range.
      let min = Infinity;
      let max = -Infinity;
      for (const data of layers) {
        for (const d of data) {
          if (!Number.isFinite(d.value)) continue;
          if (d.value < min) min = d.value;
          if (d.value > max) max = d.value;
        }
      }

      return min < Infinity ? { min, max } : null;
    }

    // Normal stacking: compute stacked totals. Non-finite values are treated
    // as 0 for the stack — don't crash the range because one layer has a gap.
    const timeMap = new Map<number, number[]>();
    for (let li = 0; li < layers.length; li++) {
      for (const d of layers[li]) {
        let arr = timeMap.get(d.time);
        if (!arr) {
          arr = new Array(layers.length).fill(0);
          timeMap.set(d.time, arr);
        }
        arr[li] = Number.isFinite(d.value) ? d.value : 0;
      }
    }

    let min = 0;
    let max = 0;
    for (const values of timeMap.values()) {
      let posSum = 0;
      let negSum = 0;
      for (const v of values) {
        if (v > 0) posSum += v;
        else negSum += v;
      }
      if (posSum > max) max = posSum;
      if (negSum < min) min = negSum;
    }

    return max > min ? { min, max } : null;
  }
}

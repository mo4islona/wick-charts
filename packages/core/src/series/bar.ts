import { DEFAULT_ENTER_MS, DEFAULT_SMOOTH_MS, MAX_FRAME_DT_S } from '../animation-constants';
import { TimeSeriesStore } from '../data/store';
import type { ChartTheme } from '../theme/types';
import type { BarSeriesOptions, LineData, TimePointInput } from '../types';
import { clamp, easeOutCubic, smoothToward } from '../utils/math';
import { normalizeTime, normalizeTimePointArray } from '../utils/time';
import type { SeriesRenderContext, SeriesRenderer } from './types';

const DEFAULT_OPTIONS: BarSeriesOptions = {
  colors: ['#26a69a', '#ef5350'],
  barWidthRatio: 0.6,
  stacking: 'off',
};

/** Resolve an `enterMs` / `smoothMs` option value. `false` collapses to 0 (disabled). */
function resolveMs(value: number | false | undefined, fallback: number): number {
  if (value === false) return 0;
  if (value === undefined) return fallback;

  return value;
}

/** Returns true if the smoothed value is still meaningfully off-target. */
function valueDiffers(displayed: number, target: number): boolean {
  const eps = Math.max(1e-4, Math.abs(target) * 1e-5);
  return Math.abs(displayed - target) > eps;
}

interface BarEntry {
  startTime: number;
}

export class BarRenderer implements SeriesRenderer {
  readonly #stores: TimeSeriesStore<LineData>[];
  private options: BarSeriesOptions;
  /** Per-layer smoothed last value (tracks store.last().value under live updates). */
  private displayedLastValues: Array<number | null>;
  /** Per-layer `time` of the bar seeded into {@link displayedLastValues}. */
  private lastSeededTimes: number[];
  /** Per-layer entrance animations keyed by bar `time`. */
  private entries: Array<Map<number, BarEntry>>;
  /** Last render timestamp for frame-rate-independent smoothing. */
  private lastRenderTime = 0;

  constructor(layerCount: number, options?: Partial<BarSeriesOptions>) {
    this.#stores = Array.from({ length: layerCount }, () => new TimeSeriesStore<LineData>());
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.displayedLastValues = new Array(layerCount).fill(null);
    this.lastSeededTimes = new Array(layerCount).fill(Number.NaN);
    this.entries = Array.from({ length: layerCount }, () => new Map());
  }

  /** For chart compatibility — returns first store */
  get store(): TimeSeriesStore<LineData> {
    return this.#stores[0];
  }

  updateOptions(options: Partial<BarSeriesOptions>): void {
    this.options = { ...this.options, ...options };
  }

  getColor(): string {
    return this.options.colors[0];
  }

  getColors(): string[] {
    return this.options.colors;
  }

  // --- SeriesRenderer interface implementation ------------------------------

  setData(data: unknown, layerIndex = 0): void {
    const store = this.#stores[layerIndex];
    if (!store) return;
    store.setData(normalizeTimePointArray((data ?? []) as TimePointInput[]));
    // Bulk loads don't animate — clear any in-flight entries for this layer.
    this.entries[layerIndex]?.clear();
  }

  appendPoint(point: unknown, layerIndex = 0): void {
    const store = this.#stores[layerIndex];
    if (!store) return;
    const p = point as TimePointInput;
    const time = normalizeTime(p.time);
    store.append({ ...p, time });
    const style = this.options.enterAnimation ?? 'fade-grow';
    const enterMs = resolveMs(this.options.enterMs, DEFAULT_ENTER_MS);
    if (style !== 'none' && enterMs > 0) {
      this.entries[layerIndex]?.set(time, { startTime: performance.now() });
    }
  }

  updateLastPoint(point: unknown, layerIndex = 0): void {
    const store = this.#stores[layerIndex];
    if (!store) return;
    const p = point as TimePointInput;
    store.updateLast({ ...p, time: normalizeTime(p.time) });
  }

  getLayerCount(): number {
    return this.#stores.length;
  }

  setLayerVisible(index: number, visible: boolean): void {
    this.#stores[index]?.setVisible(visible);
  }

  isLayerVisible(index: number): boolean {
    return this.#stores[index]?.isVisible() ?? true;
  }

  getLayerColors(): string[] {
    return this.getColors();
  }

  applyTheme(theme: ChartTheme, _prev: ChartTheme): void {
    this.updateOptions({
      colors: theme.seriesColors.slice(0, this.#stores.length),
    });
  }

  onDataChanged(listener: () => void): () => void {
    for (const s of this.#stores) s.on('update', listener);
    return () => {
      for (const s of this.#stores) s.off('update', listener);
    };
  }

  dispose(): void {
    for (const s of this.#stores) s.removeAllListeners();
    for (const m of this.entries) m.clear();
    this.displayedLastValues = this.displayedLastValues.map(() => null);
    this.lastSeededTimes = this.lastSeededTimes.map(() => Number.NaN);
    this.lastRenderTime = 0;
  }

  /** Drop all in-flight per-bar entrance animations across every layer.
   * Displayed-last smoothing is intentionally preserved. */
  cancelEntranceAnimations(): void {
    for (const m of this.entries) m.clear();
  }

  /** True while any entrance is active OR any layer's displayed-last hasn't converged. */
  get needsAnimation(): boolean {
    for (const m of this.entries) if (m.size > 0) return true;
    for (let li = 0; li < this.#stores.length; li++) {
      const displayed = this.displayedLastValues[li];
      const actualLast = this.#stores[li].last();
      if (displayed == null || !actualLast) continue;
      if (this.lastSeededTimes[li] !== actualLast.time) continue;
      if (valueDiffers(displayed, actualLast.value)) return true;
    }
    return false;
  }

  /**
   * Advance smoothed last-value per layer. Seeds directly on first render or
   * when the last point's time changes (new bar); otherwise exponentially
   * chases the target value.
   */
  private advanceLiveTracking(now: number): void {
    const dt = this.lastRenderTime ? Math.min(MAX_FRAME_DT_S, (now - this.lastRenderTime) / 1000) : 0;
    this.lastRenderTime = now;

    const smoothMs = resolveMs(this.options.smoothMs, DEFAULT_SMOOTH_MS);
    const rate = smoothMs > 0 ? 1000 / smoothMs : 0;
    for (let li = 0; li < this.#stores.length; li++) {
      const actualLast = this.#stores[li].last();
      if (!actualLast) {
        this.displayedLastValues[li] = null;
        this.lastSeededTimes[li] = Number.NaN;
        continue;
      }
      const displayed = this.displayedLastValues[li];
      const isNewBar = this.lastSeededTimes[li] !== actualLast.time;
      if (displayed === null || isNewBar || rate <= 0) {
        this.displayedLastValues[li] = actualLast.value;
        this.lastSeededTimes[li] = actualLast.time;
        continue;
      }
      this.displayedLastValues[li] = smoothToward(displayed, actualLast.value, rate, dt);
    }
  }

  private entranceProgress(layerIndex: number, time: number, now: number): number {
    const m = this.entries[layerIndex];
    const entry = m?.get(time);
    if (!entry) return 1;
    const duration = resolveMs(this.options.enterMs, DEFAULT_ENTER_MS);
    if (duration <= 0) {
      m.delete(time);
      return 1;
    }
    const t = clamp((now - entry.startTime) / duration, 0, 1);
    const progress = easeOutCubic(t);
    if (t >= 1) m.delete(time);
    return progress;
  }

  /**
   * Shape of the per-bar entrance transform. Centralized so the entrance style
   * is a single switch; new styles like 'slide' drop in here without touching
   * each render path.
   */
  private applyBarTransform(
    progress: number,
    baselineY: number,
    topY: number,
    barHeight: number,
    x: number,
    barWidth: number,
  ): { topY: number; barHeight: number; x: number; barWidth: number; alpha: number } {
    const style = this.options.enterAnimation ?? 'fade-grow';
    if (progress >= 1 || style === 'none') {
      return { topY, barHeight, x, barWidth, alpha: 1 };
    }

    let tY = topY;
    let h = barHeight;
    let xx = x;
    let alpha = 1;

    if (style === 'fade' || style === 'fade-grow') alpha = progress;
    if (style === 'grow' || style === 'fade-grow') {
      // Anchor at baseline: bar grows from zeroY upward/downward.
      const scaled = barHeight * progress;
      if (topY < baselineY) {
        // positive bar — top is above baseline; grow downward from baseline.
        tY = baselineY - scaled;
      } else {
        // negative bar — topY is at baseline; grow downward from baseline.
        tY = baselineY;
      }
      h = Math.max(1, scaled);
    }
    if (style === 'slide') {
      // Translate in from the right edge of the bar slot.
      xx = x + (1 - progress) * barWidth;
      alpha = progress;
    }

    return { topY: tY, barHeight: h, x: xx, barWidth, alpha };
  }

  getLastValue(): number | null {
    for (let i = this.#stores.length - 1; i >= 0; i--) {
      const last = this.#stores[i].last();
      if (last) return last.value;
    }
    return null;
  }

  getDataAtTime(time: number, interval: number): LineData | null {
    return this.#stores[0]?.findNearest(time, interval) ?? null;
  }

  getLayerSnapshots(time: number, interval: number): { value: number; color: string }[] | null {
    if (this.#stores.length <= 1) return null;
    const colors = this.options.colors;
    const results: { value: number; color: string }[] = [];
    for (let li = 0; li < this.#stores.length; li++) {
      if (!this.#stores[li].isVisible()) continue;
      const data = this.#stores[li].getVisibleData(time - interval, time + interval);
      if (data.length === 0) continue;
      let closest = data[0];
      let minDist = Math.abs(data[0].time - time);
      for (let i = 1; i < data.length; i++) {
        const dist = Math.abs(data[i].time - time);
        if (dist < minDist) {
          minDist = dist;
          closest = data[i];
        }
      }
      results.push({ value: closest.value, color: colors[li % colors.length] });
    }
    return results.length > 0 ? results : null;
  }

  getTotalLength(): number {
    let total = 0;
    for (const s of this.#stores) total += s.length;
    return total;
  }

  getValueRange(from: number, to: number): { min: number; max: number } | null {
    if (this.options.stacking === 'percent') {
      return { min: 0, max: 100 };
    }
    if (this.#stores.length <= 1) {
      return null; // single store — chart handles it via entry.store
    }
    const layers = this.#stores.map((s) => (s.isVisible() ? s.getVisibleData(from, to) : []));

    if (this.options.stacking === 'off') {
      // Union of all layers' individual ranges
      let min = Infinity;
      let max = -Infinity;
      for (const data of layers) {
        for (const d of data) {
          if (d.value < min) min = d.value;
          if (d.value > max) max = d.value;
        }
      }
      return min < Infinity ? { min, max } : null;
    }

    // For normal stacking, compute stacked totals
    const timeMap = new Map<number, number[]>();
    for (let li = 0; li < layers.length; li++) {
      for (const d of layers[li]) {
        if (!timeMap.has(d.time)) timeMap.set(d.time, new Array(layers.length).fill(0));
        timeMap.get(d.time)![li] = d.value;
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

  render(ctx: SeriesRenderContext): void {
    this.advanceLiveTracking(performance.now());
    switch (this.options.stacking) {
      case 'normal':
        this.renderStacked(ctx, false);
        break;
      case 'percent':
        this.renderStacked(ctx, true);
        break;
      default:
        this.renderOff(ctx);
        break;
    }
  }

  /** Value to actually render for a given layer/time. For the live last bar we use the smoothed value. */
  private effectiveValue(layerIndex: number, time: number, rawValue: number): number {
    const seededTime = this.lastSeededTimes[layerIndex];
    const displayed = this.displayedLastValues[layerIndex];
    if (displayed == null || seededTime !== time) return rawValue;
    return displayed;
  }

  /** Stacking off — each layer drawn independently from zero, overlapping */
  private renderOff(ctx: SeriesRenderContext): void {
    const { scope, timeScale, yScale, dataInterval } = ctx;
    const { context } = scope;
    const range = timeScale.getRange();
    const now = performance.now();

    const barWidth = timeScale.barWidthBitmap(dataInterval);
    const bodyWidth = Math.max(1, Math.round(barWidth * this.options.barWidthRatio) - 2);
    const halfBody = Math.floor(bodyWidth / 2);

    const yRange = yScale.getRange();
    const hasNegative = yRange.min < 0;
    const zeroY = hasNegative ? yScale.valueToBitmapY(0) : scope.bitmapSize.height;

    const isSingleLayer = this.#stores.length === 1;

    if (isSingleLayer) {
      if (!this.#stores[0].isVisible()) return;

      // Single-layer: colors[0] = positive, colors[1] = negative
      const posColor = this.options.colors[0];
      const negColor = this.options.colors.length > 1 ? this.options.colors[1] : posColor;
      const visibleData = this.#stores[0].getVisibleData(range.from, range.to);

      for (const d of visibleData) {
        const value = this.effectiveValue(0, d.time, d.value);
        const progress = this.entranceProgress(0, d.time, now);
        const cx = timeScale.timeToBitmapX(d.time);
        if (value >= 0) {
          const topY = yScale.valueToBitmapY(value);
          const barHeight = Math.max(1, zeroY - topY);
          this.drawAnimatedBar(
            context,
            progress,
            zeroY,
            topY,
            barHeight,
            cx - halfBody,
            bodyWidth,
            value >= 0 ? posColor : negColor,
          );
        } else {
          const bottomY = yScale.valueToBitmapY(value);
          const barHeight = Math.max(1, bottomY - zeroY);
          this.drawAnimatedBar(context, progress, zeroY, zeroY, barHeight, cx - halfBody, bodyWidth, negColor);
        }
      }
    } else {
      // Multi-layer: collect per-time, draw tallest first so shorter bars appear in front
      const layers = this.#stores.map((store) => (store.isVisible() ? store.getVisibleData(range.from, range.to) : []));
      const timeMap = new Map<number, { layer: number; value: number }[]>();
      for (let li = 0; li < layers.length; li++) {
        for (const d of layers[li]) {
          let arr = timeMap.get(d.time);
          if (!arr) {
            arr = [];
            timeMap.set(d.time, arr);
          }
          // Substitute smoothed value for the live last bar of this layer.
          arr.push({ layer: li, value: this.effectiveValue(li, d.time, d.value) });
        }
      }

      for (const [time, entries] of timeMap) {
        // Sort by |value| descending — tallest drawn first (behind)
        entries.sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
        const cx = timeScale.timeToBitmapX(time);

        for (const { layer, value } of entries) {
          const color = this.options.colors[layer % this.options.colors.length];
          const progress = this.entranceProgress(layer, time, now);
          if (value >= 0) {
            const topY = yScale.valueToBitmapY(value);
            const barHeight = Math.max(1, zeroY - topY);
            this.drawAnimatedBar(context, progress, zeroY, topY, barHeight, cx - halfBody, bodyWidth, color);
          } else {
            const bottomY = yScale.valueToBitmapY(value);
            const barHeight = Math.max(1, bottomY - zeroY);
            this.drawAnimatedBar(context, progress, zeroY, zeroY, barHeight, cx - halfBody, bodyWidth, color);
          }
        }
      }
    }

    if (hasNegative) {
      context.strokeStyle = ctx.theme.grid.color;
      context.lineWidth = 1;
      const y = Math.round(zeroY) + 0.5;
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(scope.bitmapSize.width, y);
      context.stroke();
    }
  }

  /** Stacked (normal or percent) rendering */
  private renderStacked(ctx: SeriesRenderContext, percent: boolean): void {
    const { scope, timeScale, yScale, dataInterval } = ctx;
    const { context } = scope;
    const range = timeScale.getRange();
    const now = performance.now();

    const barWidth = timeScale.barWidthBitmap(dataInterval);
    const bodyWidth = Math.max(1, Math.round(barWidth * this.options.barWidthRatio) - 2);
    const halfBody = Math.floor(bodyWidth / 2);

    // Collect all visible data per layer (hidden layers contribute empty data)
    const layers = this.#stores.map((store) => (store.isVisible() ? store.getVisibleData(range.from, range.to) : []));
    if (layers.every((l) => l.length === 0)) return;

    // Build values per time — hidden layers contribute 0. Use effectiveValue so
    // the last bar of each layer smoothly chases updateLastPoint even when
    // rendered as a stacked slice (where the stacked math depends on the
    // per-layer value, not just the geometry of one isolated bar).
    const timeMap = new Map<number, number[]>();
    for (let li = 0; li < layers.length; li++) {
      for (const d of layers[li]) {
        if (!timeMap.has(d.time)) timeMap.set(d.time, new Array(layers.length).fill(0));
        timeMap.get(d.time)![li] = this.#stores[li].isVisible() ? this.effectiveValue(li, d.time, d.value) : 0;
      }
    }

    // Draw layer by layer, bottom to top
    for (let li = 0; li < layers.length; li++) {
      const color = this.options.colors[li % this.options.colors.length];

      for (const [time, values] of timeMap) {
        const raw = values[li];
        if (raw === 0) continue;

        const cx = timeScale.timeToBitmapX(time);

        // Sum of previous layers for stacking offset
        let basePositive = 0;
        let baseNegative = 0;
        for (let prev = 0; prev < li; prev++) {
          const v = values[prev];
          if (v > 0) basePositive += v;
          else baseNegative += v;
        }

        const progress = this.entranceProgress(li, time, now);

        if (percent) {
          // Normalize to 0–100%
          let totalPositive = 0;
          let totalNegative = 0;
          for (const v of values) {
            if (v > 0) totalPositive += v;
            else totalNegative += v;
          }

          if (raw > 0 && totalPositive > 0) {
            const pctBase = (basePositive / totalPositive) * 100;
            const pctTop = ((basePositive + raw) / totalPositive) * 100;
            const topY = yScale.valueToBitmapY(pctTop);
            const bottomY = yScale.valueToBitmapY(pctBase);
            const h = Math.max(1, bottomY - topY);
            this.drawAnimatedBar(context, progress, bottomY, topY, h, cx - halfBody, bodyWidth, color);
          } else if (raw < 0 && totalNegative < 0) {
            const pctBase = (baseNegative / totalNegative) * -100;
            const pctTop = ((baseNegative + raw) / totalNegative) * -100;
            const topY = yScale.valueToBitmapY(pctBase);
            const bottomY = yScale.valueToBitmapY(pctTop);
            const h = Math.max(1, bottomY - topY);
            this.drawAnimatedBar(context, progress, topY, topY, h, cx - halfBody, bodyWidth, color);
          }
        } else {
          if (raw > 0) {
            const topY = yScale.valueToBitmapY(basePositive + raw);
            const bottomY = yScale.valueToBitmapY(basePositive);
            const h = Math.max(1, bottomY - topY);
            this.drawAnimatedBar(context, progress, bottomY, topY, h, cx - halfBody, bodyWidth, color);
          } else {
            const topY = yScale.valueToBitmapY(baseNegative);
            const bottomY = yScale.valueToBitmapY(baseNegative + raw);
            const h = Math.max(1, bottomY - topY);
            this.drawAnimatedBar(context, progress, topY, topY, h, cx - halfBody, bodyWidth, color);
          }
        }
      }
    }
  }

  private fillBar(context: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string): void {
    context.fillStyle = color;
    context.fillRect(x, y, w, h);
  }

  /**
   * Fill a bar with an optional entrance transform applied. When `progress >= 1`
   * this is equivalent to {@link fillBar}. During entrance the transform shapes
   * geometry (grow from baseline, slide in from the right) and/or alpha.
   */
  private drawAnimatedBar(
    context: CanvasRenderingContext2D,
    progress: number,
    baselineY: number,
    topY: number,
    barHeight: number,
    x: number,
    barWidth: number,
    color: string,
  ): void {
    const style = this.options.enterAnimation ?? 'fade-grow';
    if (progress >= 1 || style === 'none') {
      this.fillBar(context, x, topY, barWidth, barHeight, color);
      return;
    }
    const t = this.applyBarTransform(progress, baselineY, topY, barHeight, x, barWidth);
    context.save();
    context.globalAlpha = t.alpha;
    context.fillStyle = color;
    context.fillRect(t.x, t.topY, t.barWidth, t.barHeight);
    context.restore();
  }
}

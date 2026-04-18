import { decimateLineData } from '../data/decimation';
import { TimeSeriesStore } from '../data/store';
import type { ChartTheme } from '../theme/types';
import type { LineSeriesOptions, TimePoint, TimePointInput } from '../types';
import { hexToRgba } from '../utils/color';
import { clamp, easeOutCubic, lerp, smoothToward } from '../utils/math';
import { normalizeTime, normalizeTimePointArray } from '../utils/time';
import type { OverlayRenderContext, SeriesRenderContext, SeriesRenderer } from './types';

const DEFAULT_OPTIONS: LineSeriesOptions = {
  colors: ['#2962FF'],
  lineWidth: 1,
  areaFill: true,
  pulse: true,
  stacking: 'off',
};

const DEFAULT_LIVE_SMOOTH_RATE = 14;
const DEFAULT_APPEND_DURATION_MS = 400;

/** True if the smoothed value is still meaningfully off-target. */
function valueDiffers(displayed: number, target: number): boolean {
  const eps = Math.max(1e-4, Math.abs(target) * 1e-5);
  return Math.abs(displayed - target) > eps;
}

interface LineEntry {
  startTime: number;
  /** Time of the penultimate point at append — used for the grow-in reveal. */
  fromTime: number;
}

export class LineRenderer implements SeriesRenderer {
  readonly #stores: TimeSeriesStore<TimePoint>[];
  private options: LineSeriesOptions;
  private areaGradientCache = new Map<string, { gradient: CanvasGradient; bottomY: number; color: string }>();
  /** Per-layer smoothed last value. */
  private displayedLastValues: Array<number | null>;
  /** Per-layer `time` of the point currently seeded into {@link displayedLastValues}. */
  private lastSeededTimes: number[];
  /** Per-layer entrance animations keyed by the appended point's `time`. */
  private entries: Array<Map<number, LineEntry>>;
  private lastRenderTime = 0;

  constructor(layerCount: number, options?: Partial<LineSeriesOptions>) {
    this.#stores = Array.from({ length: layerCount }, () => new TimeSeriesStore<TimePoint>());
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.displayedLastValues = new Array(layerCount).fill(null);
    this.lastSeededTimes = new Array(layerCount).fill(Number.NaN);
    this.entries = Array.from({ length: layerCount }, () => new Map());
  }

  /** Back-compat: first store. */
  get store(): TimeSeriesStore<TimePoint> {
    return this.#stores[0];
  }

  updateOptions(options: Partial<LineSeriesOptions>): void {
    this.options = { ...this.options, ...options };
  }

  getColor(): string {
    return this.options.colors[0];
  }

  getColors(): string[] {
    return this.options.colors;
  }

  getStacking(): string {
    return this.options.stacking;
  }

  // --- SeriesRenderer interface implementation ------------------------------

  setData(data: unknown, layerIndex = 0): void {
    const store = this.#stores[layerIndex];
    if (!store) return;
    store.setData(normalizeTimePointArray((data ?? []) as TimePointInput[]));
    this.entries[layerIndex]?.clear();
  }

  appendPoint(point: unknown, layerIndex = 0): void {
    const store = this.#stores[layerIndex];
    if (!store) return;
    const p = point as TimePointInput;
    const penultimate = store.last();
    const time = normalizeTime(p.time);
    store.append({ ...p, time });
    if ((this.options.appendAnimation ?? 'grow') !== 'none') {
      this.entries[layerIndex]?.set(time, {
        startTime: performance.now(),
        fromTime: penultimate ? penultimate.time : time,
      });
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

  applyTheme(theme: ChartTheme, prev: ChartTheme): void {
    if (this.#stores.length === 1) {
      // Single-layer: update color only if it matches the previous theme default
      if (this.getColor() === prev.line.color) {
        this.updateOptions({ colors: [theme.line.color] });
      }
    } else {
      this.updateOptions({
        colors: theme.seriesColors.slice(0, this.#stores.length),
      });
    }
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

  /**
   * Advance smoothed last-value per layer and prune completed entrance entries.
   * Must run at the top of every render pass (and drawOverlay) so snapshots see
   * fresh state regardless of which pass is rendering first.
   */
  private advanceLiveTracking(now: number): void {
    if (now === this.lastRenderTime) return;
    const dt = this.lastRenderTime ? Math.min(0.05, (now - this.lastRenderTime) / 1000) : 0;
    this.lastRenderTime = now;

    const rate = this.options.liveSmoothRate ?? DEFAULT_LIVE_SMOOTH_RATE;
    for (let li = 0; li < this.#stores.length; li++) {
      const actualLast = this.#stores[li].last();
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

  /** Drop all in-flight per-point entrance animations across every layer.
   * Displayed-last smoothing is intentionally preserved. */
  cancelEntranceAnimations(): void {
    for (const m of this.entries) m.clear();
  }

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

  private entranceProgress(layerIndex: number, time: number, now: number): number {
    const m = this.entries[layerIndex];
    const entry = m?.get(time);
    if (!entry) return 1;
    const duration = this.options.appendDurationMs ?? DEFAULT_APPEND_DURATION_MS;
    if (duration <= 0) {
      m.delete(time);
      return 1;
    }
    const t = clamp((now - entry.startTime) / duration, 0, 1);
    const progress = easeOutCubic(t);
    if (t >= 1) m.delete(time);
    return progress;
  }

  private peekEntry(layerIndex: number, time: number): LineEntry | undefined {
    return this.entries[layerIndex]?.get(time);
  }

  getLastValue(): number | null {
    for (let i = this.#stores.length - 1; i >= 0; i--) {
      const last = this.#stores[i].last();
      if (last) return last.value;
    }
    return null;
  }

  getDataAtTime(time: number, interval: number): TimePoint | null {
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

  // --- Internal accessors used by Chart for per-layer work -----------------
  // Note: `#stores` is private; exposing limited per-layer queries through the
  // interface above. No `getStores()` accessor is exported — every external
  // need goes through setData/setLayerVisible/getLayerSnapshots/onDataChanged.

  get hasPulse(): boolean {
    return this.options.pulse && this.#stores.some((s) => s.isVisible() && s.length > 0);
  }

  get overlayNeedsAnimation(): boolean {
    return this.hasPulse;
  }

  hasOverlayContentInRange(from: number, to: number): boolean {
    for (let li = 0; li < this.#stores.length; li++) {
      if (!this.#stores[li].isVisible()) continue;
      const last = this.#stores[li].last();
      if (last && last.time >= from && last.time <= to) return true;
    }
    return false;
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

    // Normal stacking: compute stacked totals
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
    if (this.options.stacking === 'off') {
      this.renderOff(ctx);
    } else {
      this.renderStacked(ctx, this.options.stacking === 'percent');
    }
  }

  /** The effective Y-value to render for (layer, time) — substitutes smoothed value for the live last point. */
  private effectiveValue(layerIndex: number, time: number, rawValue: number): number {
    const displayed = this.displayedLastValues[layerIndex];
    if (displayed == null || this.lastSeededTimes[layerIndex] !== time) return rawValue;
    return displayed;
  }

  /**
   * Bitmap coordinates for the trailing endpoint of a layer — i.e. where the
   * last visible point should be drawn *right now*. Accounts for live-tracking
   * smoothing on Y (via {@link effectiveValue}) and the `'grow'` entrance
   * animation, which lerps (X, Y) from the penultimate point to the new point
   * over the entry's duration.
   *
   * Shared between `renderOff` (last `lineTo` of the polyline) and `drawOverlay`
   * (pulse dot) so the pulse glides in sync with the trailing segment instead
   * of teleporting to the raw last.time while the line still unfurls.
   */
  private trailingEndpoint(
    layerIndex: number,
    timeScale: import('../scales/time-scale').TimeScale,
    yScale: import('../scales/y-scale').YScale,
    now: number,
  ): { x: number; y: number } | null {
    const store = this.#stores[layerIndex];
    const last = store.last();
    if (!last) return null;

    const lastRawX = timeScale.timeToBitmapX(last.time);
    const lastRawY = yScale.valueToBitmapY(this.effectiveValue(layerIndex, last.time, last.value));

    const style = this.options.appendAnimation ?? 'grow';
    const entry = this.peekEntry(layerIndex, last.time);
    if (!entry || style !== 'grow') {
      return { x: lastRawX, y: lastRawY };
    }

    const progress = this.entranceProgress(layerIndex, last.time, now);
    if (progress >= 1) {
      return { x: lastRawX, y: lastRawY };
    }

    const all = store.getAll();
    if (all.length < 2) return { x: lastRawX, y: lastRawY };
    const penultimate = all[all.length - 2];
    const penulX = timeScale.timeToBitmapX(penultimate.time);
    const penulY = yScale.valueToBitmapY(penultimate.value);

    return {
      x: lerp(penulX, lastRawX, progress),
      y: lerp(penulY, lastRawY, progress),
    };
  }

  /** Each layer drawn independently */
  private renderOff(ctx: SeriesRenderContext): void {
    const { scope, timeScale, yScale } = ctx;
    const { context } = scope;
    const range = timeScale.getRange();
    const { verticalPixelRatio } = scope;
    const lineWidth = Math.max(1, Math.round(this.options.lineWidth * verticalPixelRatio));
    const now = performance.now();
    const style = this.options.appendAnimation ?? 'grow';

    for (let li = 0; li < this.#stores.length; li++) {
      if (!this.#stores[li].isVisible()) continue;

      let data = this.#stores[li].getVisibleData(range.from, range.to);
      const pixelWidth = scope.mediaSize.width;
      if (data.length > pixelWidth * 2) {
        data = decimateLineData(data, Math.round(pixelWidth * 1.5));
      }
      if (data.length < 2) continue;

      const color = this.options.colors[li % this.options.colors.length];

      // Trailing-segment entrance: the new segment appears to unfurl from the
      // penultimate point to the new one. 'grow' interpolates both axes (via
      // {@link trailingEndpoint}), 'fade' keeps geometry fixed and ramps stroke
      // alpha. Sharing `trailingEndpoint` with the overlay pulse keeps the dot
      // in sync with the line head instead of teleporting during entrance.
      const last = data[data.length - 1];
      const entry = this.peekEntry(li, last.time);
      const progress = this.entranceProgress(li, last.time, now);
      const trailingFade = entry && style === 'fade' && progress < 1;
      const endpoint = this.trailingEndpoint(li, timeScale, yScale, now) ?? {
        x: timeScale.timeToBitmapX(last.time),
        y: yScale.valueToBitmapY(this.effectiveValue(li, last.time, last.value)),
      };
      const trailingX = endpoint.x;
      const trailingY = endpoint.y;

      // Line
      if (trailingFade) {
        context.save();
        context.globalAlpha = progress;
      }
      context.beginPath();
      context.moveTo(timeScale.timeToBitmapX(data[0].time), yScale.valueToBitmapY(data[0].value));
      for (let i = 1; i < data.length - 1; i++) {
        context.lineTo(timeScale.timeToBitmapX(data[i].time), yScale.valueToBitmapY(data[i].value));
      }
      context.lineTo(trailingX, trailingY);
      context.strokeStyle = color;
      context.lineWidth = lineWidth;
      context.lineJoin = 'round';
      context.lineCap = 'round';
      context.stroke();

      // Area fill
      if (this.options.areaFill) {
        const firstX = timeScale.timeToBitmapX(data[0].time);
        const bottomY = scope.bitmapSize.height;
        context.lineTo(trailingX, bottomY);
        context.lineTo(firstX, bottomY);
        context.closePath();
        const cacheKey = String(li);
        const cached = this.areaGradientCache.get(cacheKey);
        let grad: CanvasGradient;
        if (cached && cached.bottomY === bottomY && cached.color === color) {
          grad = cached.gradient;
        } else {
          grad = context.createLinearGradient(0, 0, 0, bottomY);
          grad.addColorStop(0, hexToRgba(color, 0.12));
          grad.addColorStop(1, hexToRgba(color, 0.01));
          this.areaGradientCache.set(cacheKey, { gradient: grad, bottomY, color });
        }
        context.fillStyle = grad;
        context.fill();
      }
      if (trailingFade) context.restore();
    }
  }

  /** Stacked area rendering */
  private renderStacked(ctx: SeriesRenderContext, percent: boolean): void {
    const { scope, timeScale, yScale } = ctx;
    const { context } = scope;
    const range = timeScale.getRange();
    const { verticalPixelRatio } = scope;
    const lineWidth = Math.max(1, Math.round(this.options.lineWidth * verticalPixelRatio));

    // Collect per-layer data
    const pixelWidth = scope.mediaSize.width;
    const layers = this.#stores.map((s) => {
      let data = s.getVisibleData(range.from, range.to);
      if (data.length > pixelWidth * 2) {
        data = decimateLineData(data, Math.round(pixelWidth * 1.5));
      }
      return data;
    });
    // Get all unique times, sorted
    const timeSet = new Set<number>();
    for (const layer of layers) {
      for (const d of layer) timeSet.add(d.time);
    }
    const times = Array.from(timeSet).sort((a, b) => a - b);
    if (times.length < 2) return;

    // Build value maps for fast lookup. Use effectiveValue so the last point
    // of each layer smoothly chases updateLastPoint even in stacked mode —
    // otherwise the stacked head would jump on every live tick.
    const valueMaps: Map<number, number>[] = layers.map((layer, li) => {
      const m = new Map<number, number>();
      for (const d of layer) m.set(d.time, this.effectiveValue(li, d.time, d.value));
      return m;
    });

    // Compute stacked Y values per time: cumulative[li][ti]
    const cumulative: number[][] = Array.from({ length: this.#stores.length }, () => new Array(times.length).fill(0));
    for (let ti = 0; ti < times.length; ti++) {
      const t = times[ti];
      let total = 0;
      if (percent) {
        for (let li = 0; li < this.#stores.length; li++) {
          if (this.#stores[li].isVisible()) total += valueMaps[li].get(t) ?? 0;
        }
      }
      let running = 0;
      for (let li = 0; li < this.#stores.length; li++) {
        const raw = this.#stores[li].isVisible() ? (valueMaps[li].get(t) ?? 0) : 0;
        running += percent && total > 0 ? (raw / total) * 100 : raw;
        cumulative[li][ti] = running;
      }
    }

    // Draw from top layer to bottom so lower layers fill correctly
    for (let li = this.#stores.length - 1; li >= 0; li--) {
      if (!this.#stores[li].isVisible()) continue;
      const color = this.options.colors[li % this.options.colors.length];

      // Upper edge = this layer's cumulative
      const upperXY: [number, number][] = [];
      for (let ti = 0; ti < times.length; ti++) {
        upperXY.push([timeScale.timeToBitmapX(times[ti]), yScale.valueToBitmapY(cumulative[li][ti])]);
      }

      // Lower edge = previous layer's cumulative (or zero line)
      const lowerXY: [number, number][] = [];
      for (let ti = 0; ti < times.length; ti++) {
        const base = li > 0 ? cumulative[li - 1][ti] : 0;
        lowerXY.push([timeScale.timeToBitmapX(times[ti]), yScale.valueToBitmapY(base)]);
      }

      // Fill area between upper and lower
      if (this.options.areaFill) {
        context.beginPath();
        context.moveTo(upperXY[0][0], upperXY[0][1]);
        for (let i = 1; i < upperXY.length; i++) {
          context.lineTo(upperXY[i][0], upperXY[i][1]);
        }
        for (let i = lowerXY.length - 1; i >= 0; i--) {
          context.lineTo(lowerXY[i][0], lowerXY[i][1]);
        }
        context.closePath();
        context.fillStyle = hexToRgba(color, 0.25);
        context.fill();
      }

      // Stroke the upper edge
      context.beginPath();
      context.moveTo(upperXY[0][0], upperXY[0][1]);
      for (let i = 1; i < upperXY.length; i++) {
        context.lineTo(upperXY[i][0], upperXY[i][1]);
      }
      context.strokeStyle = color;
      context.lineWidth = lineWidth;
      context.lineJoin = 'round';
      context.lineCap = 'round';
      context.stroke();
    }
  }

  /**
   * Overlay hook: draws crosshair nearest-point dots and last-point pulse dots.
   * Chart invokes this during the overlay pass for any renderer that implements it.
   */
  drawOverlay(ctx: OverlayRenderContext): void {
    const { scope, timeScale, yScale, crosshair, dataInterval } = ctx;
    const size = scope;

    // Crosshair nearest-point dots
    if (crosshair) {
      const colors = this.options.colors;
      const stacking = this.options.stacking;
      const r = 4 * size.horizontalPixelRatio;

      const layerValues: number[] = [];
      const layerTimes: (number | null)[] = [];
      for (let li = 0; li < this.#stores.length; li++) {
        const closest = this.#stores[li].findNearest(crosshair.time, dataInterval);
        if (!closest) {
          layerValues.push(0);
          layerTimes.push(null);
        } else {
          layerValues.push(closest.value);
          layerTimes.push(closest.time);
        }
      }

      const displayValues: number[] = [];
      if (stacking === 'off') {
        for (const v of layerValues) displayValues.push(v);
      } else {
        // Hidden layers must contribute 0 so overlay dots align with the rendered stack.
        let total = 0;
        if (stacking === 'percent') {
          for (let li = 0; li < layerValues.length; li++) {
            if (this.#stores[li].isVisible()) total += layerValues[li];
          }
        }
        let running = 0;
        for (let li = 0; li < layerValues.length; li++) {
          const v = this.#stores[li].isVisible() ? layerValues[li] : 0;
          running += stacking === 'percent' && total > 0 ? (v / total) * 100 : v;
          displayValues.push(running);
        }
      }

      for (let li = 0; li < this.#stores.length; li++) {
        const t = layerTimes[li];
        if (t === null) continue;
        if (!this.#stores[li].isVisible()) continue;
        const color = colors[li % colors.length];
        const px = timeScale.timeToBitmapX(t);
        const py = yScale.valueToBitmapY(displayValues[li]);

        scope.context.beginPath();
        scope.context.arc(px, py, r + 3 * size.horizontalPixelRatio, 0, Math.PI * 2);
        const glowColor = color.startsWith('#')
          ? color + '40'
          : /^rgb\(/i.test(color)
            ? color.replace(/^rgb\((.*)\)$/i, 'rgba($1, 0.25)')
            : color.replace(/[\d.]+\)\s*$/, '0.25)');
        scope.context.fillStyle = glowColor;
        scope.context.fill();

        scope.context.beginPath();
        scope.context.arc(px, py, r, 0, Math.PI * 2);
        scope.context.fillStyle = color;
        scope.context.fill();
      }
    }

    // Pulse dots for line series (runs on overlay, not main layer).
    // Keep live-tracking in sync with the overlay pass — otherwise the pulse dot
    // would lag the smoothed line head by a frame.
    if (this.hasPulse) {
      const now = performance.now();
      this.advanceLiveTracking(now);
      for (let li = 0; li < this.#stores.length; li++) {
        if (!this.#stores[li].isVisible()) continue;
        // `trailingEndpoint` returns the interpolated (x, y) during a 'grow'
        // entrance so the dot glides from penultimate toward the new point in
        // lockstep with the line's trailing segment.
        const endpoint = this.trailingEndpoint(li, timeScale, yScale, now);
        if (!endpoint) continue;
        const color = this.options.colors[li % this.options.colors.length];
        this.drawPulse(scope.context, endpoint.x, endpoint.y, color, size.horizontalPixelRatio);
      }
    }
  }

  private drawPulse(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, pixelRatio: number): void {
    const dotRadius = 3 * pixelRatio;
    const pulse = 0.4 + 0.6 * Math.abs(Math.sin(performance.now() / 600));
    const glowRadius = dotRadius + 4 * pixelRatio * pulse;

    ctx.beginPath();
    ctx.arc(x, y, glowRadius, 0, Math.PI * 2);
    ctx.fillStyle = hexToRgba(color, pulse * 0.3);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }
}

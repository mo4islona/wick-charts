import { TimeSeriesStore } from '../data/store';
import type { ChartTheme } from '../theme/types';
import type { BarSeriesOptions, LineData, TimePointInput } from '../types';
import { normalizeTime, normalizeTimePointArray } from '../utils/time';
import type { SeriesRenderContext, SeriesRenderer } from './types';

const DEFAULT_OPTIONS: BarSeriesOptions = {
  colors: ['#26a69a', '#ef5350'],
  barWidthRatio: 0.6,
  stacking: 'off',
};

export class BarRenderer implements SeriesRenderer {
  readonly #stores: TimeSeriesStore<LineData>[];
  private options: BarSeriesOptions;

  constructor(layerCount: number, options?: Partial<BarSeriesOptions>) {
    this.#stores = Array.from({ length: layerCount }, () => new TimeSeriesStore<LineData>());
    this.options = { ...DEFAULT_OPTIONS, ...options };
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
  }

  appendPoint(point: unknown, layerIndex = 0): void {
    const store = this.#stores[layerIndex];
    if (!store) return;
    const p = point as TimePointInput;
    store.append({ ...p, time: normalizeTime(p.time) });
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

  /** Stacking off — each layer drawn independently from zero, overlapping */
  private renderOff(ctx: SeriesRenderContext): void {
    const { scope, timeScale, yScale, dataInterval } = ctx;
    const { context } = scope;
    const range = timeScale.getRange();

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
        const cx = timeScale.timeToBitmapX(d.time);
        if (d.value >= 0) {
          const topY = yScale.valueToBitmapY(d.value);
          const barHeight = Math.max(1, zeroY - topY);
          this.fillBar(context, cx - halfBody, topY, bodyWidth, barHeight, posColor);
        } else {
          const bottomY = yScale.valueToBitmapY(d.value);
          const barHeight = Math.max(1, bottomY - zeroY);
          this.fillBar(context, cx - halfBody, zeroY, bodyWidth, barHeight, negColor);
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
          arr.push({ layer: li, value: d.value });
        }
      }

      for (const [time, entries] of timeMap) {
        // Sort by |value| descending — tallest drawn first (behind)
        entries.sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
        const cx = timeScale.timeToBitmapX(time);

        for (const { layer, value } of entries) {
          const color = this.options.colors[layer % this.options.colors.length];
          if (value >= 0) {
            const topY = yScale.valueToBitmapY(value);
            const barHeight = Math.max(1, zeroY - topY);
            this.fillBar(context, cx - halfBody, topY, bodyWidth, barHeight, color);
          } else {
            const bottomY = yScale.valueToBitmapY(value);
            const barHeight = Math.max(1, bottomY - zeroY);
            this.fillBar(context, cx - halfBody, zeroY, bodyWidth, barHeight, color);
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

    const barWidth = timeScale.barWidthBitmap(dataInterval);
    const bodyWidth = Math.max(1, Math.round(barWidth * this.options.barWidthRatio) - 2);
    const halfBody = Math.floor(bodyWidth / 2);

    // Collect all visible data per layer (hidden layers contribute empty data)
    const layers = this.#stores.map((store) =>
      store.isVisible() ? store.getVisibleData(range.from, range.to) : [],
    );
    if (layers.every((l) => l.length === 0)) return;

    // Build values per time — hidden layers contribute 0
    const timeMap = new Map<number, number[]>();
    for (let li = 0; li < layers.length; li++) {
      for (const d of layers[li]) {
        if (!timeMap.has(d.time)) timeMap.set(d.time, new Array(layers.length).fill(0));
        timeMap.get(d.time)![li] = this.#stores[li].isVisible() ? d.value : 0;
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
            this.fillBar(context, cx - halfBody, topY, bodyWidth, h, color);
          } else if (raw < 0 && totalNegative < 0) {
            const pctBase = (baseNegative / totalNegative) * -100;
            const pctTop = ((baseNegative + raw) / totalNegative) * -100;
            const topY = yScale.valueToBitmapY(pctBase);
            const bottomY = yScale.valueToBitmapY(pctTop);
            const h = Math.max(1, bottomY - topY);
            context.fillStyle = color;
            context.fillRect(cx - halfBody, topY, bodyWidth, h);
          }
        } else {
          if (raw > 0) {
            const topY = yScale.valueToBitmapY(basePositive + raw);
            const bottomY = yScale.valueToBitmapY(basePositive);
            const h = Math.max(1, bottomY - topY);
            this.fillBar(context, cx - halfBody, topY, bodyWidth, h, color);
          } else {
            const topY = yScale.valueToBitmapY(baseNegative);
            const bottomY = yScale.valueToBitmapY(baseNegative + raw);
            const h = Math.max(1, bottomY - topY);
            context.fillStyle = color;
            context.fillRect(cx - halfBody, topY, bodyWidth, h);
          }
        }
      }
    }
  }

  private fillBar(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    color: string,
  ): void {
    context.fillStyle = color;
    context.fillRect(x, y, w, h);
  }
}

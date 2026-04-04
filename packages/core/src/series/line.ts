import type { LineData, LineSeriesOptions } from '../types';

function hexToRgba(hex: string, alpha: number): string {
  if (hex.startsWith('rgba') || hex.startsWith('rgb')) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

import { decimateLineData } from '../data/decimation';
import { TimeSeriesStore } from '../data/store';
import type { SeriesRenderContext, SeriesRenderer } from './types';

const DEFAULT_OPTIONS: LineSeriesOptions = {
  colors: ['#2962FF'],
  lineWidth: 1,
  areaFill: true,
  pulse: true,
  stacking: 'off',
};

export class LineRenderer implements SeriesRenderer {
  readonly stores: TimeSeriesStore<LineData>[];
  private options: LineSeriesOptions;

  constructor(layerCount: number, options?: Partial<LineSeriesOptions>) {
    this.stores = Array.from({ length: layerCount }, () => new TimeSeriesStore<LineData>());
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  get store(): TimeSeriesStore<LineData> {
    return this.stores[0];
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

  get needsAnimation(): boolean {
    return this.options.pulse && this.stores.some((s) => s.length > 0);
  }

  getValueRange(from: number, to: number): { min: number; max: number } | null {
    if (this.options.stacking === 'percent') {
      return { min: 0, max: 100 };
    }
    if (this.stores.length <= 1) {
      return null; // single store — chart handles it via entry.store
    }
    const layers = this.stores.map((s) => (s.isVisible() ? s.getVisibleData(from, to) : []));

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
    if (this.options.stacking === 'off') {
      this.renderOff(ctx);
    } else {
      this.renderStacked(ctx, this.options.stacking === 'percent');
    }
  }

  /** Each layer drawn independently */
  private renderOff(ctx: SeriesRenderContext): void {
    const { scope, timeScale, yScale } = ctx;
    const { context } = scope;
    const range = timeScale.getRange();
    const { verticalPixelRatio, horizontalPixelRatio } = scope;
    const lineWidth = Math.max(1, Math.round(this.options.lineWidth * verticalPixelRatio));

    for (let li = 0; li < this.stores.length; li++) {
      if (!this.stores[li].isVisible()) continue;

      let data = this.stores[li].getVisibleData(range.from, range.to);
      const pixelWidth = scope.mediaSize.width;
      if (data.length > pixelWidth * 2) {
        data = decimateLineData(data, Math.round(pixelWidth * 1.5));
      }
      if (data.length < 2) continue;

      const color = this.options.colors[li % this.options.colors.length];

      // Line
      context.beginPath();
      context.moveTo(timeScale.timeToBitmapX(data[0].time), yScale.valueToBitmapY(data[0].value));
      for (let i = 1; i < data.length; i++) {
        context.lineTo(timeScale.timeToBitmapX(data[i].time), yScale.valueToBitmapY(data[i].value));
      }
      context.strokeStyle = color;
      context.lineWidth = lineWidth;
      context.lineJoin = 'round';
      context.lineCap = 'round';
      context.stroke();

      // Area fill
      if (this.options.areaFill) {
        const firstX = timeScale.timeToBitmapX(data[0].time);
        const lastX = timeScale.timeToBitmapX(data[data.length - 1].time);
        const bottomY = scope.bitmapSize.height;
        context.lineTo(lastX, bottomY);
        context.lineTo(firstX, bottomY);
        context.closePath();
        const grad = context.createLinearGradient(0, 0, 0, bottomY);
        grad.addColorStop(0, hexToRgba(color, 0.12));
        grad.addColorStop(1, hexToRgba(color, 0.01));
        context.fillStyle = grad;
        context.fill();
      }

      // Pulse dot on last point
      if (this.options.pulse) {
        const last = data[data.length - 1];
        this.drawPulse(
          context,
          timeScale.timeToBitmapX(last.time),
          yScale.valueToBitmapY(last.value),
          color,
          horizontalPixelRatio,
        );
      }
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
    const layers = this.stores.map((s) => s.getVisibleData(range.from, range.to));
    // Get all unique times, sorted
    const timeSet = new Set<number>();
    for (const layer of layers) {
      for (const d of layer) timeSet.add(d.time);
    }
    const times = Array.from(timeSet).sort((a, b) => a - b);
    if (times.length < 2) return;

    // Build value maps for fast lookup
    const valueMaps: Map<number, number>[] = layers.map((layer) => {
      const m = new Map<number, number>();
      for (const d of layer) m.set(d.time, d.value);
      return m;
    });

    // Compute stacked Y values per time: cumulative[li][ti]
    const cumulative: number[][] = Array.from({ length: this.stores.length }, () => new Array(times.length).fill(0));
    for (let ti = 0; ti < times.length; ti++) {
      const t = times[ti];
      let total = 0;
      if (percent) {
        for (let li = 0; li < this.stores.length; li++) {
          if (this.stores[li].isVisible()) total += valueMaps[li].get(t) ?? 0;
        }
      }
      let running = 0;
      for (let li = 0; li < this.stores.length; li++) {
        const raw = this.stores[li].isVisible() ? (valueMaps[li].get(t) ?? 0) : 0;
        running += percent && total > 0 ? (raw / total) * 100 : raw;
        cumulative[li][ti] = running;
      }
    }

    // Draw from top layer to bottom so lower layers fill correctly
    for (let li = this.stores.length - 1; li >= 0; li--) {
      if (!this.stores[li].isVisible()) continue;
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

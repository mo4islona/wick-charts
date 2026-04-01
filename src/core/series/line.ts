import type { LineData, LineSeriesOptions } from "../types";

function hexToRgba(hex: string, alpha: number): string {
  if (hex.startsWith("rgba") || hex.startsWith("rgb")) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

import { decimateLineData } from "../data/decimation";
import type { TimeSeriesStore } from "../data/store";
import type { SeriesRenderContext, SeriesRenderer } from "./types";

const DEFAULT_OPTIONS: LineSeriesOptions = {
  color: "#2962FF",
  lineWidth: 1,
  areaFill: true,
  areaTopColor: "rgba(41, 98, 255, 0.08)",
  areaBottomColor: "rgba(41, 98, 255, 0.01)",
};

export class LineRenderer implements SeriesRenderer {
  readonly store: TimeSeriesStore<LineData>;
  private options: LineSeriesOptions;
  /** Track which area colors were explicitly set by user */
  private userAreaTop = false;
  private userAreaBottom = false;

  constructor(store: TimeSeriesStore<LineData>, options?: Partial<LineSeriesOptions>) {
    this.store = store;
    this.userAreaTop = options?.areaTopColor !== undefined;
    this.userAreaBottom = options?.areaBottomColor !== undefined;
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.deriveAreaColors();
  }

  updateOptions(options: Partial<LineSeriesOptions>): void {
    if (options.areaTopColor !== undefined) this.userAreaTop = true;
    if (options.areaBottomColor !== undefined) this.userAreaBottom = true;
    this.options = { ...this.options, ...options };
    this.deriveAreaColors();
  }

  /** Always derive area fill colors from line color unless user explicitly set them */
  private deriveAreaColors(): void {
    const c = this.options.color;
    if (!this.userAreaTop) {
      this.options.areaTopColor = hexToRgba(c, 0.12);
    }
    if (!this.userAreaBottom) {
      this.options.areaBottomColor = hexToRgba(c, 0.01);
    }
  }

  render(ctx: SeriesRenderContext): void {
    const { scope, timeScale, priceScale } = ctx;
    const { context } = scope;
    const range = timeScale.getRange();

    let visibleData = this.store.getVisibleData(range.from, range.to);
    const pixelWidth = scope.mediaSize.width;
    if (visibleData.length > pixelWidth * 2) {
      visibleData = decimateLineData(visibleData, Math.round(pixelWidth * 1.5));
    }
    if (visibleData.length < 2) return;

    const { horizontalPixelRatio, verticalPixelRatio } = scope;
    const lineWidth = Math.max(1, Math.round(this.options.lineWidth * verticalPixelRatio));

    context.beginPath();
    const firstX = timeScale.timeToBitmapX(visibleData[0].time);
    const firstY = priceScale.priceToBitmapY(visibleData[0].value);
    context.moveTo(firstX, firstY);

    for (let i = 1; i < visibleData.length; i++) {
      const x = timeScale.timeToBitmapX(visibleData[i].time);
      const y = priceScale.priceToBitmapY(visibleData[i].value);
      context.lineTo(x, y);
    }

    context.strokeStyle = this.options.color;
    context.lineWidth = lineWidth;
    context.lineJoin = "round";
    context.lineCap = "round";
    context.stroke();

    if (this.options.areaFill) {
      const lastX = timeScale.timeToBitmapX(visibleData[visibleData.length - 1].time);
      const bottomY = scope.bitmapSize.height;

      context.lineTo(lastX, bottomY);
      context.lineTo(firstX, bottomY);
      context.closePath();

      const gradient = context.createLinearGradient(0, 0, 0, bottomY);
      gradient.addColorStop(0, this.options.areaTopColor);
      gradient.addColorStop(1, this.options.areaBottomColor);
      context.fillStyle = gradient;
      context.fill();
    }

    // Pulsing dot at last point
    const lastPoint = visibleData[visibleData.length - 1];
    const dotX = timeScale.timeToBitmapX(lastPoint.time);
    const dotY = priceScale.priceToBitmapY(lastPoint.value);
    const dotRadius = 3 * horizontalPixelRatio;

    // Pulse glow (animated via time-based sine)
    const pulse = 0.4 + 0.6 * Math.abs(Math.sin(performance.now() / 600));
    const glowRadius = dotRadius + 4 * horizontalPixelRatio * pulse;

    context.beginPath();
    context.arc(dotX, dotY, glowRadius, 0, Math.PI * 2);
    context.fillStyle = this.options.color.replace(/[\d.]+\)$/, (pulse * 0.3).toFixed(2) + ")");
    // If color is hex, convert for glow
    context.fillStyle = hexToRgba(this.options.color, pulse * 0.3);
    context.fill();

    // Solid dot
    context.beginPath();
    context.arc(dotX, dotY, dotRadius, 0, Math.PI * 2);
    context.fillStyle = this.options.color;
    context.fill();
  }

  /** Request continuous redraws for the pulse animation */
  get needsAnimation(): boolean {
    return this.store.length > 0;
  }
}

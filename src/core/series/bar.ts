import type { TimeSeriesStore } from "../data/store";
import type { BarSeriesOptions, LineData } from "../types";
import type { SeriesRenderContext, SeriesRenderer } from "./types";

const DEFAULT_OPTIONS: BarSeriesOptions = {
  positiveColor: "#26a69a",
  negativeColor: "#ef5350",
  barWidthRatio: 0.6,
};

export class BarRenderer implements SeriesRenderer {
  readonly store: TimeSeriesStore<LineData>;
  private options: BarSeriesOptions;

  constructor(store: TimeSeriesStore<LineData>, options?: Partial<BarSeriesOptions>) {
    this.store = store;
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  updateOptions(options: Partial<BarSeriesOptions>): void {
    this.options = { ...this.options, ...options };
  }

  render(ctx: SeriesRenderContext): void {
    const { scope, timeScale, priceScale, dataInterval } = ctx;
    const { context } = scope;
    const range = timeScale.getRange();

    const visibleData = this.store.getVisibleData(range.from, range.to);
    if (visibleData.length === 0) return;

    const barWidth = timeScale.barWidthBitmap(dataInterval);
    const bodyWidth = Math.max(1, Math.round(barWidth * this.options.barWidthRatio) - 2);
    const halfBody = Math.floor(bodyWidth / 2);

    // Zero line Y
    const priceRange = priceScale.getRange();
    const hasNegative = priceRange.min < 0;
    const zeroY = hasNegative ? priceScale.priceToBitmapY(0) : scope.bitmapSize.height;

    // Batch by color
    const positive: LineData[] = [];
    const negative: LineData[] = [];
    for (const d of visibleData) {
      if (d.value >= 0) positive.push(d);
      else negative.push(d);
    }

    // Positive bars (grow up from zero)
    if (positive.length > 0) {
      const topColor = lighten(this.options.positiveColor, 0.15);
      for (const d of positive) {
        const cx = timeScale.timeToBitmapX(d.time);
        const topY = priceScale.priceToBitmapY(d.value);
        const barHeight = Math.max(1, zeroY - topY);

        if (barHeight <= 2) {
          context.fillStyle = this.options.positiveColor;
          context.fillRect(cx - halfBody, topY, bodyWidth, barHeight);
        } else {
          const grad = context.createLinearGradient(0, topY, 0, topY + barHeight);
          grad.addColorStop(0, topColor);
          grad.addColorStop(1, this.options.positiveColor);
          context.fillStyle = grad;
          context.fillRect(cx - halfBody, topY, bodyWidth, barHeight);
        }
      }
    }

    // Negative bars (grow down from zero)
    if (negative.length > 0) {
      const topColor = lighten(this.options.negativeColor, 0.15);
      for (const d of negative) {
        const cx = timeScale.timeToBitmapX(d.time);
        const bottomY = priceScale.priceToBitmapY(d.value);
        const barHeight = Math.max(1, bottomY - zeroY);

        if (barHeight <= 2) {
          context.fillStyle = this.options.negativeColor;
          context.fillRect(cx - halfBody, zeroY, bodyWidth, barHeight);
        } else {
          const grad = context.createLinearGradient(0, zeroY, 0, zeroY + barHeight);
          grad.addColorStop(0, this.options.negativeColor);
          grad.addColorStop(1, topColor);
          context.fillStyle = grad;
          context.fillRect(cx - halfBody, zeroY, bodyWidth, barHeight);
        }
      }
    }

    // Zero line if data has negative values
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
}

function lighten(hex: string, amount: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `#${Math.min(255, Math.round(r + (255 - r) * amount))
    .toString(16)
    .padStart(2, "0")}${Math.min(255, Math.round(g + (255 - g) * amount))
    .toString(16)
    .padStart(2, "0")}${Math.min(255, Math.round(b + (255 - b) * amount))
    .toString(16)
    .padStart(2, "0")}`;
}

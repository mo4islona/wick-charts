import { TimeSeriesStore } from "../data/store";
import type { LineData, StackedBarSeriesOptions } from "../types";
import type { SeriesRenderContext, SeriesRenderer } from "./types";

const DEFAULT_OPTIONS: StackedBarSeriesOptions = {
  colors: ["#26a69a", "#ef5350", "#2962FF", "#AB47BC"],
  barWidthRatio: 0.6,
};

export class StackedBarRenderer implements SeriesRenderer {
  readonly stores: TimeSeriesStore<LineData>[];
  private options: StackedBarSeriesOptions;

  constructor(storeCount: number, options?: Partial<StackedBarSeriesOptions>) {
    this.stores = Array.from({ length: storeCount }, () => new TimeSeriesStore<LineData>());
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /** For chart compatibility — returns first store */
  get store(): TimeSeriesStore<LineData> {
    return this.stores[0];
  }

  updateOptions(options: Partial<StackedBarSeriesOptions>): void {
    this.options = { ...this.options, ...options };
  }

  render(ctx: SeriesRenderContext): void {
    const { scope, timeScale, priceScale, dataInterval } = ctx;
    const { context } = scope;
    const range = timeScale.getRange();

    const barWidth = timeScale.barWidthBitmap(dataInterval);
    const bodyWidth = Math.max(1, Math.round(barWidth * this.options.barWidthRatio) - 2);
    const halfBody = Math.floor(bodyWidth / 2);

    // Collect all visible data per layer
    const layers = this.stores.map((store) => store.getVisibleData(range.from, range.to));
    if (layers.every((l) => l.length === 0)) return;

    // Build stacked values per time: accumulate positive upward, negative downward
    const timeMap = new Map<number, number[]>();
    for (let li = 0; li < layers.length; li++) {
      for (const d of layers[li]) {
        if (!timeMap.has(d.time)) timeMap.set(d.time, new Array(layers.length).fill(0));
        timeMap.get(d.time)![li] = d.value;
      }
    }

    // Draw layer by layer, bottom to top
    for (let li = 0; li < layers.length; li++) {
      const color = this.options.colors[li % this.options.colors.length];
      const topColor = lighten(color, 0.15);

      context.fillStyle = color;

      for (const [time, values] of timeMap) {
        const val = values[li];
        if (val === 0) continue;

        const cx = timeScale.timeToBitmapX(time);

        // Sum of previous layers for stacking offset
        let basePositive = 0;
        let baseNegative = 0;
        for (let prev = 0; prev < li; prev++) {
          const v = values[prev];
          if (v > 0) basePositive += v;
          else baseNegative += v;
        }

        if (val > 0) {
          const topY = priceScale.priceToBitmapY(basePositive + val);
          const bottomY = priceScale.priceToBitmapY(basePositive);
          const h = Math.max(1, bottomY - topY);

          if (h > 2) {
            const grad = context.createLinearGradient(0, topY, 0, topY + h);
            grad.addColorStop(0, topColor);
            grad.addColorStop(1, color);
            context.fillStyle = grad;
          } else {
            context.fillStyle = color;
          }
          context.fillRect(cx - halfBody, topY, bodyWidth, h);
        } else {
          const topY = priceScale.priceToBitmapY(baseNegative);
          const bottomY = priceScale.priceToBitmapY(baseNegative + val);
          const h = Math.max(1, bottomY - topY);
          context.fillStyle = color;
          context.fillRect(cx - halfBody, topY, bodyWidth, h);
        }
      }
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

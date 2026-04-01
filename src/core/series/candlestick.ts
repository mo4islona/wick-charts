import { decimateOHLCData } from "../data/decimation";
import type { TimeSeriesStore } from "../data/store";
import type { CandlestickSeriesOptions, OHLCData } from "../types";
import type { SeriesRenderContext, SeriesRenderer } from "./types";

const DEFAULT_OPTIONS: CandlestickSeriesOptions = {
  upColor: "#26a69a",
  downColor: "#ef5350",
  wickUpColor: "#26a69a",
  wickDownColor: "#ef5350",
  bodyWidthRatio: 0.6,
};

export class CandlestickRenderer implements SeriesRenderer {
  readonly store: TimeSeriesStore<OHLCData>;
  private options: CandlestickSeriesOptions;

  constructor(store: TimeSeriesStore<OHLCData>, options?: Partial<CandlestickSeriesOptions>) {
    this.store = store;
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  updateOptions(options: Partial<CandlestickSeriesOptions>): void {
    this.options = { ...this.options, ...options };
  }

  render(ctx: SeriesRenderContext): void {
    const { scope, timeScale, priceScale, dataInterval } = ctx;
    const { context, horizontalPixelRatio } = scope;
    const range = timeScale.getRange();

    let visibleData = this.store.getVisibleData(range.from, range.to);
    const pixelWidth = scope.mediaSize.width;
    if (visibleData.length > pixelWidth * 2) {
      visibleData = decimateOHLCData(visibleData, Math.round(pixelWidth * 1.5));
    }
    if (visibleData.length === 0) return;

    const barWidth = timeScale.barWidthBitmap(dataInterval);
    const bodyWidth = Math.max(1, Math.round(barWidth * this.options.bodyWidthRatio) - 2);
    const halfBody = Math.floor(bodyWidth / 2);
    const wickWidth = Math.max(1, Math.round(horizontalPixelRatio));

    // Draw volume first (behind candles)
    this.drawVolume(context, visibleData, timeScale, scope.bitmapSize.height, barWidth, dataInterval);

    // Then candles on top
    const bullish: OHLCData[] = [];
    const bearish: OHLCData[] = [];
    for (const candle of visibleData) {
      if (candle.close >= candle.open) bullish.push(candle);
      else bearish.push(candle);
    }

    this.drawCandles(
      context,
      bullish,
      timeScale,
      priceScale,
      halfBody,
      bodyWidth,
      wickWidth,
      this.options.upColor,
      this.options.wickUpColor,
    );
    this.drawCandles(
      context,
      bearish,
      timeScale,
      priceScale,
      halfBody,
      bodyWidth,
      wickWidth,
      this.options.downColor,
      this.options.wickDownColor,
    );
  }

  private drawVolume(
    ctx: CanvasRenderingContext2D,
    data: OHLCData[],
    timeScale: import("../scales/time-scale").TimeScale,
    chartHeight: number,
    barWidth: number,
    dataInterval: number,
  ): void {
    // Find max volume for scaling
    let maxVol = 0;
    for (const c of data) {
      if (c.volume !== undefined && c.volume > maxVol) maxVol = c.volume;
    }
    if (maxVol === 0) return;

    // Volume occupies bottom 20% of chart
    const volumeMaxHeight = chartHeight * 0.2;
    const volBarWidth = Math.max(1, barWidth - 2);
    const halfBar = Math.floor(volBarWidth / 2);

    for (const c of data) {
      if (c.volume === undefined || c.volume === 0) continue;

      const cx = timeScale.timeToBitmapX(c.time);
      const h = Math.max(1, (c.volume / maxVol) * volumeMaxHeight);
      const isUp = c.close >= c.open;

      ctx.fillStyle = isUp ? hexToRgba(this.options.upColor, 0.2) : hexToRgba(this.options.downColor, 0.2);

      ctx.fillRect(cx - halfBar, chartHeight - h, volBarWidth, h);
    }
  }

  private drawCandles(
    ctx: CanvasRenderingContext2D,
    candles: OHLCData[],
    timeScale: import("../scales/time-scale").TimeScale,
    priceScale: import("../scales/price-scale").PriceScale,
    halfBody: number,
    bodyWidth: number,
    wickWidth: number,
    bodyColor: string,
    wickColor: string,
  ): void {
    if (candles.length === 0) return;

    // Wicks
    ctx.fillStyle = wickColor;
    for (const c of candles) {
      const cx = timeScale.timeToBitmapX(c.time);
      const highY = priceScale.priceToBitmapY(c.high);
      const lowY = priceScale.priceToBitmapY(c.low);
      const wickX = cx - Math.floor(wickWidth / 2);
      ctx.fillRect(wickX, highY, wickWidth, lowY - highY);
    }

    // Bodies with gradient
    const topColor = lighten(bodyColor, 0.2);
    const bottomColor = darken(bodyColor, 0.15);

    for (const c of candles) {
      const cx = timeScale.timeToBitmapX(c.time);
      const openY = priceScale.priceToBitmapY(c.open);
      const closeY = priceScale.priceToBitmapY(c.close);
      const bodyTop = Math.min(openY, closeY);
      const bodyHeight = Math.max(1, Math.abs(closeY - openY));

      if (bodyHeight <= 2) {
        ctx.fillStyle = bodyColor;
        ctx.fillRect(cx - halfBody, bodyTop, bodyWidth, bodyHeight);
      } else {
        const grad = ctx.createLinearGradient(0, bodyTop, 0, bodyTop + bodyHeight);
        grad.addColorStop(0, topColor);
        grad.addColorStop(0.5, bodyColor);
        grad.addColorStop(1, bottomColor);
        ctx.fillStyle = grad;
        ctx.fillRect(cx - halfBody, bodyTop, bodyWidth, bodyHeight);
      }
    }
  }
}

function hexToRgba(hex: string, alpha: number): string {
  const [r, g, b] = parseHex(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function lighten(hex: string, amount: number): string {
  const [r, g, b] = parseHex(hex);
  return toHex(
    Math.min(255, Math.round(r + (255 - r) * amount)),
    Math.min(255, Math.round(g + (255 - g) * amount)),
    Math.min(255, Math.round(b + (255 - b) * amount)),
  );
}

function darken(hex: string, amount: number): string {
  const [r, g, b] = parseHex(hex);
  return toHex(
    Math.max(0, Math.round(r * (1 - amount))),
    Math.max(0, Math.round(g * (1 - amount))),
    Math.max(0, Math.round(b * (1 - amount))),
  );
}

function parseHex(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

function toHex(r: number, g: number, b: number): string {
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

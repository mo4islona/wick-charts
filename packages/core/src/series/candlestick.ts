import { decimateOHLCData } from '../data/decimation';
import type { TimeSeriesStore } from '../data/store';
import type { ChartTheme } from '../theme/types';
import type { CandlestickSeriesOptions, OHLCData, OHLCInput } from '../types';
import { darken, hexToRgba, lighten } from '../utils/color';
import { normalizeOHLCArray, normalizeTime } from '../utils/time';
import type { SeriesRenderContext, SeriesRenderer } from './types';

const DEFAULT_OPTIONS: CandlestickSeriesOptions = {
  upColor: '#26a69a',
  downColor: '#ef5350',
  wickUpColor: '#26a69a',
  wickDownColor: '#ef5350',
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

  getColor(): string {
    return this.options.upColor;
  }

  // --- SeriesRenderer interface implementation ------------------------------

  setData(data: unknown): void {
    this.store.setData(normalizeOHLCArray((data ?? []) as OHLCInput[]));
  }

  appendPoint(point: unknown): void {
    const p = point as OHLCInput;
    this.store.append({ ...p, time: normalizeTime(p.time) });
  }

  updateLastPoint(point: unknown): void {
    const p = point as OHLCInput;
    this.store.updateLast({ ...p, time: normalizeTime(p.time) });
  }

  getLayerCount(): number {
    return 1;
  }

  setLayerVisible(_index: number, _visible: boolean): void {
    // Candlestick has a single layer; visibility is managed by the chart.
  }

  isLayerVisible(_index: number): boolean {
    return true;
  }

  getLayerColors(): string[] {
    return [this.options.upColor];
  }

  applyTheme(theme: ChartTheme, _prev: ChartTheme): void {
    this.updateOptions({
      upColor: theme.candlestick.upColor,
      downColor: theme.candlestick.downColor,
      wickUpColor: theme.candlestick.wickUpColor,
      wickDownColor: theme.candlestick.wickDownColor,
    });
  }

  onDataChanged(listener: () => void): () => void {
    this.store.on('update', listener);
    return () => this.store.off('update', listener);
  }

  dispose(): void {
    this.store.removeAllListeners();
  }

  getLastValue(): number | null {
    const last = this.store.last();
    return last ? last.close : null;
  }

  getDataAtTime(time: number, interval: number): OHLCData | null {
    return this.store.findNearest(time, interval);
  }

  render(ctx: SeriesRenderContext): void {
    const { scope, timeScale, yScale, dataInterval } = ctx;
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
    const chartBitmapHeight = Math.round(yScale.getMediaHeight() * scope.verticalPixelRatio);
    this.drawVolume(context, visibleData, timeScale, chartBitmapHeight, barWidth, dataInterval);

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
      yScale,
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
      yScale,
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
    timeScale: import('../scales/time-scale').TimeScale,
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

    const upVolumeColor = hexToRgba(this.options.upColor, 0.2);
    const downVolumeColor = hexToRgba(this.options.downColor, 0.2);

    for (const c of data) {
      if (c.volume === undefined || c.volume === 0) continue;

      const cx = timeScale.timeToBitmapX(c.time);
      const h = Math.max(1, (c.volume / maxVol) * volumeMaxHeight);
      const isUp = c.close >= c.open;

      ctx.fillStyle = isUp ? upVolumeColor : downVolumeColor;

      ctx.fillRect(cx - halfBar, chartHeight - h, volBarWidth, h);
    }
  }

  private drawCandles(
    ctx: CanvasRenderingContext2D,
    candles: OHLCData[],
    timeScale: import('../scales/time-scale').TimeScale,
    yScale: import('../scales/y-scale').YScale,
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
      const highY = yScale.valueToBitmapY(c.high);
      const lowY = yScale.valueToBitmapY(c.low);
      const wickX = cx - Math.floor(wickWidth / 2);
      ctx.fillRect(wickX, highY, wickWidth, lowY - highY);
    }

    // Bodies
    const useGradient = this.options.candleGradient !== false;
    const topColor = useGradient ? lighten(bodyColor, 0.2) : bodyColor;
    const bottomColor = useGradient ? darken(bodyColor, 0.15) : bodyColor;

    if (!useGradient) ctx.fillStyle = bodyColor;

    for (const c of candles) {
      const cx = timeScale.timeToBitmapX(c.time);
      const openY = yScale.valueToBitmapY(c.open);
      const closeY = yScale.valueToBitmapY(c.close);
      const bodyTop = Math.min(openY, closeY);
      const bodyHeight = Math.max(1, Math.abs(closeY - openY));

      if (useGradient && bodyHeight > 2) {
        const grad = ctx.createLinearGradient(0, bodyTop, 0, bodyTop + bodyHeight);
        grad.addColorStop(0, topColor);
        grad.addColorStop(0.5, bodyColor);
        grad.addColorStop(1, bottomColor);
        ctx.fillStyle = grad;
      }
      ctx.fillRect(cx - halfBody, bodyTop, bodyWidth, bodyHeight);
    }
  }
}

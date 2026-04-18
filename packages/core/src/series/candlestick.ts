import { decimateOHLCData } from '../data/decimation';
import type { TimeSeriesStore } from '../data/store';
import type { ChartTheme } from '../theme/types';
import type { CandlestickSeriesOptions, OHLCData, OHLCInput } from '../types';
import { darken, hexToRgba, lighten } from '../utils/color';
import { clamp, easeOutCubic, lerp, smoothToward } from '../utils/math';
import { normalizeOHLCArray, normalizeTime } from '../utils/time';
import type { SeriesRenderContext, SeriesRenderer } from './types';

const DEFAULT_OPTIONS: CandlestickSeriesOptions = {
  upColor: '#26a69a',
  downColor: '#ef5350',
  wickUpColor: '#26a69a',
  wickDownColor: '#ef5350',
  bodyWidthRatio: 0.6,
};

const DEFAULT_LIVE_SMOOTH_RATE = 14;
const DEFAULT_ENTER_DURATION_MS = 400;

/** Returns true if the smoothed value is still meaningfully off-target. */
function ohlcDiffers(displayed: number, target: number): boolean {
  const eps = Math.max(1e-4, Math.abs(target) * 1e-5);
  return Math.abs(displayed - target) > eps;
}

export class CandlestickRenderer implements SeriesRenderer {
  readonly store: TimeSeriesStore<OHLCData>;
  private options: CandlestickSeriesOptions;
  /** Smoothed OHLC of the live last candle. Null until first render. */
  private displayedLast: OHLCData | null = null;
  /** `time` of the candle currently seeded into {@link displayedLast}. Detects new-candle transitions. */
  private lastSeededTime = Number.NaN;
  /** Last render timestamp for frame-rate-independent smoothing. */
  private lastRenderTime = 0;
  /** Per-candle entrance animations. Keyed by candle `time`; entries are deleted once progress reaches 1. */
  private entries: Map<number, { startTime: number }> = new Map();

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
    // Bulk loads never animate — every candle is "already there".
    this.entries.clear();
  }

  appendPoint(point: unknown): void {
    const p = point as OHLCInput;
    const time = normalizeTime(p.time);
    this.store.append({ ...p, time });
    if ((this.options.enterAnimation ?? 'fade-unfold') !== 'none') {
      this.entries.set(time, { startTime: performance.now() });
    }
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
    this.displayedLast = null;
    this.lastSeededTime = Number.NaN;
    this.lastRenderTime = 0;
    this.entries.clear();
  }

  getLastValue(): number | null {
    const last = this.store.last();
    return last ? last.close : null;
  }

  getDataAtTime(time: number, interval: number): OHLCData | null {
    return this.store.findNearest(time, interval);
  }

  /** Drop all in-flight per-candle entrance animations. Displayed-last smoothing
   * (the real-time halo/price lerp) is intentionally preserved. */
  cancelEntranceAnimations(): void {
    this.entries.clear();
  }

  /** True while any entrance animation is active or the displayed last candle hasn't converged. */
  get needsAnimation(): boolean {
    if (this.entries.size > 0) return true;
    if (!this.displayedLast) return false;
    const actualLast = this.store.last();
    if (!actualLast) return false;
    if (actualLast.time !== this.displayedLast.time) return false;
    return (
      ohlcDiffers(this.displayedLast.open, actualLast.open) ||
      ohlcDiffers(this.displayedLast.high, actualLast.high) ||
      ohlcDiffers(this.displayedLast.low, actualLast.low) ||
      ohlcDiffers(this.displayedLast.close, actualLast.close)
    );
  }

  /**
   * Compute the entrance progress for a candle's `time`, in [0, 1]. Returns 1 for
   * candles not in the entry map. When the entrance completes, the entry is pruned
   * and subsequent renders short-circuit to identity (progress=1).
   */
  private entranceProgress(time: number, now: number): number {
    const entry = this.entries.get(time);
    if (!entry) return 1;
    const duration = this.options.enterDurationMs ?? DEFAULT_ENTER_DURATION_MS;
    if (duration <= 0) {
      this.entries.delete(time);
      return 1;
    }
    const t = clamp((now - entry.startTime) / duration, 0, 1);
    const progress = easeOutCubic(t);
    if (t >= 1) this.entries.delete(time);
    return progress;
  }

  /**
   * Advance the smoothed last-candle state. Seeds directly on first render or when
   * the last candle's `time` changes (new candle); otherwise exponentially chases
   * the target OHLC so live `updateLastPoint` ticks interpolate instead of jumping.
   */
  private advanceLiveTracking(now: number): void {
    const dt = this.lastRenderTime ? Math.min(0.05, (now - this.lastRenderTime) / 1000) : 0;
    this.lastRenderTime = now;

    const actualLast = this.store.last();
    if (!actualLast) {
      this.displayedLast = null;
      this.lastSeededTime = Number.NaN;
      return;
    }

    const isNewCandle = this.lastSeededTime !== actualLast.time;
    const rate = this.options.liveSmoothRate ?? DEFAULT_LIVE_SMOOTH_RATE;
    // rate <= 0 explicitly disables smoothing: always display the target as-is.
    if (this.displayedLast === null || isNewCandle || rate <= 0) {
      this.displayedLast = { ...actualLast };
      this.lastSeededTime = actualLast.time;
      return;
    }

    const prev = this.displayedLast;
    this.displayedLast = {
      time: actualLast.time,
      open: smoothToward(prev.open, actualLast.open, rate, dt),
      high: smoothToward(prev.high, actualLast.high, rate, dt),
      low: smoothToward(prev.low, actualLast.low, rate, dt),
      close: smoothToward(prev.close, actualLast.close, rate, dt),
      volume: actualLast.volume,
    };
  }

  render(ctx: SeriesRenderContext): void {
    const { scope, timeScale, yScale, dataInterval } = ctx;
    const { context, horizontalPixelRatio } = scope;
    const range = timeScale.getRange();

    const now = performance.now();
    this.advanceLiveTracking(now);

    let visibleData = this.store.getVisibleData(range.from, range.to);
    const pixelWidth = scope.mediaSize.width;
    const decimated = visibleData.length > pixelWidth * 2;
    if (decimated) {
      visibleData = decimateOHLCData(visibleData, Math.round(pixelWidth * 1.5));
      // Decimation loses per-`time` identity — active entries won't line up with
      // rendered candles, and the last-candle smoothing substitute won't either.
      this.entries.clear();
    }
    if (visibleData.length === 0) return;

    // Substitute the smoothed OHLC for the live last candle so its body and wick
    // track the real last value without jumping.
    if (!decimated && this.displayedLast) {
      const lastIdx = visibleData.length - 1;
      if (visibleData[lastIdx].time === this.displayedLast.time) {
        visibleData = [...visibleData.slice(0, lastIdx), this.displayedLast];
      }
    }

    // Snapshot entrance progress per candle up-front so drawCandles batches (bulls +
    // bears) see a consistent progress value and we don't re-evaluate easeOutCubic
    // twice per candle (once for the wick, once for the body).
    const entranceByTime: Map<number, number> | null = this.entries.size > 0 ? new Map() : null;
    if (entranceByTime) {
      for (const c of visibleData) {
        if (this.entries.has(c.time)) {
          entranceByTime.set(c.time, this.entranceProgress(c.time, now));
        }
      }
    }

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
      entranceByTime,
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
      entranceByTime,
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
    entranceByTime: Map<number, number> | null,
  ): void {
    if (candles.length === 0) return;

    const style = this.options.enterAnimation ?? 'fade-unfold';
    const barWidth = bodyWidth + 2; // approximate slot width used for 'slide' horizontal offset

    // Wicks
    ctx.fillStyle = wickColor;
    for (const c of candles) {
      const progress = entranceByTime?.get(c.time) ?? 1;
      const cx = timeScale.timeToBitmapX(c.time);
      const openY = yScale.valueToBitmapY(c.open);
      const highY = yScale.valueToBitmapY(c.high);
      const lowY = yScale.valueToBitmapY(c.low);
      const wickX = cx - Math.floor(wickWidth / 2);

      if (progress >= 1 || style === 'none') {
        ctx.fillRect(wickX, highY, wickWidth, lowY - highY);
        continue;
      }

      const t = applyCandleTransform(progress, style, {
        x: wickX,
        barWidth,
        anchorY: openY,
        topY: highY,
        bottomY: lowY,
      });
      ctx.save();
      ctx.globalAlpha = t.alpha;
      ctx.fillRect(t.x, t.topY, wickWidth, Math.max(1, t.bottomY - t.topY));
      ctx.restore();
    }

    // Bodies
    const useGradient = this.options.candleGradient !== false;
    const topColor = useGradient ? lighten(bodyColor, 0.2) : bodyColor;
    const bottomColor = useGradient ? darken(bodyColor, 0.15) : bodyColor;

    if (!useGradient) ctx.fillStyle = bodyColor;

    for (const c of candles) {
      const progress = entranceByTime?.get(c.time) ?? 1;
      const cx = timeScale.timeToBitmapX(c.time);
      const openY = yScale.valueToBitmapY(c.open);
      const closeY = yScale.valueToBitmapY(c.close);
      const bodyTop = Math.min(openY, closeY);
      const bodyBottom = Math.max(openY, closeY);
      const bodyHeight = Math.max(1, bodyBottom - bodyTop);

      const needsTransform = progress < 1 && style !== 'none';

      let drawX = cx - halfBody;
      let drawTop = bodyTop;
      let drawHeight = bodyHeight;
      let alpha = 1;
      if (needsTransform) {
        const t = applyCandleTransform(progress, style, {
          x: cx - halfBody,
          barWidth,
          anchorY: openY,
          topY: bodyTop,
          bottomY: bodyBottom,
        });
        drawX = t.x;
        drawTop = t.topY;
        drawHeight = Math.max(1, t.bottomY - t.topY);
        alpha = t.alpha;
      }

      if (needsTransform) ctx.save();

      if (useGradient && drawHeight > 2) {
        const grad = ctx.createLinearGradient(0, drawTop, 0, drawTop + drawHeight);
        grad.addColorStop(0, topColor);
        grad.addColorStop(0.5, bodyColor);
        grad.addColorStop(1, bottomColor);
        ctx.fillStyle = grad;
      }

      if (needsTransform) ctx.globalAlpha = alpha;
      ctx.fillRect(drawX, drawTop, bodyWidth, drawHeight);
      if (needsTransform) ctx.restore();
    }
  }
}

interface CandleTransformInput {
  x: number;
  barWidth: number;
  /** Y-coordinate around which 'unfold' scales (typically openY). */
  anchorY: number;
  /** The unanimated top Y of the element (wick: highY; body: bodyTop). */
  topY: number;
  /** The unanimated bottom Y (wick: lowY; body: bodyBottom). */
  bottomY: number;
}

interface CandleTransformOutput {
  x: number;
  topY: number;
  bottomY: number;
  alpha: number;
}

/**
 * Map an entrance progress + style onto a candle element's geometry/alpha.
 * Centralized so adding a new style is one branch here instead of touching
 * every draw site.
 */
function applyCandleTransform(
  progress: number,
  style: NonNullable<CandlestickSeriesOptions['enterAnimation']>,
  g: CandleTransformInput,
): CandleTransformOutput {
  switch (style) {
    case 'none':
      return { x: g.x, topY: g.topY, bottomY: g.bottomY, alpha: 1 };
    case 'fade':
      return { x: g.x, topY: g.topY, bottomY: g.bottomY, alpha: progress };
    case 'unfold':
      return {
        x: g.x,
        topY: lerp(g.anchorY, g.topY, progress),
        bottomY: lerp(g.anchorY, g.bottomY, progress),
        alpha: 1,
      };
    case 'slide':
      return {
        x: g.x + (1 - progress) * g.barWidth,
        topY: g.topY,
        bottomY: g.bottomY,
        alpha: progress,
      };
    case 'fade-unfold':
      return {
        x: g.x,
        topY: lerp(g.anchorY, g.topY, progress),
        bottomY: lerp(g.anchorY, g.bottomY, progress),
        alpha: progress,
      };
  }
}

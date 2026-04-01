import { darkTheme } from "../theme/dark";
import type { ChartTheme } from "../theme/types";
import { detectInterval } from "../utils/time";
import { CanvasManager } from "./canvas-manager";
import { renderCrosshair } from "./components/crosshair";
import { renderGrid } from "./components/grid";
import { TimeSeriesStore } from "./data/store";
import { EventEmitter } from "./events";
import { InteractionHandler } from "./interactions/handler";
import { RenderScheduler } from "./render-scheduler";
import { PriceScale } from "./scales/price-scale";
import { TimeScale } from "./scales/time-scale";
import { BarRenderer } from "./series/bar";
import { CandlestickRenderer } from "./series/candlestick";
import { LineRenderer } from "./series/line";
import { StackedBarRenderer } from "./series/stacked-bar";
import type { SeriesRenderer } from "./series/types";
import type {
  BarSeriesOptions,
  CandlestickSeriesOptions,
  CanvasSize,
  CrosshairPosition,
  LineData,
  LineSeriesOptions,
  OHLCData,
  StackedBarSeriesOptions,
} from "./types";
import { Viewport } from "./viewport";

interface ChartEvents {
  crosshairMove: (pos: CrosshairPosition | null) => void;
  viewportChange: () => void;
  dataUpdate: () => void;
}

export interface ChartOptions {
  theme?: ChartTheme;
}

interface SeriesEntry {
  id: string;
  renderer: SeriesRenderer;
  store: TimeSeriesStore<any>;
}

let seriesIdCounter = 0;

export class ChartInstance extends EventEmitter<ChartEvents> {
  private container: HTMLElement;
  private canvasManager: CanvasManager;
  private viewport: Viewport;
  private mainScheduler: RenderScheduler;
  private overlayScheduler: RenderScheduler;
  readonly timeScale: TimeScale;
  readonly priceScale: PriceScale;
  private interactions: InteractionHandler;
  private series: SeriesEntry[] = [];
  private theme: ChartTheme;
  private dataInterval = 60;
  private crosshairPos: CrosshairPosition | null = null;
  private _previousClose: number | null = null;

  constructor(container: HTMLElement, options?: ChartOptions) {
    super();
    this.container = container;
    this.theme = options?.theme ?? darkTheme;

    this.canvasManager = new CanvasManager(container);
    this.viewport = new Viewport();
    this.timeScale = new TimeScale();
    this.priceScale = new PriceScale();
    this.mainScheduler = new RenderScheduler(() => this.renderMain());
    this.overlayScheduler = new RenderScheduler(() => this.renderOverlay());

    this.interactions = new InteractionHandler(
      this.canvasManager.canvas,
      this.viewport,
      this.timeScale,
      this.priceScale,
    );

    this.viewport.on("change", () => {
      this.updateScales();
      this.mainScheduler.markDirty();
      this.overlayScheduler.markDirty();
      this.emit("viewportChange");
    });

    this.canvasManager.on("resize", () => {
      // Render synchronously — canvas.width/height assignment clears the canvas,
      // so we must redraw immediately in the same frame to avoid a black flash.
      this.updateScales();
      this.renderMain();
    });

    this.interactions.on("crosshairMove", (pos) => {
      this.crosshairPos = pos;
      // Only redraw the overlay — main layer stays untouched
      this.overlayScheduler.markDirty();
      this.emit("crosshairMove", pos);
    });
  }

  addCandlestickSeries(options?: Partial<CandlestickSeriesOptions>): string {
    const store = new TimeSeriesStore<OHLCData>();
    const renderer = new CandlestickRenderer(store, {
      upColor: this.theme.candlestick.upColor,
      downColor: this.theme.candlestick.downColor,
      wickUpColor: this.theme.candlestick.wickUpColor,
      wickDownColor: this.theme.candlestick.wickDownColor,
      bodyWidthRatio: 0.6,
      ...options,
    });
    const id = `series_${++seriesIdCounter}`;
    store.on("update", () => {
      this.onDataChanged();
    });
    this.series.push({ id, renderer, store });
    return id;
  }

  addLineSeries(options?: Partial<LineSeriesOptions>): string {
    const store = new TimeSeriesStore<LineData>();
    const renderer = new LineRenderer(store, {
      color: this.theme.line.color,
      lineWidth: this.theme.line.width,
      areaFill: true,
      // Don't pass areaTopColor/areaBottomColor — let renderer derive from color
      ...options,
    });
    const id = `series_${++seriesIdCounter}`;
    store.on("update", () => {
      this.onDataChanged();
    });
    this.series.push({ id, renderer, store });
    return id;
  }

  addBarSeries(options?: Partial<BarSeriesOptions>): string {
    const store = new TimeSeriesStore<LineData>();
    const renderer = new BarRenderer(store, {
      positiveColor: this.theme.candlestick.upColor,
      negativeColor: this.theme.candlestick.downColor,
      barWidthRatio: 0.6,
      ...options,
    });
    const id = `series_${++seriesIdCounter}`;
    store.on("update", () => {
      this.onDataChanged();
    });
    this.series.push({ id, renderer, store });
    return id;
  }

  addStackedBarSeries(layerCount: number, options?: Partial<StackedBarSeriesOptions>): string {
    const renderer = new StackedBarRenderer(layerCount, {
      colors: this.theme.seriesColors.slice(0, layerCount),
      barWidthRatio: 0.6,
      ...options,
    });
    const id = `series_${++seriesIdCounter}`;
    // Listen to all stores
    for (const store of renderer.stores) {
      store.on("update", () => this.onDataChanged());
    }
    // Use first store as the "main" store for the series entry
    this.series.push({ id, renderer, store: renderer.stores[0] });
    return id;
  }

  setStackedBarData(id: string, layerIndex: number, data: LineData[]): void {
    const entry = this.series.find((s) => s.id === id);
    if (!entry || !(entry.renderer instanceof StackedBarRenderer)) return;
    const store = entry.renderer.stores[layerIndex];
    if (store) store.setData(data);
  }

  removeSeries(id: string): void {
    const idx = this.series.findIndex((s) => s.id === id);
    if (idx >= 0) {
      this.series[idx].store.removeAllListeners();
      this.series.splice(idx, 1);
      this.mainScheduler.markDirty();
    }
  }

  setSeriesData(id: string, data: OHLCData[] | LineData[]): void {
    const entry = this.series.find((s) => s.id === id);
    if (!entry) return;
    entry.store.setData(data);
  }

  appendData(id: string, point: OHLCData | LineData): void {
    const entry = this.series.find((s) => s.id === id);
    if (!entry) return;
    entry.store.append(point);
  }

  updateData(id: string, point: OHLCData | LineData): void {
    const entry = this.series.find((s) => s.id === id);
    if (!entry) return;
    entry.store.updateLast(point);
  }

  updateSeriesOptions(
    id: string,
    options: Partial<CandlestickSeriesOptions> | Partial<LineSeriesOptions> | Partial<BarSeriesOptions>,
  ): void {
    const entry = this.series.find((s) => s.id === id);
    if (!entry) return;
    if (entry.renderer instanceof CandlestickRenderer) {
      entry.renderer.updateOptions(options as Partial<CandlestickSeriesOptions>);
    } else if (entry.renderer instanceof LineRenderer) {
      entry.renderer.updateOptions(options as Partial<LineSeriesOptions>);
    } else if (entry.renderer instanceof BarRenderer) {
      entry.renderer.updateOptions(options as Partial<BarSeriesOptions>);
    } else if (entry.renderer instanceof StackedBarRenderer) {
      entry.renderer.updateOptions(options as Partial<StackedBarSeriesOptions>);
    }
    this.mainScheduler.markDirty();
  }

  fitContent(): void {
    const { first, last } = this.getDataBounds();
    if (first === undefined || last === undefined) return;
    this.viewport.fitToData(first, last);
  }

  getVisibleRange() {
    return this.viewport.visibleRange;
  }

  getPriceRange() {
    return this.viewport.priceRange;
  }

  getCrosshairPosition(): CrosshairPosition | null {
    return this.crosshairPos;
  }

  getLastPrice(seriesId: string): number | null {
    const entry = this.series.find((s) => s.id === seriesId);
    if (!entry) return null;
    const last = entry.store.last();
    if (!last) return null;
    return "close" in last ? (last as OHLCData).close : (last as LineData).value;
  }

  getPreviousClose(seriesId: string): number | null {
    const entry = this.series.find((s) => s.id === seriesId);
    if (!entry) return null;
    const all = entry.store.getAll();
    if (all.length < 2) return null;
    const prev = all[all.length - 2];
    return "close" in prev ? (prev as OHLCData).close : (prev as LineData).value;
  }

  getLastData(seriesId: string): OHLCData | LineData | null {
    const entry = this.series.find((s) => s.id === seriesId);
    if (!entry) return null;
    return entry.store.last() ?? null;
  }

  getDataAtTime(seriesId: string, time: number): OHLCData | LineData | null {
    const entry = this.series.find((s) => s.id === seriesId);
    if (!entry) return null;
    const data = entry.store.getVisibleData(time - this.dataInterval, time + this.dataInterval);
    if (data.length === 0) return null;
    let closest = data[0];
    let minDist = Math.abs(data[0].time - time);
    for (let i = 1; i < data.length; i++) {
      const dist = Math.abs(data[i].time - time);
      if (dist < minDist) {
        minDist = dist;
        closest = data[i];
      }
    }
    return closest;
  }

  getSeriesIds(): string[] {
    return this.series.map((s) => s.id);
  }

  setTheme(theme: ChartTheme): void {
    this.theme = theme;
    // Only update candlestick renderers — they always use theme colors.
    // Line renderers keep their individual colors (set via options prop).
    for (const entry of this.series) {
      if (entry.renderer instanceof CandlestickRenderer) {
        entry.renderer.updateOptions({
          upColor: theme.candlestick.upColor,
          downColor: theme.candlestick.downColor,
          wickUpColor: theme.candlestick.wickUpColor,
          wickDownColor: theme.candlestick.wickDownColor,
        });
      }
    }
    this.mainScheduler.markDirty();
  }

  getTheme(): ChartTheme {
    return this.theme;
  }

  getMediaSize() {
    return this.canvasManager.size.media;
  }

  getDataInterval(): number {
    return this.dataInterval;
  }

  destroy(): void {
    this.viewport.destroy();
    this.mainScheduler.destroy();
    this.overlayScheduler.destroy();
    this.interactions.destroy();
    this.canvasManager.destroy();
    this.removeAllListeners();
  }

  private getDataBounds(): { first: number | undefined; last: number | undefined } {
    let first: number | undefined;
    let last: number | undefined;
    for (const entry of this.series) {
      const f = entry.store.first();
      const l = entry.store.last();
      if (f && (first === undefined || f.time < first)) first = f.time;
      if (l && (last === undefined || l.time > last)) last = l.time;
    }
    return { first, last };
  }

  private prevDataLength = 0;

  private onDataChanged(): void {
    this.updateDataInterval();

    const { first, last } = this.getDataBounds();
    if (last !== undefined) {
      this.viewport.setDataEnd(last);
    }

    // Detect how much data changed — batch load vs single tick
    let totalLength = 0;
    for (const entry of this.series) {
      totalLength += entry.store.length;
    }
    const added = totalLength - this.prevDataLength;
    const isBatchLoad = added > 5;
    this.prevDataLength = totalLength;

    if (this.viewport.autoScroll && first !== undefined && last !== undefined) {
      if (this.viewport.visibleRange.from === 0 && this.viewport.visibleRange.to === 0) {
        this.viewport.fitToData(first, last, false);
      } else if (isBatchLoad) {
        this.viewport.fitToData(first, last, true);
      } else {
        this.viewport.scrollToEnd(last);
      }
    }

    // Snap price range on batch loads, smooth on ticks
    this.updatePriceRange(isBatchLoad);

    this.mainScheduler.markDirty();
    this.emit("dataUpdate");
  }

  private updateDataInterval(): void {
    for (const entry of this.series) {
      const all = entry.store.getAll();
      if (all.length >= 2) {
        const times = all.slice(0, 20).map((d: any) => d.time);
        this.dataInterval = detectInterval(times);
        this.viewport.setDataInterval(this.dataInterval);
        break;
      }
    }
  }

  private smoothMin = 0;
  private smoothMax = 0;
  private priceInited = false;

  private updatePriceRange(snap = false): void {
    let min = Infinity;
    let max = -Infinity;
    const range = this.viewport.visibleRange;

    for (const entry of this.series) {
      const visible = entry.store.getVisibleData(range.from, range.to);
      for (const point of visible) {
        if ("high" in point) {
          const ohlc = point as OHLCData;
          if (ohlc.high > max) max = ohlc.high;
          if (ohlc.low < min) min = ohlc.low;
        } else {
          const line = point as LineData;
          if (line.value > max) max = line.value;
          if (line.value < min) min = line.value;
        }
      }
    }

    if (min === Infinity || max === -Infinity) return;

    if (!this.priceInited || snap) {
      this.smoothMin = min;
      this.smoothMax = max;
      this.priceInited = true;
    } else {
      const speed = 0.2;
      this.smoothMin += (min - this.smoothMin) * speed;
      this.smoothMax += (max - this.smoothMax) * speed;
    }

    this.viewport.setPriceRange(this.smoothMin, this.smoothMax);
  }

  private updateScales(): void {
    const size = this.canvasManager.size;
    if (size.media.width === 0 || size.media.height === 0) return;

    const chartWidth = size.media.width - 70; // price axis
    const chartHeight = size.media.height - 30; // time axis

    this.timeScale.update(this.viewport.visibleRange, chartWidth, size.horizontalPixelRatio);
    this.priceScale.update(this.viewport.priceRange, chartHeight, size.verticalPixelRatio);
    this.updatePriceRange();
    this.priceScale.update(this.viewport.priceRange, chartHeight, size.verticalPixelRatio);
  }

  /** Expensive: background, grid, all series. Only on data/viewport/resize change. */
  private renderMain(): void {
    const size = this.canvasManager.size;
    if (size.media.width === 0 || size.media.height === 0) return;

    // Advance viewport animation in the same frame as render
    const stillAnimating = this.viewport.tick(performance.now());
    if (stillAnimating) {
      this.mainScheduler.markDirty();
      this.overlayScheduler.markDirty();
    }

    this.updateScales();

    this.canvasManager.useMainLayer((scope) => {
      const { context, bitmapSize } = scope;
      const chartBitmapWidth = (size.media.width - 70) * size.horizontalPixelRatio;
      const chartBitmapHeight = (size.media.height - 30) * size.verticalPixelRatio;

      // Full canvas gradient background
      const [gtop, gbot] = this.theme.chartGradient;
      const bgGrad = context.createLinearGradient(0, 0, 0, bitmapSize.height);
      bgGrad.addColorStop(0, gtop);
      bgGrad.addColorStop(0.7, this.theme.background);
      bgGrad.addColorStop(1, gbot);
      context.fillStyle = bgGrad;
      context.fillRect(0, 0, bitmapSize.width, bitmapSize.height);

      context.save();
      context.beginPath();
      context.rect(0, 0, chartBitmapWidth, chartBitmapHeight);
      context.clip();

      renderGrid(scope, this.timeScale, this.priceScale, this.theme, this.dataInterval);

      for (const entry of this.series) {
        entry.renderer.render({
          scope,
          timeScale: this.timeScale,
          priceScale: this.priceScale,
          theme: this.theme,
          dataInterval: this.dataInterval,
        });
      }

      context.restore();
    });

    // Keep rendering if any series needs animation (e.g. pulsing dots)
    for (const entry of this.series) {
      if (entry.renderer instanceof LineRenderer && entry.renderer.needsAnimation) {
        this.mainScheduler.markDirty();
        break;
      }
    }

    // Main layer changed — overlay needs to redraw on top
    this.renderOverlay();
  }

  /** Cheap: crosshair only. Redraws on every mousemove without touching series. */
  private renderOverlay(): void {
    const size = this.canvasManager.size;
    if (size.media.width === 0 || size.media.height === 0) return;

    this.canvasManager.useOverlayLayer((scope) => {
      if (!this.crosshairPos) return;

      const chartBitmapWidth = (size.media.width - 70) * size.horizontalPixelRatio;
      const chartBitmapHeight = (size.media.height - 30) * size.verticalPixelRatio;

      scope.context.save();
      scope.context.beginPath();
      scope.context.rect(0, 0, chartBitmapWidth, chartBitmapHeight);
      scope.context.clip();

      const bx = this.crosshairPos.mediaX * size.horizontalPixelRatio;
      const by = this.crosshairPos.mediaY * size.verticalPixelRatio;
      renderCrosshair(scope, bx, by, this.theme);

      scope.context.restore();
    });
  }
}

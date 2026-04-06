import { CanvasManager } from './canvas-manager';
import { renderCrosshair } from './components/crosshair';
import { renderGrid } from './components/grid';
import { TimeSeriesStore } from './data/store';
import { EventEmitter } from './events';
import { InteractionHandler } from './interactions/handler';
import { RenderScheduler } from './render-scheduler';
import { TimeScale } from './scales/time-scale';
import { YScale } from './scales/y-scale';
import { BarRenderer } from './series/bar';
import { CandlestickRenderer } from './series/candlestick';
import { LineRenderer } from './series/line';
import { PieRenderer } from './series/pie';
import type { SeriesRenderer } from './series/types';
import { darkTheme } from './theme/dark';
import type { ChartTheme } from './theme/types';
import type {
  AxisBound,
  AxisConfig,
  BarSeriesOptions,
  CandlestickSeriesOptions,
  CrosshairPosition,
  LineData,
  LineSeriesOptions,
  OHLCData,
  PieSeriesOptions,
  PieSliceData,
} from './types';
import { detectInterval } from './utils/time';
import { Viewport } from './viewport';

/** Events emitted by {@link ChartInstance}. */
interface ChartEvents {
  crosshairMove: (pos: CrosshairPosition | null) => void;
  viewportChange: () => void;
  dataUpdate: () => void;
  seriesChange: () => void;
}

/** Options passed when creating a new {@link ChartInstance}. */
export interface ChartOptions {
  theme?: ChartTheme;
  axis?: AxisConfig;
  /** Viewport padding: { top, right, bottom, left } in pixels (top/bottom) or bars (left/right). */
  padding?: { top?: number; right?: number; bottom?: number; left?: number };
  /** Enable zoom, pan, and crosshair interactions. Defaults to true. */
  interactive?: boolean;
  /** Show the background grid. Defaults to true. */
  grid?: boolean;
}

/** Internal bookkeeping for a registered series. */
interface SeriesEntry {
  id: string;
  label?: string;
  renderer: SeriesRenderer;
  /** Null for non-time-series types like Pie. */
  store: TimeSeriesStore<any> | null;
  visible: boolean;
}

let seriesIdCounter = 0;

/**
 * Core chart controller. Manages series, viewport, scales, and rendering.
 * Create one per chart container and call {@link destroy} on unmount.
 */
export class ChartInstance extends EventEmitter<ChartEvents> {
  /** Canvas lifecycle and DPR-aware sizing. */
  #canvasManager: CanvasManager;
  /** Manages visible range, Y range, panning, zooming, and animated transitions. */
  readonly #viewport: Viewport;
  /** Schedules main-layer redraws (background, grid, series). */
  #mainScheduler: RenderScheduler;
  /** Schedules overlay redraws (crosshair). */
  #overlayScheduler: RenderScheduler;
  /** Maps time values to horizontal pixel coordinates. */
  readonly timeScale: TimeScale;
  /** Maps price/value to vertical pixel coordinates. */
  readonly yScale: YScale;
  /** Zoom, pan, crosshair — null when interactive=false. */
  #interactions: InteractionHandler | null;
  /** All registered series (candlestick, line, bar, pie). */
  #series: SeriesEntry[] = [];
  /** Active visual theme (colors, fonts, grid style). */
  #theme: ChartTheme;
  /** Whether to render the background grid. */
  readonly #grid: boolean;
  /** Detected time interval between data points (seconds). */
  #dataInterval = 60;
  /** Current crosshair position, null when cursor is outside the chart. */
  #crosshairPos: CrosshairPosition | null = null;
  /** User-specified Y-axis bounds (auto, fixed, percentage). */
  #yBounds: { min?: AxisBound; max?: AxisBound } = {};
  /** Cached series ID list — invalidated on add/remove. */
  #seriesIdCache: string[] | null = null;
  /** Whether a YLabel overlay is active (used for right-padding calculation). */
  #hasYLabel = false;
  /** Axis visibility and sizing configuration. */
  #axis: AxisConfig = {};
  /** Nesting depth for beginUpdate/endUpdate. Suppresses recomputes while > 0. */
  #batchDepth = 0;
  /** True when batched operations include data changes (triggers full onDataChanged on end). */
  #batchDataDirty = false;
  /** True when batched operations include visibility changes (triggers Y-range + redraw on end). */
  #batchVisualDirty = false;

  get yAxisWidth(): number {
    const y = this.#axis.y;
    return y?.visible === false ? 0 : (y?.width ?? 55);
  }

  get xAxisHeight(): number {
    const x = this.#axis.x;
    return x?.visible === false ? 0 : (x?.height ?? 30);
  }

  constructor(container: HTMLElement, options?: ChartOptions) {
    super();
    // Support both new `axis` API and legacy flat props
    if (options?.axis) {
      this.#axis = options.axis;
      this.#yBounds = { min: options.axis.y?.min, max: options.axis.y?.max };
    }
    this.#theme = options?.theme ?? darkTheme;
    this.#grid = options?.grid !== false;

    this.#canvasManager = new CanvasManager(container);
    this.#viewport = new Viewport({ padding: options?.padding });
    this.timeScale = new TimeScale();
    this.yScale = new YScale();
    this.#mainScheduler = new RenderScheduler(() => this.renderMain());
    this.#overlayScheduler = new RenderScheduler(() => this.renderOverlay());

    const interactive = options?.interactive !== false;
    this.#interactions = interactive
      ? new InteractionHandler(this.#canvasManager.canvas, this.#viewport, this.timeScale, this.yScale)
      : null;

    this.#viewport.on('change', () => {
      // Sync scales immediately so DOM axis components (TimeAxis, YAxis) read
      // fresh coordinates when viewportChange triggers their re-render.
      // Does NOT advance Y smoothing — that only happens inside renderMain().
      this.syncScales();
      this.#mainScheduler.markDirty();
      this.emit('viewportChange');
    });

    this.#canvasManager.on('resize', () => {
      // Snap Y range on resize — canvas dimensions changed structurally,
      // smooth lerp would cause visible drift across frames.
      this.updateYRange(true);
      // Render synchronously — canvas.width/height assignment clears the canvas,
      // so we must redraw immediately in the same frame to avoid a black flash.
      this.updateScales();
      this.renderMain();
    });

    this.#interactions?.on('crosshairMove', (pos) => {
      this.#crosshairPos = pos;
      this.#overlayScheduler.markDirty();
      this.emit('crosshairMove', pos);

      // Update pie hover state
      this.updatePieHover(pos);
    });
  }

  /** Add a candlestick (OHLC) series and return its unique ID. */
  addCandlestickSeries(options?: Partial<CandlestickSeriesOptions>): string {
    const store = new TimeSeriesStore<OHLCData>();
    const renderer = new CandlestickRenderer(store, {
      upColor: this.#theme.candlestick.upColor,
      downColor: this.#theme.candlestick.downColor,
      wickUpColor: this.#theme.candlestick.wickUpColor,
      wickDownColor: this.#theme.candlestick.wickDownColor,
      bodyWidthRatio: 0.6,
      ...options,
    });
    const id = `series_${++seriesIdCounter}`;
    store.on('update', () => {
      this.onDataChanged();
    });
    this.#series.push({ id, renderer, store, visible: true });
    this.#seriesIdCache = null;
    this.updateViewportPadding();
    this.emit('seriesChange');
    return id;
  }

  /** Add a line series and return its unique ID. */
  addLineSeries(layerCount: number, options?: Partial<LineSeriesOptions>): string {
    const renderer = new LineRenderer(layerCount, {
      colors: layerCount === 1 ? [this.#theme.line.color] : this.#theme.seriesColors.slice(0, layerCount),
      lineWidth: this.#theme.line.width,
      areaFill: true,
      ...options,
    });
    const id = `series_${++seriesIdCounter}`;
    for (const store of renderer.stores) {
      store.on('update', () => this.onDataChanged());
    }
    this.#series.push({ id, label: options?.label, renderer, store: renderer.stores[0], visible: true });
    this.#seriesIdCache = null;
    this.updateViewportPadding();
    this.emit('seriesChange');
    return id;
  }

  /** Set data for a specific layer within a line series. */
  setLineLayerData(id: string, layerIndex: number, data: LineData[]): void {
    const entry = this.#series.find((s) => s.id === id);
    if (!entry || !(entry.renderer instanceof LineRenderer)) return;
    const store = entry.renderer.stores[layerIndex];
    if (store) store.setData(data);
  }

  /** Add a bar series and return its unique ID. */
  addBarSeries(layerCount: number, options?: Partial<BarSeriesOptions>): string {
    const renderer = new BarRenderer(layerCount, {
      colors: this.#theme.seriesColors.slice(0, layerCount),
      barWidthRatio: 0.6,
      ...options,
    });
    const id = `series_${++seriesIdCounter}`;
    for (const store of renderer.stores) {
      store.on('update', () => this.onDataChanged());
    }
    this.#series.push({ id, renderer, store: renderer.stores[0], visible: true });
    this.#seriesIdCache = null;
    this.updateViewportPadding();
    this.emit('seriesChange');
    return id;
  }

  /** Set data for a specific layer within a bar series. */
  setBarLayerData(id: string, layerIndex: number, data: LineData[]): void {
    const entry = this.#series.find((s) => s.id === id);
    if (!entry || !(entry.renderer instanceof BarRenderer)) return;
    const store = entry.renderer.stores[layerIndex];
    if (store) store.setData(data);
  }

  /** Add a pie/donut series. Set `innerRadiusRatio > 0` for donut. */
  addPieSeries(options?: Partial<PieSeriesOptions>): string {
    const renderer = new PieRenderer(options);
    const id = `series_${++seriesIdCounter}`;
    this.#series.push({ id, label: options?.label, renderer, store: null, visible: true });
    this.#seriesIdCache = null;
    this.updateViewportPadding();
    this.emit('seriesChange');
    return id;
  }

  /** Set data for a pie/donut series. */
  setPieData(id: string, data: PieSliceData[]): void {
    const entry = this.#series.find((s) => s.id === id);
    if (!entry || !(entry.renderer instanceof PieRenderer)) return;
    entry.renderer.setData(data);
    this.#mainScheduler.markDirty();
    this.emit('dataUpdate');
  }

  /** Remove a series by ID and clean up its resources. */
  removeSeries(id: string): void {
    const idx = this.#series.findIndex((s) => s.id === id);
    if (idx >= 0) {
      const { renderer, store } = this.#series[idx];
      // Remove listeners from ALL stores (multi-layer series have stores[1..n] too)
      if (renderer instanceof LineRenderer || renderer instanceof BarRenderer) {
        for (const s of renderer.stores) s.removeAllListeners();
      } else {
        store?.removeAllListeners();
      }
      this.#series.splice(idx, 1);
      this.#seriesIdCache = null;
      this.updateViewportPadding();
      this.#mainScheduler.markDirty();
      this.emit('seriesChange');
    }
  }

  /** Replace all data for a series (batch load). */
  setSeriesData(id: string, data: OHLCData[] | LineData[]): void {
    const entry = this.#series.find((s) => s.id === id);
    if (!entry?.store) return;
    entry.store.setData(data);
  }

  /** Append a new data point to the end of a series (real-time tick). */
  appendData(id: string, point: OHLCData | LineData): void {
    const entry = this.#series.find((s) => s.id === id);
    if (!entry?.store) return;
    entry.store.append(point);
  }

  /** Update the last data point of a series in place (e.g. live candle update). */
  updateData(id: string, point: OHLCData | LineData): void {
    const entry = this.#series.find((s) => s.id === id);
    if (!entry?.store) return;
    entry.store.updateLast(point);
  }

  /** Update visual options (color, width, etc.) for an existing series. */
  updateSeriesOptions(
    id: string,
    options: Partial<CandlestickSeriesOptions> | Partial<LineSeriesOptions> | Partial<BarSeriesOptions>,
  ): void {
    const entry = this.#series.find((s) => s.id === id);
    if (!entry) return;
    if (entry.renderer instanceof CandlestickRenderer) {
      entry.renderer.updateOptions(options as Partial<CandlestickSeriesOptions>);
    } else if (entry.renderer instanceof LineRenderer) {
      entry.renderer.updateOptions(options as Partial<LineSeriesOptions>);
    } else if (entry.renderer instanceof BarRenderer) {
      entry.renderer.updateOptions(options as Partial<BarSeriesOptions>);
    } else if (entry.renderer instanceof PieRenderer) {
      entry.renderer.updateOptions(options as Partial<PieSeriesOptions>);
    }
    this.#mainScheduler.markDirty();
  }

  /** Suppress recomputes until endUpdate(). Calls can nest. */
  beginUpdate(): void {
    this.#batchDepth++;
  }

  endUpdate(): void {
    if (--this.#batchDepth <= 0) {
      this.#batchDepth = 0;
      if (this.#batchDataDirty) {
        this.#batchDataDirty = false;
        this.#batchVisualDirty = false;
        this.onDataChanged();
      } else if (this.#batchVisualDirty) {
        this.#batchVisualDirty = false;
        this.updateYRange(true);
        this.#mainScheduler.markDirty();
      }
    }
  }

  /** Show or hide a series. Hidden series are not rendered and excluded from Y-range. */
  setSeriesVisible(seriesId: string, visible: boolean): void {
    const entry = this.#series.find((s) => s.id === seriesId);
    if (!entry || entry.visible === visible) return;
    entry.visible = visible;
    if (this.#batchDepth > 0) {
      this.#batchVisualDirty = true;
      return;
    }
    this.updateYRange(true);
    this.#mainScheduler.markDirty();
  }

  isSeriesVisible(seriesId: string): boolean {
    return this.#series.find((s) => s.id === seriesId)?.visible ?? true;
  }

  /** Show or hide a specific layer within a multi-layer series. */
  setLayerVisible(seriesId: string, layerIndex: number, visible: boolean): void {
    const entry = this.#series.find((s) => s.id === seriesId);
    if (!entry) return;
    const renderer = entry.renderer;
    if (renderer instanceof BarRenderer || renderer instanceof LineRenderer) {
      const store = renderer.stores[layerIndex];
      if (store) {
        if (store.isVisible() === visible) return;
        store.setVisible(visible);
        if (this.#batchDepth > 0) {
          this.#batchVisualDirty = true;
          return;
        }
        this.updateYRange(true);
        this.#mainScheduler.markDirty();
      }
    }
  }

  isLayerVisible(seriesId: string, layerIndex: number): boolean {
    const entry = this.#series.find((s) => s.id === seriesId);
    if (!entry) return true;
    const renderer = entry.renderer;
    if (renderer instanceof BarRenderer || renderer instanceof LineRenderer) {
      return renderer.stores[layerIndex]?.isVisible() ?? true;
    }
    return true;
  }

  /** Auto-fit the viewport to show all data across every series. */
  fitContent(): void {
    const { first, last } = this.getDataBounds();
    if (first === undefined || last === undefined) return;
    this.#viewport.fitToData(first, last, true);
  }

  getVisibleRange() {
    return this.#viewport.visibleRange;
  }

  getYRange() {
    return this.#viewport.yRange;
  }

  getCrosshairPosition(): CrosshairPosition | null {
    return this.#crosshairPos;
  }

  /** Get the last visible value and whether the absolute last point is on screen. */
  getLastValue(seriesId: string): { value: number; isLive: boolean } | null {
    const entry = this.#series.find((s) => s.id === seriesId);
    if (!entry?.store) return null;

    const last = entry.store.last();
    if (!last) return null;

    const extractValue = (p: any): number => ('close' in p ? (p as OHLCData).close : (p as LineData).value);

    const { from, to } = this.#viewport.visibleRange;

    // Absolute last is on screen
    if (last.time >= from && last.time <= to) {
      return { value: extractValue(last), isLive: true };
    }

    // Find the last visible point
    const visible = entry.store.getVisibleData(from, to);
    if (visible.length === 0) return null;
    return { value: extractValue(visible[visible.length - 1]), isLive: false };
  }

  /** Get the second-to-last value, useful for computing change. */
  getPreviousClose(seriesId: string): number | null {
    const entry = this.#series.find((s) => s.id === seriesId);
    if (!entry?.store) return null;
    const all = entry.store.getAll();
    if (all.length < 2) return null;
    const prev = all[all.length - 2];
    return 'close' in prev ? (prev as OHLCData).close : (prev as LineData).value;
  }

  getLastData(seriesId: string): OHLCData | LineData | null {
    const entry = this.#series.find((s) => s.id === seriesId);
    if (!entry?.store) return null;
    return entry.store.last() ?? null;
  }

  /** Find the data point closest to the given timestamp within one data interval. */
  getDataAtTime(seriesId: string, time: number): OHLCData | LineData | null {
    const entry = this.#series.find((s) => s.id === seriesId);
    if (!entry?.store) return null;
    const data = entry.store.getVisibleData(time - this.#dataInterval, time + this.#dataInterval);
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

  /** Get all layers' data at a given time for multi-layer series (Bar/Line with stacking). */
  getLayerSnapshots(seriesId: string, time: number): { value: number; color: string }[] | null {
    const entry = this.#series.find((s) => s.id === seriesId);
    if (!entry || !entry.visible) return null;
    const renderer = entry.renderer;
    if (!(renderer instanceof BarRenderer) && !(renderer instanceof LineRenderer)) return null;
    if (renderer.stores.length <= 1) return null;

    const colors = (renderer as BarRenderer | LineRenderer).getColors();
    const results: { value: number; color: string }[] = [];
    for (let li = 0; li < renderer.stores.length; li++) {
      if (!renderer.stores[li].isVisible()) continue;
      const data = renderer.stores[li].getVisibleData(time - this.#dataInterval, time + this.#dataInterval);
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
      results.push({
        value: closest.value,
        color: colors?.[li % (colors?.length ?? 1)] ?? this.#theme.seriesColors[li % this.#theme.seriesColors.length],
      });
    }
    return results.length > 0 ? results : null;
  }

  getSeriesIds(): string[] {
    if (!this.#seriesIdCache) {
      this.#seriesIdCache = this.#series.map((s) => s.id);
    }
    return this.#seriesIdCache.slice();
  }

  /** Get the primary display color for a series. */
  getSeriesColor(seriesId: string): string | null {
    const entry = this.#series.find((s) => s.id === seriesId);
    if (!entry) return null;
    if ('getColor' in entry.renderer && typeof entry.renderer.getColor === 'function') {
      return (entry.renderer as any).getColor();
    }
    return this.#theme.line.color;
  }

  getSeriesLabel(seriesId: string): string | undefined {
    return this.#series.find((s) => s.id === seriesId)?.label;
  }

  /** Get per-layer colors for a series. Returns null for non-bar/line series (e.g. candlestick, pie). */
  getSeriesLayers(seriesId: string): { color: string }[] | null {
    const entry = this.#series.find((s) => s.id === seriesId);
    if (!entry) return null;
    const renderer = entry.renderer;
    if (!(renderer instanceof BarRenderer) && !(renderer instanceof LineRenderer)) return null;
    const colors = renderer.getColors();
    return renderer.stores.map((_, i) => ({
      color: colors[i % colors.length],
    }));
  }

  /** Get all pie slices with computed colors and percentages. Returns null for non-pie series. */
  getPieSlices(seriesId: string): { label: string; value: number; percent: number; color: string }[] | null {
    const entry = this.#series.find((s) => s.id === seriesId);
    if (!entry || !(entry.renderer instanceof PieRenderer)) return null;
    const data = entry.renderer.getData();
    if (data.length === 0) return null;
    const total = data.reduce((sum, d) => sum + d.value, 0);
    const palette = this.#theme.seriesColors;
    return data.map((d, i) => ({
      label: d.label,
      value: d.value,
      percent: total > 0 ? (d.value / total) * 100 : 0,
      color: d.color ?? palette[i % palette.length],
    }));
  }

  /** Get the hovered pie slice info (label, value, percentage, color). Returns null if no hover. */
  getPieHoverInfo(seriesId: string): { label: string; value: number; percent: number; color: string } | null {
    const entry = this.#series.find((s) => s.id === seriesId);
    if (!entry || !(entry.renderer instanceof PieRenderer)) return null;
    const renderer = entry.renderer;
    if (renderer.hoverIndex < 0) return null;
    const data = renderer.getData();
    const slice = data[renderer.hoverIndex];
    if (!slice) return null;
    const total = data.reduce((sum, d) => sum + d.value, 0);
    const palette = this.#theme.seriesColors;
    return {
      label: slice.label,
      value: slice.value,
      percent: total > 0 ? (slice.value / total) * 100 : 0,
      color: slice.color ?? palette[renderer.hoverIndex % palette.length],
    };
  }

  /** Apply a new theme and update candlestick series colors. Line series keep their individual colors. */
  setTheme(theme: ChartTheme): void {
    const oldLineColor = this.#theme.line.color;
    this.#theme = theme;
    for (const entry of this.#series) {
      if (entry.renderer instanceof CandlestickRenderer) {
        entry.renderer.updateOptions({
          upColor: theme.candlestick.upColor,
          downColor: theme.candlestick.downColor,
          wickUpColor: theme.candlestick.wickUpColor,
          wickDownColor: theme.candlestick.wickDownColor,
        });
      } else if (entry.renderer instanceof BarRenderer) {
        entry.renderer.updateOptions({
          colors: theme.seriesColors.slice(0, entry.renderer.stores.length),
        });
      } else if (entry.renderer instanceof LineRenderer) {
        if (entry.renderer.stores.length === 1) {
          // Single-layer: update color if it matches old theme default
          if (entry.renderer.getColor() === oldLineColor) {
            entry.renderer.updateOptions({ colors: [theme.line.color] });
          }
        } else {
          entry.renderer.updateOptions({
            colors: theme.seriesColors.slice(0, entry.renderer.stores.length),
          });
        }
      }
    }
    this.#mainScheduler.markDirty();
  }

  getTheme(): ChartTheme {
    return this.#theme;
  }

  /** Update axis configuration and re-render. */
  setAxis(config: AxisConfig): void {
    const prevYW = this.yAxisWidth;
    const prevXH = this.xAxisHeight;
    this.#axis = config;
    // Sync Y bounds from axis config
    const newBounds: { min?: AxisBound; max?: AxisBound } = { min: config.y?.min, max: config.y?.max };
    this.#yBounds = newBounds;
    this.#yInited = false;
    this.updateYRange(true);
    if (this.yAxisWidth !== prevYW || this.xAxisHeight !== prevXH) {
      this.updateScales();
    }
    this.#mainScheduler.markDirty();
  }

  getMediaSize() {
    return this.#canvasManager.size.media;
  }

  getDataInterval(): number {
    return this.#dataInterval;
  }

  /** Notify chart that a YLabel is present (affects right padding). */
  setYLabel(has: boolean): void {
    this.#hasYLabel = has;
    this.updateViewportPadding();
  }

  private updatePieHover(pos: CrosshairPosition | null): void {
    const size = this.#canvasManager.size;
    for (const entry of this.#series) {
      if (entry.renderer instanceof PieRenderer) {
        const prevIndex = entry.renderer.hoverIndex;
        if (pos) {
          const bx = pos.mediaX * size.horizontalPixelRatio;
          const by = pos.mediaY * size.verticalPixelRatio;
          entry.renderer.hoverIndex = entry.renderer.hitTest(bx, by, size.bitmap.width, size.bitmap.height);
        } else {
          entry.renderer.hoverIndex = -1;
        }
        if (entry.renderer.hoverIndex !== prevIndex) {
          this.#mainScheduler.markDirty();
        }
      }
    }
  }

  private updateViewportPadding(): void {
    // TODO: auto-detect padding from series types
  }

  /** Tear down the chart: cancel animations, remove listeners, and detach the canvas. */
  destroy(): void {
    this.#viewport.destroy();
    this.#mainScheduler.destroy();
    this.#overlayScheduler.destroy();
    this.#interactions?.destroy();
    this.#canvasManager.destroy();
    this.removeAllListeners();
  }

  /** Compute the earliest and latest timestamps across all series. */
  private getDataBounds(): { first: number | undefined; last: number | undefined } {
    let first: number | undefined;
    let last: number | undefined;
    for (const entry of this.#series) {
      if (!entry.visible) continue;
      if (!entry.store) continue;
      const f = entry.store.first();
      const l = entry.store.last();
      if (f && (first === undefined || f.time < first)) first = f.time;
      if (l && (last === undefined || l.time > last)) last = l.time;
    }
    return { first, last };
  }

  /** Total data points across all series at last onDataChanged — used to detect batch vs tick. */
  #prevDataLength = 0;

  private onDataChanged(): void {
    if (this.#batchDepth > 0) {
      this.#batchDataDirty = true;
      return;
    }

    this.updateDataInterval();

    const { first, last } = this.getDataBounds();
    if (first !== undefined) this.#viewport.setDataStart(first);
    if (last !== undefined) this.#viewport.setDataEnd(last);

    // Detect how much data changed — batch load vs single tick
    let totalLength = 0;
    for (const entry of this.#series) {
      // Multi-layer series (Line/Bar) have multiple stores; count them all
      if (entry.renderer instanceof LineRenderer || entry.renderer instanceof BarRenderer) {
        for (const s of entry.renderer.stores) totalLength += s.length;
      } else if (entry.store) {
        totalLength += entry.store.length;
      }
    }
    const added = totalLength - this.#prevDataLength;
    const isBatchLoad = added > 5;
    this.#prevDataLength = totalLength;

    if (first !== undefined && last !== undefined) {
      const { from, to } = this.#viewport.visibleRange;
      const uninitialized = from === 0 && to === 0;

      if (uninitialized) {
        // First data load — fit immediately
        this.#viewport.fitToData(first, last, false);
      } else if (isBatchLoad && this.#viewport.autoScroll) {
        this.#viewport.fitToData(first, last, true);
      } else if (!isBatchLoad && this.isLastPointVisible()) {
        // Realtime tick: only scroll if the last point is currently on screen
        this.#viewport.scrollToEnd(last);
      }
    }

    // Snap Y range on batch loads, smooth on ticks
    this.updateYRange(isBatchLoad);
    // Re-sync scales so React components read correct yScale values.
    // The earlier viewport 'change' (from fitToData) fired before updateYRange,
    // so yScale was stale at that point.
    this.syncScales();

    this.#mainScheduler.markDirty();
    this.emit('dataUpdate');
  }

  /** Check whether the last data point of any series falls within the visible time range. */
  private isLastPointVisible(): boolean {
    const { from, to } = this.#viewport.visibleRange;
    for (const entry of this.#series) {
      if (!entry.visible) continue;
      if (!entry.store) continue;
      const last = entry.store.last();
      if (last && last.time >= from && last.time <= to) return true;
    }
    return false;
  }

  private updateDataInterval(): void {
    for (const entry of this.#series) {
      if (!entry.store) continue;
      const all = entry.store.getAll();
      if (all.length >= 2) {
        const times = all.slice(0, 20).map((d: any) => d.time);
        this.#dataInterval = detectInterval(times);
        this.#viewport.setDataInterval(this.#dataInterval);
        break;
      }
    }
  }

  /** Smoothed Y-axis minimum for animated transitions. */
  #smoothMin = 0;
  /** Smoothed Y-axis maximum for animated transitions. */
  #smoothMax = 0;
  /** Whether the Y range has been initialized (first snap vs smooth lerp). */
  #yInited = false;

  private updateYRange(snap = false): void {
    let min = Infinity;
    let max = -Infinity;
    const range = this.#viewport.visibleRange;
    // Only collect individual values when bounds use a function/percentage (rare)
    const needsAllValues =
      (this.#yBounds.min !== undefined && this.#yBounds.min !== 'auto' && typeof this.#yBounds.min !== 'number') ||
      (this.#yBounds.max !== undefined && this.#yBounds.max !== 'auto' && typeof this.#yBounds.max !== 'number');
    let allValues: number[] | null = needsAllValues ? [] : null;

    for (const entry of this.#series) {
      if (!entry.visible) continue;

      // If the renderer provides a custom value range (e.g. stacked totals), use it
      if (entry.renderer.getValueRange) {
        const r = entry.renderer.getValueRange(range.from, range.to);
        if (r) {
          if (r.max > max) max = r.max;
          if (r.min < min) min = r.min;
          allValues?.push(r.min, r.max);
          continue;
        }
      }
      if (!entry.store) continue;
      const visible = entry.store.getVisibleData(range.from, range.to);
      for (const point of visible) {
        if ('high' in point) {
          const ohlc = point as OHLCData;
          if (ohlc.high > max) max = ohlc.high;
          if (ohlc.low < min) min = ohlc.low;
          allValues?.push(ohlc.high, ohlc.low);
        } else {
          const line = point as LineData;
          if (line.value > max) max = line.value;
          if (line.value < min) min = line.value;
          allValues?.push(line.value);
        }
      }
    }

    if (min === Infinity || max === -Infinity) {
      // No visible data — force a snap on next data appearance so stale range isn't reused
      this.#yInited = false;
      return;
    }

    // Apply Y bounds
    min = this.resolveBound(this.#yBounds.min, min, max, allValues ?? [], 'min');
    max = this.resolveBound(this.#yBounds.max, max, min, allValues ?? [], 'max');

    if (!this.#yInited || snap) {
      this.#smoothMin = min;
      this.#smoothMax = max;
      this.#yInited = true;
    } else {
      const speed = 0.2;
      this.#smoothMin += (min - this.#smoothMin) * speed;
      this.#smoothMax += (max - this.#smoothMax) * speed;
      // Never clip data — expand immediately if data exceeds smooth range
      if (min < this.#smoothMin) this.#smoothMin = min;
      if (max > this.#smoothMax) this.#smoothMax = max;
      // Keep rendering until Y range has converged
      const eps = Math.max(Math.abs(this.#smoothMax - this.#smoothMin) * 0.0001, 0.001);
      if (Math.abs(this.#smoothMin - min) > eps || Math.abs(this.#smoothMax - max) > eps) {
        this.#mainScheduler.markDirty();
      }
    }

    // Only add padding for sides without explicit bounds
    const hasMinBound = this.#yBounds.min !== undefined && this.#yBounds.min !== 'auto';
    const hasMaxBound = this.#yBounds.max !== undefined && this.#yBounds.max !== 'auto';
    const chartHeight = this.#canvasManager.size.media.height - this.xAxisHeight;
    this.#viewport.setYRange(this.#smoothMin, this.#smoothMax, chartHeight, hasMinBound, hasMaxBound);
  }

  /** Resolve an {@link AxisBound} to a concrete numeric value. */
  private resolveBound(
    bound: AxisBound | undefined,
    autoValue: number,
    otherValue: number,
    values: number[],
    side: 'min' | 'max',
  ): number {
    if (bound === undefined || bound === 'auto') return autoValue;
    if (typeof bound === 'number') return bound;
    if (typeof bound === 'function') return bound(values);
    // Parse percentage string like "+10%", "-5%"
    const match = String(bound).match(/^([+-]?)\s*(\d+(?:\.\d+)?)\s*%$/);
    if (match) {
      const sign = match[1] === '-' ? -1 : 1;
      const pct = parseFloat(match[2]) / 100;
      const dataRange = Math.abs(otherValue - autoValue) || Math.abs(autoValue) || 1;
      return autoValue + sign * pct * dataRange * (side === 'max' ? 1 : -1);
    }
    return autoValue;
  }

  /**
   * Lightweight scale sync: updates timeScale/yScale from current viewport state
   * without advancing the Y smoothing animation. Called from the viewport 'change'
   * handler so DOM axis components always read fresh coordinates on re-render.
   */
  private syncScales(): void {
    const size = this.#canvasManager.size;
    if (size.media.width === 0 || size.media.height === 0) return;

    const chartWidth = size.media.width - this.yAxisWidth;
    const chartHeight = size.media.height - this.xAxisHeight;

    this.timeScale.update(this.#viewport.visibleRange, chartWidth, size.horizontalPixelRatio);
    this.yScale.update(this.#viewport.yRange, chartHeight, size.verticalPixelRatio);
  }

  private updateScales(): void {
    const size = this.#canvasManager.size;
    if (size.media.width === 0 || size.media.height === 0) return;

    const chartWidth = size.media.width - this.yAxisWidth; // Y axis
    const chartHeight = size.media.height - this.xAxisHeight; // time axis

    this.timeScale.update(this.#viewport.visibleRange, chartWidth, size.horizontalPixelRatio);
    this.yScale.update(this.#viewport.yRange, chartHeight, size.verticalPixelRatio);
    this.updateYRange();
    this.yScale.update(this.#viewport.yRange, chartHeight, size.verticalPixelRatio);
  }

  /** Expensive: background, grid, all series. Only on data/viewport/resize change. */
  private renderMain(): void {
    const size = this.#canvasManager.size;
    if (size.media.width === 0 || size.media.height === 0) return;

    // Advance viewport animation in the same frame as render
    const stillAnimating = this.#viewport.tick(performance.now());
    if (stillAnimating) {
      this.#mainScheduler.markDirty();
    }

    this.updateScales();

    this.#canvasManager.useMainLayer((scope) => {
      const { context, bitmapSize } = scope;
      const chartBitmapWidth = (size.media.width - this.yAxisWidth) * size.horizontalPixelRatio;
      const chartBitmapHeight = (size.media.height - this.xAxisHeight) * size.verticalPixelRatio;

      // Clear canvas (background gradient is applied via CSS on the container)
      context.clearRect(0, 0, bitmapSize.width, bitmapSize.height);

      context.save();
      context.beginPath();
      context.rect(0, 0, chartBitmapWidth, chartBitmapHeight);
      context.clip();

      if (this.#grid) {
        renderGrid(scope, this.timeScale, this.yScale, this.#theme, this.#dataInterval);
      }

      for (const entry of this.#series) {
        if (!entry.visible) continue;
        entry.renderer.render({
          scope,
          timeScale: this.timeScale,
          yScale: this.yScale,
          theme: this.#theme,
          dataInterval: this.#dataInterval,
        });
      }

      context.restore();
    });

    // Keep rendering while pie hover animation is in progress
    for (const entry of this.#series) {
      if (entry.renderer instanceof PieRenderer && entry.renderer.needsAnimation) {
        this.#mainScheduler.markDirty();
        break;
      }
    }

    // Main layer changed — overlay needs to redraw on top
    this.renderOverlay();
  }

  /** Cheap overlay: crosshair, nearest-point dots, pulse animation. */
  private renderOverlay(): void {
    const size = this.#canvasManager.size;
    if (size.media.width === 0 || size.media.height === 0) return;

    // Check if any line series needs pulse animation
    let hasPulse = false;
    for (const entry of this.#series) {
      if (entry.visible && entry.renderer instanceof LineRenderer && entry.renderer.hasPulse) {
        hasPulse = true;
        break;
      }
    }

    this.#canvasManager.useOverlayLayer((scope) => {
      // Guard inside callback — useOverlayLayer clears the canvas first,
      // so we must always enter it to erase stale crosshair/dots on mouseleave.
      if (!this.#crosshairPos && !hasPulse) return;

      const chartBitmapWidth = (size.media.width - this.yAxisWidth) * size.horizontalPixelRatio;
      const chartBitmapHeight = (size.media.height - this.xAxisHeight) * size.verticalPixelRatio;

      scope.context.save();
      scope.context.beginPath();
      scope.context.rect(0, 0, chartBitmapWidth, chartBitmapHeight);
      scope.context.clip();

      // Crosshair + nearest-point dots
      if (this.#crosshairPos) {
        const bx = this.#crosshairPos.mediaX * size.horizontalPixelRatio;
        const by = this.#crosshairPos.mediaY * size.verticalPixelRatio;
        renderCrosshair(scope, bx, by, this.#theme);

        for (const entry of this.#series) {
          if (!entry.visible) continue;
          if (entry.renderer instanceof LineRenderer) {
            const renderer = entry.renderer as LineRenderer;
            const colors = renderer.getColors();
            const stacking = renderer.getStacking();
            const r = 4 * size.horizontalPixelRatio;

            const layerValues: number[] = [];
            const layerTimes: number[] = [];
            for (let li = 0; li < renderer.stores.length; li++) {
              const closest = renderer.stores[li].findNearest(this.#crosshairPos!.time, this.#dataInterval);
              if (!closest) {
                layerValues.push(0);
                layerTimes.push(0);
              } else {
                layerValues.push(closest.value);
                layerTimes.push(closest.time);
              }
            }

            const displayValues: number[] = [];
            if (stacking === 'off') {
              for (const v of layerValues) displayValues.push(v);
            } else {
              let total = 0;
              if (stacking === 'percent') {
                for (const v of layerValues) total += v;
              }
              let running = 0;
              for (const v of layerValues) {
                running += stacking === 'percent' && total > 0 ? (v / total) * 100 : v;
                displayValues.push(running);
              }
            }

            for (let li = 0; li < renderer.stores.length; li++) {
              if (layerTimes[li] === 0) continue;
              if (!renderer.stores[li].isVisible()) continue;
              const color = colors[li % colors.length];
              const px = this.timeScale.timeToBitmapX(layerTimes[li]);
              const py = this.yScale.valueToBitmapY(displayValues[li]);

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
        }
      }

      // Pulse dots for line series (runs on overlay, not main layer)
      for (const entry of this.#series) {
        if (!entry.visible) continue;
        if (entry.renderer instanceof LineRenderer && entry.renderer.hasPulse) {
          entry.renderer.drawPulseOverlay(
            scope.context,
            this.timeScale,
            this.yScale,
            size.horizontalPixelRatio,
          );
        }
      }

      scope.context.restore();
    });

    // Keep overlay animating for pulse dots — but only if a pulse is actually visible
    if (hasPulse) {
      const { from, to } = this.timeScale.getRange();
      let pulseVisible = false;
      for (const entry of this.#series) {
        if (!entry.visible || !(entry.renderer instanceof LineRenderer) || !entry.renderer.hasPulse) continue;
        for (const store of entry.renderer.stores) {
          const last = store.last();
          if (last && last.time >= from && last.time <= to) { pulseVisible = true; break; }
        }
        if (pulseVisible) break;
      }
      if (pulseVisible) this.#overlayScheduler.markDirty();
    }
  }
}

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
import type { HoverInfo, SeriesRenderer, SliceInfo } from './series/types';
import { darkTheme } from './theme/dark';
import type { ChartTheme } from './theme/types';
import type {
  AxisBound,
  AxisConfig,
  BarSeriesOptions,
  CandlestickSeriesOptions,
  ChartLayout,
  CrosshairPosition,
  LineSeriesOptions,
  OHLCData,
  OHLCInput,
  PieSeriesOptions,
  TimePoint,
  TimePointInput,
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
  /**
   * Viewport padding. `top`/`bottom` are in pixels. `left`/`right` accept either pixels (`50`)
   * or data intervals (`{ intervals: 3 }`). Defaults: `{ top: 20, bottom: 20, right: { intervals: 3 }, left: { intervals: 0 } }`.
   */
  padding?: { top?: number; bottom?: number; right?: number | { intervals: number }; left?: number | { intervals: number } };
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
  #grid: boolean;
  /** Detected time interval between data points (milliseconds). */
  #dataInterval = 60_000;
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
  /** Nesting depth for batch updates. Suppresses recomputes while > 0. */
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
      // Render synchronously — canvas.width/height assignment clears the canvas,
      // so we must redraw immediately in the same frame to avoid a black flash.
      // Snap Y range: canvas dimensions changed structurally.
      this.updateScales(true);
      this.renderMain();
      // Notify React components — yScale changed due to new canvas dimensions
      // (e.g. Legend appeared and shrank the chart area).
      this.emit('viewportChange');
    });

    this.#interactions?.on('crosshairMove', (pos) => {
      this.#crosshairPos = pos;
      this.#overlayScheduler.markDirty();
      this.emit('crosshairMove', pos);

      // Generic spatial-hover dispatch — any renderer that implements hitTest+setHoverIndex opts in.
      this.#updateHover(pos);
    });
  }

  /**
   * Return a series ID: use the provided hint if it's non-empty and not already taken,
   * otherwise generate a new auto ID. Auto-generated IDs never collide with each other
   * or with user-provided IDs because they use a monotonically increasing counter.
   */
  #resolveId(hint?: string): string {
    if (hint && !this.#series.some((s) => s.id === hint)) {
      return hint;
    }
    // Keep incrementing until we find a free slot (skip any custom IDs that match)
    let candidate: string;
    do {
      candidate = `series_${++seriesIdCounter}`;
    } while (this.#series.some((s) => s.id === candidate));
    return candidate;
  }

  /** Add a candlestick (OHLC) series and return its unique ID. */
  addCandlestickSeries(options?: Partial<CandlestickSeriesOptions & { id?: string }>): string {
    const store = new TimeSeriesStore<OHLCData>();
    const renderer = new CandlestickRenderer(store, {
      upColor: this.#theme.candlestick.upColor,
      downColor: this.#theme.candlestick.downColor,
      wickUpColor: this.#theme.candlestick.wickUpColor,
      wickDownColor: this.#theme.candlestick.wickDownColor,
      bodyWidthRatio: 0.6,
      ...options,
    });
    const id = this.#resolveId(options?.id);
    renderer.onDataChanged?.(() => this.onDataChanged());
    this.#series.push({ id, renderer, store, visible: true });
    this.#seriesIdCache = null;
    this.updateViewportPadding();
    this.emit('seriesChange');
    return id;
  }

  /** Add a line series and return its unique ID. */
  addLineSeries(options?: Partial<LineSeriesOptions & { layers?: number; id?: string }>): string {
    const { layers, ...rest } = options ?? {};
    const layerCount = layers ?? 1;

    const renderer = new LineRenderer(layerCount, {
      colors: layerCount === 1 ? [this.#theme.line.color] : this.#theme.seriesColors.slice(0, layerCount),
      lineWidth: this.#theme.line.width,
      areaFill: true,
      ...rest,
    });
    const id = this.#resolveId(rest.id);
    renderer.onDataChanged?.(() => this.onDataChanged());
    this.#series.push({ id, label: rest.label, renderer, store: renderer.store, visible: true });
    this.#seriesIdCache = null;
    this.updateViewportPadding();
    this.emit('seriesChange');
    return id;
  }

  /** Add a bar series and return its unique ID. */
  addBarSeries(options?: Partial<BarSeriesOptions & { layers?: number; id?: string }>): string {
    const { layers, ...rest } = options ?? {};
    const layerCount = layers ?? 1;

    const renderer = new BarRenderer(layerCount, {
      colors: this.#theme.seriesColors.slice(0, layerCount),
      barWidthRatio: 0.6,
      ...rest,
    });
    const id = this.#resolveId(rest.id);
    renderer.onDataChanged?.(() => this.onDataChanged());
    this.#series.push({ id, label: rest.label, renderer, store: renderer.store, visible: true });
    this.#seriesIdCache = null;
    this.updateViewportPadding();
    this.emit('seriesChange');
    return id;
  }

  /** Add a pie/donut series. Set `innerRadiusRatio > 0` for donut. */
  addPieSeries(options?: Partial<PieSeriesOptions & { id?: string }>): string {
    const renderer = new PieRenderer(options);
    const id = this.#resolveId(options?.id);
    // Pie has no TimeSeriesStore, but routing through onDataChanged() keeps
    // batch() semantics consistent with time-series renderers.
    renderer.onDataChanged?.(() => this.onDataChanged());
    this.#series.push({ id, label: options?.label, renderer, store: null, visible: true });
    this.#seriesIdCache = null;
    this.updateViewportPadding();
    this.emit('seriesChange');
    return id;
  }

  /** Remove a series by ID and clean up its resources. */
  removeSeries(id: string): void {
    const idx = this.#series.findIndex((s) => s.id === id);
    if (idx >= 0) {
      this.#series[idx].renderer.dispose();
      this.#series.splice(idx, 1);
      this.#seriesIdCache = null;
      this.updateViewportPadding();
      this.#mainScheduler.markDirty();
      this.emit('seriesChange');
    }
  }

  /**
   * Replace all data for a series.
   *
   * - Single-layer series (candlestick, single-layer line/bar, pie): pass `data` directly.
   * - Multi-layer series (line/bar with multiple layers): pass `layerIndex` to target a specific layer.
   *
   * For line/bar accepts `TimePointInput[]` (time may be `Date`); for candlestick accepts `OHLCInput[]`;
   * for pie accepts `PieSliceData[]`. Time fields are normalized internally.
   */
  setSeriesData(id: string, data: unknown, layerIndex?: number): void {
    const entry = this.#series.find((s) => s.id === id);
    entry?.renderer.setData(data, layerIndex);
  }

  /** Append a new data point to the end of a series (real-time tick). */
  appendData(id: string, point: OHLCInput | TimePointInput, layerIndex?: number): void {
    const entry = this.#series.find((s) => s.id === id);
    entry?.renderer.appendPoint?.(point, layerIndex);
  }

  /** Update the last data point of a series in place (e.g. live candle update). */
  updateData(id: string, point: OHLCInput | TimePointInput, layerIndex?: number): void {
    const entry = this.#series.find((s) => s.id === id);
    entry?.renderer.updateLastPoint?.(point, layerIndex);
  }

  /** Update visual options (color, width, etc.) for an existing series. */
  updateSeriesOptions(
    id: string,
    options:
      | Partial<CandlestickSeriesOptions>
      | Partial<LineSeriesOptions>
      | Partial<BarSeriesOptions>
      | Partial<PieSeriesOptions>,
  ): void {
    const entry = this.#series.find((s) => s.id === id);
    if (!entry) return;
    entry.renderer.updateOptions(options);
    // Keep stored label in sync with options (affects tooltip/legend)
    if ('label' in options && typeof options.label === 'string') {
      entry.label = options.label;
    }
    this.#mainScheduler.markDirty();
  }

  /**
   * Batch multiple updates: suppress recomputes until `fn` returns. Exceptions
   * inside `fn` still flush the batch so counters don't leak across calls.
   */
  batch(fn: () => void): void {
    this.#batchDepth++;
    try {
      fn();
    } finally {
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
    // Single-layer renderers (candlestick, pie, single-layer line/bar) can't toggle;
    // use setSeriesVisible() instead. Skip to avoid a pointless updateYRange/redraw.
    if (entry.renderer.getLayerCount() <= 1) return;
    if (entry.renderer.isLayerVisible(layerIndex) === visible) return;
    entry.renderer.setLayerVisible(layerIndex, visible);
    if (this.#batchDepth > 0) {
      this.#batchVisualDirty = true;
      return;
    }
    this.updateYRange(true);
    this.#mainScheduler.markDirty();
  }

  isLayerVisible(seriesId: string, layerIndex: number): boolean {
    const entry = this.#series.find((s) => s.id === seriesId);
    return entry?.renderer.isLayerVisible(layerIndex) ?? true;
  }

  /** Auto-fit the viewport to show all data across every series. */
  fitContent(): void {
    const { first, last } = this.getDataBounds();
    if (first === undefined || last === undefined) return;
    const chartWidth = this.#canvasManager.size.media.width - this.yAxisWidth;
    this.#viewport.fitToData(first, last, chartWidth, true);
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

    const extractValue = (p: OHLCData | TimePoint): number => ('close' in p ? p.close : p.value);

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
    return 'close' in prev ? (prev as OHLCData).close : (prev as TimePoint).value;
  }

  getLastData(seriesId: string): OHLCData | TimePoint | null {
    const entry = this.#series.find((s) => s.id === seriesId);
    if (!entry?.store) return null;
    return entry.store.last() ?? null;
  }

  /** Find the data point closest to the given timestamp within one data interval. */
  getDataAtTime(seriesId: string, time: number): OHLCData | TimePoint | null {
    const entry = this.#series.find((s) => s.id === seriesId);
    if (!entry) return null;
    return entry.renderer.getDataAtTime?.(time, this.#dataInterval) ?? null;
  }

  /** Get all layers' data at a given time for multi-layer series (Bar/Line with stacking). */
  getLayerSnapshots(seriesId: string, time: number): { value: number; color: string }[] | null {
    const entry = this.#series.find((s) => s.id === seriesId);
    if (!entry || !entry.visible) return null;
    return entry.renderer.getLayerSnapshots?.(time, this.#dataInterval) ?? null;
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
    const colors = entry.renderer.getLayerColors();
    return colors[0] ?? this.#theme.line.color;
  }

  getSeriesLabel(seriesId: string): string | undefined {
    return this.#series.find((s) => s.id === seriesId)?.label;
  }

  /** Get per-layer colors for a series. Returns null for single-layer non-bar/line series. */
  getSeriesLayers(seriesId: string): { color: string }[] | null {
    const entry = this.#series.find((s) => s.id === seriesId);
    if (!entry) return null;
    const count = entry.renderer.getLayerCount();
    if (count <= 1) return null;
    const colors = entry.renderer.getLayerColors();
    return Array.from({ length: count }, (_, i) => ({ color: colors[i % colors.length] }));
  }

  /** Get all slices with computed colors and percentages. Returns null for series without slice data (e.g. candlestick, line, bar). */
  getSliceInfo(seriesId: string): SliceInfo[] | null {
    const entry = this.#series.find((s) => s.id === seriesId);
    return entry?.renderer.getSliceInfo?.(this.#theme) ?? null;
  }

  /** Get hover info (label/value/percent/color) for the currently hovered element, or null. */
  getHoverInfo(seriesId: string): HoverInfo | null {
    const entry = this.#series.find((s) => s.id === seriesId);
    return entry?.renderer.getHoverInfo?.(this.#theme) ?? null;
  }

  /** Apply a new theme and update series colors where appropriate. */
  setTheme(theme: ChartTheme): void {
    const prev = this.#theme;
    this.#theme = theme;
    for (const entry of this.#series) {
      entry.renderer.applyTheme(theme, prev);
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
      this.updateScales(true);
    }
    this.#mainScheduler.markDirty();
  }

  getMediaSize() {
    return this.#canvasManager.size.media;
  }

  /** Returns layout metrics for the chart area, Y axis, and time axis. */
  getLayout(): ChartLayout {
    const media = this.#canvasManager.size.media;
    const yAxisWidth = this.yAxisWidth;
    const xAxisHeight = this.xAxisHeight;
    return {
      chartArea: { x: 0, y: 0, width: media.width - yAxisWidth, height: media.height - xAxisHeight },
      yAxisWidth,
      xAxisHeight,
    };
  }

  getDataInterval(): number {
    return this.#dataInterval;
  }

  /** Update viewport padding at runtime. Refits the visible range to current data bounds. */
  setPadding(padding: ChartOptions['padding']): void {
    this.#viewport.setPadding(padding);
    const { first, last } = this.getDataBounds();
    if (first !== undefined && last !== undefined) {
      const chartWidth = this.#canvasManager.size.media.width - this.yAxisWidth;
      this.#viewport.fitToData(first, last, chartWidth, false);
    }
    this.syncScales();
    this.#mainScheduler.markDirty();
  }

  /** Show or hide the background grid. Takes effect on the next render frame. */
  setGrid(grid: boolean): void {
    this.#grid = grid;
    this.#mainScheduler.markDirty();
  }

  /** Notify chart that a YLabel is present (affects right padding). */
  setYLabel(has: boolean): void {
    this.#hasYLabel = has;
    this.updateViewportPadding();
  }

  /**
   * Dispatch a crosshair move to every renderer that supports spatial hover
   * (currently: pie). Any change in hover index schedules a main-layer redraw.
   */
  #updateHover(pos: CrosshairPosition | null): void {
    const size = this.#canvasManager.size;
    let changed = false;
    for (const entry of this.#series) {
      if (!entry.renderer.hitTest || !entry.renderer.setHoverIndex) continue;
      let index = -1;
      if (pos) {
        const bx = pos.mediaX * size.horizontalPixelRatio;
        const by = pos.mediaY * size.verticalPixelRatio;
        index = entry.renderer.hitTest(bx, by, size.bitmap.width, size.bitmap.height);
      }
      if (entry.renderer.setHoverIndex(index)) {
        changed = true;
      }
    }
    if (changed) this.#mainScheduler.markDirty();
  }

  private updateViewportPadding(): void {
    // TODO: auto-detect padding from series types
  }

  /** Tear down the chart: cancel animations, remove listeners, and detach the canvas. */
  destroy(): void {
    for (const entry of this.#series) entry.renderer.dispose();
    this.#series = [];
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
      // Multi-layer renderers expose getTotalLength(); single-layer uses entry.store.
      if (entry.renderer.getTotalLength) {
        totalLength += entry.renderer.getTotalLength();
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
      const chartWidth = this.#canvasManager.size.media.width - this.yAxisWidth;

      if (uninitialized) {
        // First data load — fit immediately
        this.#viewport.fitToData(first, last, chartWidth, false);
      } else if (isBatchLoad && this.#viewport.autoScroll) {
        this.#viewport.fitToData(first, last, chartWidth, true);
      } else if (!isBatchLoad && this.isLastPointVisible()) {
        // Realtime tick: only scroll if the last point is currently on screen
        this.#viewport.scrollToEnd(last, chartWidth);
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
          const line = point as TimePoint;
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

  private updateScales(snap = false): void {
    const size = this.#canvasManager.size;
    if (size.media.width === 0 || size.media.height === 0) return;

    const chartWidth = size.media.width - this.yAxisWidth; // Y axis
    const chartHeight = size.media.height - this.xAxisHeight; // time axis

    this.timeScale.update(this.#viewport.visibleRange, chartWidth, size.horizontalPixelRatio);
    this.yScale.update(this.#viewport.yRange, chartHeight, size.verticalPixelRatio);
    this.updateYRange(snap);
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

    // Generic animation poll — any renderer that still needs a frame keeps us going.
    for (const entry of this.#series) {
      if (entry.renderer.needsAnimation) {
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

    // Determine whether any renderer wants a persistent overlay tick (e.g. line pulse).
    let overlayAnimates = false;
    for (const entry of this.#series) {
      if (entry.visible && entry.renderer.overlayNeedsAnimation) {
        overlayAnimates = true;
        break;
      }
    }

    this.#canvasManager.useOverlayLayer((scope) => {
      // Guard inside callback — useOverlayLayer clears the canvas first,
      // so we must always enter it to erase stale crosshair/dots on mouseleave.
      if (!this.#crosshairPos && !overlayAnimates) return;

      const chartBitmapWidth = (size.media.width - this.yAxisWidth) * size.horizontalPixelRatio;
      const chartBitmapHeight = (size.media.height - this.xAxisHeight) * size.verticalPixelRatio;

      scope.context.save();
      scope.context.beginPath();
      scope.context.rect(0, 0, chartBitmapWidth, chartBitmapHeight);
      scope.context.clip();

      // Base crosshair lines on top of the clipped area
      if (this.#crosshairPos) {
        const bx = this.#crosshairPos.mediaX * size.horizontalPixelRatio;
        const by = this.#crosshairPos.mediaY * size.verticalPixelRatio;
        renderCrosshair(scope, bx, by, this.#theme);
      }

      // Dispatch to each renderer's overlay hook — crosshair dots, pulses, etc.
      for (const entry of this.#series) {
        if (!entry.visible) continue;
        entry.renderer.drawOverlay?.({
          scope,
          timeScale: this.timeScale,
          yScale: this.yScale,
          theme: this.#theme,
          dataInterval: this.#dataInterval,
          crosshair: this.#crosshairPos,
        });
      }

      scope.context.restore();
    });

    // Keep overlay animating while any renderer still requests it and its animated
    // content is within the visible time range. Renderers that don't expose
    // hasOverlayContentInRange fall back to "assume visible".
    if (overlayAnimates) {
      const { from, to } = this.timeScale.getRange();
      let visibleLast = false;
      for (const entry of this.#series) {
        if (!entry.visible || !entry.renderer.overlayNeedsAnimation) continue;
        if (entry.renderer.hasOverlayContentInRange?.(from, to) ?? true) {
          visibleLast = true;
          break;
        }
      }
      if (visibleLast) this.#overlayScheduler.markDirty();
    }
  }
}

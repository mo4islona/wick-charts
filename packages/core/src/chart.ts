import { AnimationConfig, DEFAULT_LINE_PULSE } from './animation/config';
import { easeOutCubic } from './animation/easing';
import { type AnimationState, type ViewportEngine, createViewportEngine } from './animation/viewport-engine';
import { type BitmapCoordinateSpace, CanvasManager } from './canvas-manager';
import { drawEdgeIndicators, resolveEdgeAnchorValue, resolveEdgeBoundary } from './chart/edge-indicators';
import { computeFitToData } from './chart/fit-to-data';
import { getLastValue, getPreviousClose, getStackedLastValue } from './chart/last-value';
import {
  type ChartOptions,
  type EdgeReachedInfo,
  type EdgeSide,
  type EdgeState,
  type ResolvedPadding,
  isSameHorizontalPadding,
  resolveMaxVisibleBars,
  resolvePadding,
  resolvePerfOptions,
} from './chart/options';
import { computePan, computeZoom } from './chart/pan-zoom-math';
import { StreamingCadence } from './chart/streaming-cadence';
import { computeStreamingTarget } from './chart/streaming-target';
import { resolvePaddingTime } from './chart/viewport-padding';
import { computeTargetYRange, resolveBound } from './chart/y-target';
import { renderCrosshair } from './components/crosshair';
import { renderGrid } from './components/grid';
import type { LoadingIndicatorFn } from './components/loading-indicator';
import { type MarkerConfig, type MarkerShape, renderMarker } from './components/marker';
import {
  type ReferenceLineConfig,
  type ReferenceLineOrientation,
  type ReferenceLineStyle,
  renderReferenceLine,
} from './components/reference-line';
import { type TimeRegionConfig, renderTimeRegion, resolveTimeRegionColors } from './components/time-region';
import { EventEmitter } from './events';
import { InteractionHandler } from './interactions/handler';
import type { PanZoomTarget } from './interactions/pan-zoom-target';
import type { PerfMonitor } from './perf';
import { RenderScheduler } from './render-scheduler';
import { XScale } from './scales/x-scale';
import { YScale } from './scales/y-scale';
import { type SeriesDefinition, resolveSeriesDefinition } from './series/definition';
import {
  type HoverInfo,
  type SeriesKind,
  type SeriesRenderer,
  type SliceInfo,
  isTimeSeriesRenderer,
} from './series/types';
import { catppuccin } from './theme/themes/catppuccin';
import type { ChartTheme } from './theme/types';
import type {
  AxisBound,
  AxisConfig,
  BarSeriesOptions,
  CandlestickSeriesOptions,
  ChartLayout,
  CrosshairPosition,
  HeatmapSeriesOptions,
  LineSeriesOptions,
  OHLCData,
  OHLCInput,
  PieSeriesOptions,
  SeriesType,
  TimePoint,
  TimePointInput,
  ValueColor,
  VisibleRangeSpec,
  XRange,
  YRange,
} from './types';
import { clamp } from './utils/math';
import { detectInterval, normalizeTime } from './utils/time';

export type { ChartOptions, EdgeReachedInfo, EdgeSide, EdgeState } from './chart/options';

/**
 * Payload for `pointClick` / `pointDoubleClick`. `spatialHit` resolves a
 * no-time-axis series (pie, heatmap, or a custom spatial kind) directly
 * under the pointer — for time-series series (line/bar/candlestick, or a
 * custom time-axis kind), resolve the point yourself from `time`, e.g. via
 * `buildHoverSnapshots(chart, { time: info.time, cacheKey: '…' })` or
 * `chart.getDataAtTime(seriesId, info.time)`.
 */
export interface PointClickInfo {
  mediaX: number;
  mediaY: number;
  time: number;
  y: number;
  spatialHit: { seriesId: string; index: number } | null;
}

/** Which spatial series (pie, heatmap, or a custom spatial kind) is currently hovered, and its slice/cell info. */
export interface SeriesHoverInfo {
  seriesId: string;
  index: number;
  info: HoverInfo | null;
}

/** Events emitted by {@link ChartInstance}. */
interface ChartEvents {
  crosshairMove: (pos: CrosshairPosition | null) => void;
  /** Fired on a click (or tap) on the chart canvas that isn't the tail end of a pan drag. */
  pointClick: (info: PointClickInfo) => void;
  /** Fired on a double-click on the chart canvas. Chart also responds by calling `fitContent()`. */
  pointDoubleClick: (info: PointClickInfo) => void;
  /**
   * Fired when the spatially-hovered series/index changes (pie, heatmap, or
   * a custom spatial kind) — `null` when the pointer leaves every hit area.
   * Time-series series have no pixel geometry to hover this way; read
   * `crosshairMove` + `getDataAtTime`/`buildHoverSnapshots` for those.
   */
  seriesHover: (hit: SeriesHoverInfo | null) => void;
  viewportChange: () => void;
  dataUpdate: () => void;
  seriesChange: () => void;
  /**
   * Fired whenever any state that affects **overlay components** (InfoBar,
   * Tooltip, Legend, YLabel, PieLegend, PieTooltip) changes. Superset of
   * `dataUpdate` and `seriesChange` — also fires on visibility toggles,
   * series option changes, and theme swaps. Overlay components should
   * subscribe to this instead of stacking multiple listeners.
   */
  overlayChange: () => void;
  /**
   * Fired once per main-layer frame *while* an axis tick is still in the
   * middle of its fade-in/out animation. DOM axis components (`<TimeAxis>`,
   * `<YAxis>`) listen to this to re-read the per-tick opacity from
   * `timeScale.tickTracker` / `yScale.tickTracker` so the DOM labels and
   * canvas grid lines fade in lockstep. Stops firing as soon as every
   * tracked tick has reached its target opacity.
   */
  tickFrame: () => void;
}

/** Internal bookkeeping for a registered series. */
interface SeriesEntry {
  id: string;
  /** Per-layer display names; index = layer. A hole / `undefined` entry means "unnamed". */
  labels?: (string | undefined)[];
  /**
   * Per-layer color overrides carried in `data` (sparse — `undefined` where the
   * layer specifies no color). Mirrored to the renderer, which keeps them
   * separate from the theme base; held here only for change detection.
   */
  colorOverrides?: (ValueColor | undefined)[];
  renderer: SeriesRenderer;
  visible: boolean;
}

/** Internal bookkeeping for a registered marker. `time` is normalized to epoch ms; `shape`/`pulse` carry resolved defaults. */
interface MarkerEntry {
  id: string;
  time: number;
  value?: number;
  seriesId?: string;
  shape: MarkerShape;
  pulse: boolean;
  label?: string;
  color?: string;
}

/** Internal bookkeeping for a registered time region. `from`/`to` are normalized to epoch ms; `to: null` is open-ended. */
interface RegionEntry {
  id: string;
  from: number;
  to: number | null;
  fill?: string;
  color?: string;
  label?: string;
}

/** Internal bookkeeping for a registered reference line. `coord` is a Y value (horizontal) or normalized epoch ms (vertical). */
interface LineEntry {
  id: string;
  orientation: ReferenceLineOrientation;
  coord: number;
  color?: string;
  label?: string;
  style: ReferenceLineStyle;
  width: number;
}

let seriesIdCounter = 0;
let markerIdCounter = 0;
let regionIdCounter = 0;
let lineIdCounter = 0;

/** Shallow equality for per-layer label arrays (handles the `undefined` holes). */
function labelsEqual(a: (string | undefined)[] | undefined, b: (string | undefined)[] | undefined): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;

  return a.every((label, i) => label === b[i]);
}

/** Shallow equality for per-layer color-override arrays (string compare; functions by reference). */
function colorOverridesEqual(
  a: (ValueColor | undefined)[] | undefined,
  b: (ValueColor | undefined)[] | undefined,
): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;

  return a.every((color, i) => color === b[i]);
}

/**
 * Core chart controller. Manages series, viewport, scales, and rendering.
 * Create one per chart container and call {@link destroy} on unmount.
 */
export class ChartInstance extends EventEmitter<ChartEvents> implements PanZoomTarget {
  /** Canvas lifecycle and DPR-aware sizing. */
  #canvasManager: CanvasManager;
  /** Schedules main-layer redraws (background, grid, series). */
  #mainScheduler: RenderScheduler;
  /** Schedules overlay redraws (crosshair). */
  #overlayScheduler: RenderScheduler;
  /** Maps time values to horizontal pixel coordinates. */
  readonly timeScale: XScale;
  /** Maps price/value to vertical pixel coordinates. */
  readonly yScale: YScale;
  /** Zoom, pan, crosshair — null when interactive=false. */
  #interactions: InteractionHandler | null;
  /** All registered series (candlestick, line, bar, pie). */
  #series: SeriesEntry[] = [];
  /** Point annotations (event markers) drawn on the overlay layer, kept out of the series model. */
  #markers: MarkerEntry[] = [];
  /** Time-region bands drawn on the main layer behind the series, kept out of the series model. */
  #regions: RegionEntry[] = [];
  /** Reference lines (horizontal threshold / vertical event) drawn on the overlay layer, kept out of the series model. */
  #lines: LineEntry[] = [];
  /**
   * Overlay-intro latch. Annotations ride the *initial* reveal, then stay put.
   * `#overlayIntroSeen` flips once we've actually watched an intro in progress
   * (guards against latching on an empty chart before any data arrives);
   * `#overlayIntroSettled` freezes the front at `1` afterward so a series added
   * later — which re-arms `getIntroFront()`'s global min — can't blink settled
   * markers / reference lines back out.
   */
  #overlayIntroSeen = false;
  #overlayIntroSettled = false;
  /** Active visual theme (colors, fonts, grid style). */
  #theme: ChartTheme;
  /** Whether to render the background grid. */
  #grid: boolean;
  /** Detected time interval between data points (milliseconds). */
  #dataInterval = 60_000;
  /** Current crosshair position, null when cursor is outside the chart. */
  #crosshairPos: CrosshairPosition | null = null;
  /**
   * What the crosshair is anchored to, deciding which half of the position
   * survives a viewport move (see {@link #syncCrosshairToViewport}):
   * `'pointer'` (real hover) keeps `mediaX`/`mediaY` and re-resolves
   * `time`/`y`; `'time'` (programmatic {@link setCrosshair}) keeps
   * `time`/`y` and re-projects the pixel position.
   */
  #crosshairAnchor: 'pointer' | 'time' = 'pointer';
  /** Whether the last overlay pass painted anything — gates the full-bitmap
   *  clear so an empty overlay isn't cleared again every main frame. */
  #overlayHasContent = false;
  /** User-specified Y-axis bounds (auto, fixed, percentage). */
  #yBounds: { min?: AxisBound; max?: AxisBound } = {};
  /** Cached series ID list — invalidated on add/remove. */
  #seriesIdCache: string[] | null = null;
  /** Axis visibility and sizing configuration. */
  #axis: AxisConfig = {};
  /** Host-declared state per edge — drives the edge-indicator overlay. */
  #edgeStates: Record<EdgeSide, EdgeState> = { left: 'idle', right: 'idle' };
  /** Cached boundary timestamps from the last `edgeReached` emission, by side. */
  #edgeBoundaries: Record<EdgeSide, number | null> = { left: null, right: null };
  /** Host-supplied callback fired when the user releases a pan/zoom past a data edge. */
  #onEdgeReached?: (info: EdgeReachedInfo) => void;
  /** Per-side custom painter for the edge `loading` spinner. `null` falls back to the built-in dots. */
  #edgeIndicatorFns: Record<EdgeSide, LoadingIndicatorFn | null> = { left: null, right: null };

  /** Nesting depth for batch updates. Suppresses recomputes while > 0. */
  #batchDepth = 0;
  /** True when batched operations include data changes (triggers full onDataChanged on end). */
  #batchDataDirty = false;
  /** True when batched operations include visibility changes (triggers Y-range + redraw on end). */
  #batchVisualDirty = false;
  /** True when batched operations bumped overlay version (emits a single overlayChange on flush). */
  #batchOverlayDirty = false;

  /**
   * Monotonic counter bumped on any mutation that affects overlay output —
   * data, visibility, series options, theme. Used by snapshot helpers in
   * `@wick-charts/core` as a cache key, so `buildHoverSnapshots` /
   * `buildLastSnapshots` return the same reference between ticks when
   * nothing observable has changed.
   *
   * @internal
   */
  #overlayVersion = 0;

  get yAxisWidth(): number {
    const y = this.#axis.y;
    return y?.visible === false ? 0 : (y?.width ?? 55);
  }

  get xAxisHeight(): number {
    const x = this.#axis.x;
    return x?.visible === false ? 0 : (x?.height ?? 30);
  }

  /** Resolved animation config derived from `options.animations` at construction. */
  #animationsConfig: AnimationConfig;

  /**
   * Single source of truth for the chart's X / Y viewport animation.
   * Push-model API: chart emits intent signals (`onPointAppended`,
   * `onSeriesVisibilityChanged`, `onPanZoom`, `onProgrammaticZoom`,
   * `onAxisReconfig`, `onDataReplaced`, `snap`); the engine pulls the
   * matching targets back through `computeXTarget` / `computeYTarget`
   * closures supplied at construction.
   */
  readonly #engine: ViewportEngine;
  /** EMA-smoothed real-wall-clock cadence between streaming appends. The
   *  X spring's `setSettleMs` is fed from this so the settle time stays just
   *  longer than the producer's tick interval — the spring never quite
   *  settles between ticks, so velocity carries continuously and the slide
   *  doesn't pulse. */
  readonly #cadence: StreamingCadence;
  /**
   * Mirrors `#dataReplaceSnapPending` for the engine signal that follows
   * inside the same `onDataChanged` call. `#dataReplaceSnapPending` is
   * consumed at the top of `onDataChanged` (so a stray streaming append
   * couldn't re-trigger the snap), but the `computeXTarget` closure runs
   * later and still needs to know whether to refit the X window. This
   * field carries the decision across that gap. The closure also reads
   * `#dataStart` / `#dataEnd` directly for the timestamps.
   */
  #pendingFitToData = false;

  /** Earliest data timestamp registered across all series, `null` before any data has arrived. */
  #dataStart: number | null = null;
  /** Latest data timestamp registered across all series, `null` before any data has arrived. */
  #dataEnd: number | null = null;
  /**
   * Previous {@link #dataEnd} value. Streaming-target math reads it to
   * preserve any pan offset across ticks: a user who panned a few bars
   * left of the tail keeps that offset as new bars arrive, instead of
   * snapping back to the natural-pin position every frame.
   */
  #prevDataEnd: number | null = null;
  /**
   * Warm-up window flag — `setVisibleRange({ from, bars })` arms it and
   * the streaming-target math suppresses pan ticks while the data hasn't
   * reached the right edge yet. Cleared by user interaction or once the
   * data fills the window.
   */
  #holdUntilFilled = false;
  /**
   * Cap for fit-to-data. When the data span exceeds this, the fit anchors
   * the right edge and trims the left. Resolved once at construction from
   * `options.viewport.maxVisibleBars`.
   */
  readonly #maxVisibleBars: number;

  /**
   * Committed logical X range — the "where X should be" target. Engine
   * eases its visual toward this. Pan / zoom / setRange / fitContent /
   * streaming-target writes go here. Initialized to `{0,0}` and treated
   * as "uninitialized" by `#computeXTarget` until first paint.
   */
  #logical: XRange = { from: 0, to: 0 };
  /** Padded Y range — engine's raw Y target plus pixel padding from `#padding`. */
  #yRange: YRange = { min: 0, max: 0 };
  /**
   * Auto-scroll flag — when `true`, streaming ticks slide X to track the
   * data tail. Pan flips this off when the gesture pushes the tail off
   * screen; chart's per-frame autoscroll check re-engages it when a
   * follow-up pan brings the tail back into view.
   */
  #autoScroll = true;
  /** Resolved viewport padding (top/bottom px + left/right pixels-or-intervals). */
  #padding: ResolvedPadding;
  /** Cached chart width — passed by interactions on every call; kept for the rare
   *  call that omits it (e.g. programmatic `chart.pan(...)` without explicit width). */
  #lastChartWidth = 0;

  /** Active performance monitor, or `null` when instrumentation is disabled (the default). */
  #perfMonitor: PerfMonitor | null;
  /** When true, `destroy()` tears down the monitor; false for caller-supplied monitors we must not destroy. */
  #ownsPerfMonitor = false;
  /** Visible HUD overlay (mounted by the perf config); non-null only when the caller requested one. */
  #perfHud: { destroy(): void } | null = null;

  constructor(container: HTMLElement, options?: ChartOptions) {
    super();
    // Support both new `axis` API and legacy flat props
    if (options?.axis) {
      this.#axis = options.axis;
      this.#yBounds = { min: options.axis.y?.min, max: options.axis.y?.max };
    }
    this.#theme = options?.theme ?? catppuccin.theme;
    this.#grid = options?.grid?.visible !== false;
    this.#animationsConfig = AnimationConfig.resolve(options?.animations);
    this.#maxVisibleBars = resolveMaxVisibleBars(options?.viewport?.maxVisibleBars);
    this.#padding = resolvePadding(options?.padding);

    // Viewport state machine — owns X / Y animation. Other animation
    // timelines (per-series alpha, pulse, axis tick fade, per-point entry,
    // last-value smoothing) live on the renderers / series / scale trackers
    // and tick independently.
    this.#cadence = new StreamingCadence();
    const animY = this.#animationsConfig.axis.y;
    const animX = this.#animationsConfig.axis.x;
    this.#engine = createViewportEngine({
      initial: { yRange: { min: 0, max: 0 }, xRange: { from: 0, to: 0 } },
      y: {
        curve: animY.curve,
        settleMs: animY.settleMs,
        stickyMs: animY.stickyMs,
        stickyFloorMs: animY.stickyFloorMs,
        gestureMs: animY.gestureMs,
        toggleMs: this.#animationsConfig.toggleMs,
      },
      x: {
        curve: animX.curve,
        settleMs: animX.settleMs,
        gestureMs: animX.gestureMs,
      },
      computeXTarget: () => this.#computeXTarget(),
      computeYTarget: ({ xTarget }) => this.#computeYTarget(xTarget),
      onWake: () => this.#mainScheduler?.markDirty(),
    });

    this.#onEdgeReached = options?.onEdgeReached;
    this.#initialVisibleRange = options?.viewport?.initialRange;

    const resolvedPerf = resolvePerfOptions(options?.perf);
    this.#perfMonitor = resolvedPerf.monitor;
    this.#ownsPerfMonitor = resolvedPerf.ownsMonitor;

    this.#canvasManager = new CanvasManager(container, this.#perfMonitor ?? undefined);
    this.timeScale = new XScale();
    this.yScale = new YScale();
    this.timeScale.setLocale(options?.locale);
    this.timeScale.setTimeZone(options?.timeZone);

    const ticksMs = this.#animationsConfig.axis.ticksMs;
    this.timeScale.tickTracker.setFadeMs(ticksMs);
    this.yScale.tickTracker.setFadeMs(ticksMs);

    this.#mainScheduler = new RenderScheduler((t) => this.#renderFrame(t));
    this.#overlayScheduler = new RenderScheduler((t) =>
      this.#measuredRender('overlay', t, () => this.renderOverlay(t)),
    );
    if (this.#perfMonitor && resolvedPerf.hud) {
      this.#perfHud = resolvedPerf.hud(container, this.#perfMonitor);
    }

    const interactive = options?.interactive !== false;
    this.#interactions = interactive
      ? new InteractionHandler(this.#canvasManager.canvas, this, this.timeScale, this.yScale)
      : null;

    this.#canvasManager.on('resize', () => {
      // Render synchronously — canvas.width/height assignment clears the canvas,
      // so we must redraw immediately in the same frame to avoid a black flash.
      // Resize doesn't change the data-driven Y target, but the chart-area
      // height changed: the next setYRange call inside renderMain picks up
      // the new pixel padding so labels reposition without an explicit emit.
      this.syncScales();
      this.#renderFrame();
      // Notify React components — yScale changed due to new canvas dimensions
      // (e.g. Legend appeared and shrank the chart area).
      this.emit('viewportChange');
    });

    // Bootstrap the scales with the size CanvasManager measured synchronously
    // in its constructor. Without this, `yScale.height` stays at its default
    // `1` until the first ResizeObserver delivery (or first `onDataChanged`)
    // — and anything that calls `yScale.valueToY()` before then (YLabel,
    // YAxis labels, series draws on the first paint) computes positions
    // against a 1-pixel coordinate space, producing a visible "rescale"
    // jump once the real height lands. `syncScales` is cheap and safely
    // no-ops when the container hasn't been laid out yet (size still 0).
    this.syncScales();

    this.#interactions?.on('crosshairMove', (pos) => {
      this.#crosshairAnchor = 'pointer';
      this.#crosshairPos = pos;
      this.#overlayScheduler.markDirty();
      this.emit('crosshairMove', pos);

      // Generic spatial-hover dispatch — any renderer that implements hitTest+setHoverIndex opts in.
      this.#updateHover(pos);
    });

    this.#interactions?.on('click', (pos) => {
      this.emit('pointClick', { ...pos, spatialHit: this.#spatialHitAt(pos) });
    });

    this.#interactions?.on('dblclick', (pos) => {
      this.fitContent();
      this.emit('pointDoubleClick', { ...pos, spatialHit: this.#spatialHitAt(pos) });
    });
  }

  /**
   * Bump overlay version + emit `overlayChange`. Call from every mutation
   * path whose output overlay components care about: data, series list,
   * per-series/layer visibility, options, theme.
   *
   * Inside `batch(...)` the version still increments per call (so the
   * snapshot cache invalidates at least once per logical change), but the
   * `overlayChange` emission is coalesced to a single event on flush.
   * That lets Legend-style isolate toggles — which batch multiple
   * `setSeriesVisible` / `setLayerVisible` calls — produce one overlay
   * render instead of N.
   */
  #bumpOverlayVersion(): void {
    this.#overlayVersion++;
    if (this.#batchDepth > 0) {
      this.#batchOverlayDirty = true;

      return;
    }

    this.emit('overlayChange');
  }

  /**
   * Monotonic counter incremented on any mutation that affects overlay
   * output. Snapshot helpers (`buildHoverSnapshots`, `buildLastSnapshots`)
   * key their structural-equality cache on this value — same version +
   * same `(time, sort, cacheKey)` returns the same frozen reference.
   *
   * @internal
   */
  getOverlayVersion(): number {
    return this.#overlayVersion;
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

  /**
   * Add a series and return its unique ID. `options` is typed per series via
   * the overloads. `layers` (line/bar) and `id` are consumed here; everything
   * else is forwarded to the renderer.
   *
   * Preferred form: pass a {@link SeriesDefinition}
   * (`chart.addSeries(LineSeriesDef, …)`) — the chart stays renderer-agnostic
   * and bundlers drop the series types a host never imports. The string form
   * resolves through the registry and requires a one-time
   * `registerBuiltinSeries()` call at startup.
   */
  addSeries(type: 'candlestick', options?: Partial<CandlestickSeriesOptions & { id?: string; label?: string }>): string;
  addSeries(
    type: 'line',
    options?: Partial<
      LineSeriesOptions & { layers?: number; id?: string; label?: string; labels?: (string | undefined)[] }
    >,
  ): string;
  addSeries(
    type: 'bar',
    options?: Partial<
      BarSeriesOptions & { layers?: number; id?: string; label?: string; labels?: (string | undefined)[] }
    >,
  ): string;
  addSeries(type: 'pie', options?: Partial<PieSeriesOptions & { id?: string; label?: string }>): string;
  addSeries(type: 'heatmap', options?: Partial<HeatmapSeriesOptions & { id?: string; label?: string }>): string;
  addSeries<O>(
    def: SeriesDefinition<O>,
    options?: Partial<O> & { layers?: number; id?: string; label?: string; labels?: (string | undefined)[] },
  ): string;
  addSeries(type: SeriesType | SeriesDefinition, options: Record<string, unknown> = {}): string {
    const def = typeof type === 'string' ? resolveSeriesDefinition(type) : type;
    if (!def) {
      throw new Error(
        `[wick-charts] Unknown series type '${String(type)}'. The string form of addSeries resolves ` +
          `through the series registry — call registerBuiltinSeries() once at startup, or pass the ` +
          `definition directly: chart.addSeries(LineSeriesDef, options).`,
      );
    }

    // `label` / `labels` are series-entry metadata, not renderer options — pull
    // them out so they never reach `def.create`. `labels` (per-layer) wins;
    // `label` is the single-name back-compat form (pie, candlestick).
    const { layers, id, label, labels, ...rest } = options as {
      layers?: number;
      id?: string;
      label?: string;
      labels?: (string | undefined)[];
      [key: string]: unknown;
    };
    const layerCount = layers ?? 1;

    // Merge order matches the old per-type adders: theme defaults (injected by
    // the definition) -> animation defaults -> user options -> forced-off overrides.
    const merged = {
      ...this.#animationsConfig.defaults(def.type),
      ...rest,
      ...this.#animationsConfig.overrides(def.type),
    };
    const renderer = def.create({ theme: this.#theme, layerCount }, merged);

    const entryLabels = labels ?? (typeof label === 'string' ? [label] : undefined);
    const seriesId = this.#resolveId(id);
    renderer.onDataChanged?.(() => this.onDataChanged());
    this.#series.push({ id: seriesId, labels: entryLabels, renderer, visible: true });
    this.#seriesIdCache = null;
    this.emit('seriesChange');
    this.#bumpOverlayVersion();

    return seriesId;
  }

  /** Remove a series by ID and clean up its resources. */
  removeSeries(id: string): void {
    const idx = this.#series.findIndex((s) => s.id === id);
    if (idx >= 0) {
      this.#series[idx].renderer.dispose();
      this.#series.splice(idx, 1);
      this.#seriesIdCache = null;
      this.#mainScheduler.markDirty();
      this.emit('seriesChange');
      this.#bumpOverlayVersion();
    }
  }

  // --- Markers (point annotations) -----------------------------------------

  /**
   * Pin a point annotation to `time` (X) and `value` (Y), or to a series via
   * `seriesId` (Y snaps to the nearest data point at `time`). Returns the marker
   * id for later {@link updateMarker} / {@link removeMarker}.
   *
   * Markers render on the overlay layer and stay out of the series model — they
   * are excluded from tooltips, the legend, and the Y-range autoscale, and never
   * appear in series queries.
   */
  addMarker(config: MarkerConfig): string {
    const id = `marker_${++markerIdCounter}`;
    this.#markers.push(this.#normalizeMarker(id, config));
    this.#overlayScheduler.markDirty();

    return id;
  }

  /** Replace a marker's config in place. No-op when the id is unknown. */
  updateMarker(id: string, config: MarkerConfig): void {
    const idx = this.#markers.findIndex((m) => m.id === id);
    if (idx === -1) return;

    this.#markers[idx] = this.#normalizeMarker(id, config);
    this.#overlayScheduler.markDirty();
  }

  /** Remove a marker by id. No-op when the id is unknown. */
  removeMarker(id: string): void {
    const idx = this.#markers.findIndex((m) => m.id === id);
    if (idx === -1) return;

    this.#markers.splice(idx, 1);
    this.#overlayScheduler.markDirty();
  }

  /** Read-only snapshot of the registered markers (normalized). Mutate via add / update / removeMarker. */
  getMarkers(): readonly Readonly<MarkerEntry>[] {
    return this.#markers;
  }

  #normalizeMarker(id: string, config: MarkerConfig): MarkerEntry {
    return {
      id,
      time: normalizeTime(config.time),
      value: config.value,
      seriesId: config.seriesId,
      shape: config.shape ?? 'dot',
      pulse: config.pulse ?? false,
      label: config.label,
      color: config.color,
    };
  }

  /** Resolve a marker's Y value: explicit `value`, else snapped to its series at `time`. Null when neither resolves. */
  #resolveMarkerValue(marker: MarkerEntry): number | null {
    if (marker.value !== undefined && Number.isFinite(marker.value)) return marker.value;
    if (marker.seriesId === undefined) return null;

    const point = this.getDataAtTime(marker.seriesId, marker.time);
    if (!point) return null;

    return 'close' in point ? point.close : point.value;
  }

  /** Resolve a marker's color: explicit `color`, else the series color, else the theme line color. */
  #resolveMarkerColor(marker: MarkerEntry): string {
    if (marker.color !== undefined) return marker.color;

    if (marker.seriesId !== undefined) {
      const seriesColor = this.getSeriesColor(marker.seriesId);
      if (seriesColor !== null) return seriesColor;
    }

    return this.#theme.line.color;
  }

  #drawMarkers(scope: BitmapCoordinateSpace, plotWidth: number, plotHeight: number): void {
    if (this.#markers.length === 0) return;

    // Share one halo phase across markers, off the same clock and period the line pulse uses.
    const phase = (performance.now() / (DEFAULT_LINE_PULSE * 2 * Math.PI)) % 1;

    // Markers ride the initial-load reveal: each surfaces as the series draw
    // front sweeps past its time, so annotations don't pop in fully-formed
    // over a half-drawn chart. Latched so a later series intro can't re-hide them.
    const front = this.#overlayIntroFront();

    for (const marker of this.#markers) {
      const value = this.#resolveMarkerValue(marker);
      if (value === null) continue;

      const alpha = this.#introAlphaAt(front, marker.time);
      if (alpha <= 0) continue;

      const prevAlpha = scope.context.globalAlpha;
      if (alpha < 1) scope.context.globalAlpha = prevAlpha * alpha;

      renderMarker({
        scope,
        timeScale: this.timeScale,
        yScale: this.yScale,
        theme: this.#theme,
        marker: {
          time: marker.time,
          value,
          color: this.#resolveMarkerColor(marker),
          shape: marker.shape,
          pulse: marker.pulse,
          label: marker.label,
        },
        phase,
        plotWidth,
        plotHeight,
      });

      if (alpha < 1) scope.context.globalAlpha = prevAlpha;
    }
  }

  // --- Time regions (shaded bands) -----------------------------------------

  /**
   * Shade the time interval `[from, to]` with a translucent vertical band —
   * an anomaly window, a maintenance window, a highlighted session. Omit `to`
   * (or pass `'now'`) for an open-ended band that extends to the right edge of
   * the plot — the "still firing" case. Returns the region id for later
   * {@link updateRegion} / {@link removeRegion}.
   *
   * Regions render on the main layer *behind* the series and stay out of the
   * series model — they never affect the Y-range autoscale, tooltips, or the
   * legend.
   */
  addRegion(config: TimeRegionConfig): string {
    const id = `region_${++regionIdCounter}`;
    this.#regions.push(this.#normalizeRegion(id, config));
    this.#mainScheduler.markDirty();

    return id;
  }

  /** Replace a region's config in place. No-op when the id is unknown. */
  updateRegion(id: string, config: TimeRegionConfig): void {
    const idx = this.#regions.findIndex((r) => r.id === id);
    if (idx === -1) return;

    this.#regions[idx] = this.#normalizeRegion(id, config);
    this.#mainScheduler.markDirty();
  }

  /** Remove a region by id. No-op when the id is unknown. */
  removeRegion(id: string): void {
    const idx = this.#regions.findIndex((r) => r.id === id);
    if (idx === -1) return;

    this.#regions.splice(idx, 1);
    this.#mainScheduler.markDirty();
  }

  /** Read-only snapshot of the registered regions (normalized). Mutate via add / update / removeRegion. */
  getRegions(): readonly Readonly<RegionEntry>[] {
    return this.#regions;
  }

  #normalizeRegion(id: string, config: TimeRegionConfig): RegionEntry {
    const { to } = config;
    const resolvedTo = to === undefined || to === 'now' ? null : normalizeTime(to);

    return {
      id,
      from: normalizeTime(config.from),
      to: resolvedTo,
      fill: config.fill,
      color: config.color,
      label: config.label,
    };
  }

  #drawRegions(scope: BitmapCoordinateSpace, plotWidth: number, plotHeight: number): void {
    if (this.#regions.length === 0) return;

    for (const region of this.#regions) {
      const { color, fill } = resolveTimeRegionColors(region, this.#theme);
      renderTimeRegion({
        scope,
        timeScale: this.timeScale,
        theme: this.#theme,
        region: { from: region.from, to: region.to, fill, color, label: region.label },
        plotWidth,
        plotHeight,
      });
    }
  }

  // --- Reference lines (thresholds / event boundaries) ---------------------

  /**
   * Draw a reference line across the plot — a horizontal threshold / baseline
   * pinned to a `value`, or a vertical event boundary pinned to a `time`
   * (mutually exclusive). Returns the line id for later {@link updateLine} /
   * {@link removeLine}.
   *
   * Lines render on the overlay layer *above* the series and stay out of the
   * series model — they never affect the Y-range autoscale, tooltips, or the
   * legend.
   */
  addLine(config: ReferenceLineConfig): string {
    const id = `line_${++lineIdCounter}`;
    this.#lines.push(this.#normalizeLine(id, config));
    this.#overlayScheduler.markDirty();

    return id;
  }

  /** Replace a reference line's config in place. No-op when the id is unknown. */
  updateLine(id: string, config: ReferenceLineConfig): void {
    const idx = this.#lines.findIndex((l) => l.id === id);
    if (idx === -1) return;

    this.#lines[idx] = this.#normalizeLine(id, config);
    this.#overlayScheduler.markDirty();
  }

  /** Remove a reference line by id. No-op when the id is unknown. */
  removeLine(id: string): void {
    const idx = this.#lines.findIndex((l) => l.id === id);
    if (idx === -1) return;

    this.#lines.splice(idx, 1);
    this.#overlayScheduler.markDirty();
  }

  /** Read-only snapshot of the registered reference lines (normalized). Mutate via add / update / removeLine. */
  getLines(): readonly Readonly<LineEntry>[] {
    return this.#lines;
  }

  #normalizeLine(id: string, config: ReferenceLineConfig): LineEntry {
    const { time, value } = config;
    const common = {
      id,
      color: config.color,
      label: config.label,
      style: config.style ?? 'dashed',
      width: config.width ?? 1,
    };

    // A `time` wins over `value` when both are set (vertical); neither resolves
    // to a non-finite coord, which the renderer skips.
    if (time !== undefined) {
      return { ...common, orientation: 'vertical', coord: normalizeTime(time) };
    }

    return { ...common, orientation: 'horizontal', coord: value ?? Number.NaN };
  }

  #drawLines(scope: BitmapCoordinateSpace, plotWidth: number, plotHeight: number): void {
    if (this.#lines.length === 0) return;

    const front = this.#overlayIntroFront();

    for (const line of this.#lines) {
      // A vertical (event-time) line surfaces when the reveal front passes its
      // X, matching the marker choreography; a horizontal threshold spans the
      // whole plot, so it just fades in across the reveal instead.
      const alpha =
        front >= 1 ? 1 : line.orientation === 'vertical' ? this.#introAlphaAt(front, line.coord) : easeOutCubic(front);
      if (alpha <= 0) continue;

      const prevAlpha = scope.context.globalAlpha;
      if (alpha < 1) scope.context.globalAlpha = prevAlpha * alpha;

      renderReferenceLine({
        scope,
        timeScale: this.timeScale,
        yScale: this.yScale,
        theme: this.#theme,
        line: {
          orientation: line.orientation,
          coord: line.coord,
          color: line.color ?? this.#theme.line.color,
          style: line.style,
          width: line.width,
          label: line.label,
        },
        plotWidth,
        plotHeight,
      });

      if (alpha < 1) scope.context.globalAlpha = prevAlpha;
    }
  }

  /**
   * Read-only snapshot of the chart's X / Y viewport animation. The same
   * shape (`xRange`, `yRange`, `animating`) every frame — call this inside
   * the current render pass rather than caching the reference, as the
   * underlying animator mutates between frames.
   */
  getAnimationState(): AnimationState {
    return this.#engine.getAnimationState();
  }

  /**
   * Reveal-front position in `[0, 1]` of any in-flight initial-load intro.
   * With a `seriesId`, that series' own front; without, the minimum across
   * every visible time series — overlays wait for the slowest reveal. `1`
   * whenever nothing is introing. Overlay components (the Y-label badge,
   * annotations) read this to reveal their entrance in step with the draw.
   */
  getIntroFront(seriesId?: string): number {
    if (seriesId !== undefined) {
      const entry = this.#series.find((s) => s.id === seriesId);

      return entry?.renderer.getIntroFront?.() ?? 1;
    }

    let front = 1;
    for (const entry of this.#series) {
      if (!entry.visible) continue;

      const f = entry.renderer.getIntroFront?.();
      if (f !== undefined && f < front) front = f;
    }

    return front;
  }

  /**
   * Reveal front for annotations (markers / reference lines). The same as
   * {@link getIntroFront}() during the initial reveal, but latched to `1` once
   * that first reveal has settled — so introducing another series afterward
   * doesn't re-hide overlays that already surfaced. Latches only after an intro
   * has actually been observed in progress, so an annotation drawn on a chart
   * that has no data yet still rides the reveal once data arrives.
   */
  #overlayIntroFront(): number {
    if (this.#overlayIntroSettled) return 1;

    const front = this.getIntroFront();
    if (front < 1) {
      this.#overlayIntroSeen = true;

      return front;
    }

    if (this.#overlayIntroSeen) this.#overlayIntroSettled = true;

    return 1;
  }

  /**
   * Entrance alpha for an overlay pinned at `time`, given the intro reveal
   * `front`. Transparent until the sweep reaches the element's normalized X,
   * then fades in over a short band — so annotations surface in step with the
   * series drawing past them. `1` once the intro has settled.
   */
  #introAlphaAt(front: number, time: number): number {
    if (front >= 1) return 1;

    const { from, to } = this.timeScale.getRange();
    const span = to - from;
    const position = span > 0 ? (time - from) / span : 0;
    const INTRO_FADE_BAND = 0.12;

    return clamp((front - position) / INTRO_FADE_BAND, 0, 1);
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
    if (!entry) return;
    // Bulk replace → onDataChanged should snap the Y range so yScale reflects
    // the new domain synchronously (the long-standing public contract pinned
    // by chart-scales-sync.test). Streaming `appendData` ticks don't set
    // this flag, so per-tick Y can ease both directions for a smooth axis.
    this.#dataReplaceSnapPending = true;

    entry.renderer.setData(data, layerIndex);
  }

  /** Append a new data point to the end of a series (real-time tick). */
  appendData(id: string, point: OHLCInput | TimePointInput, layerIndex?: number): void {
    const entry = this.#series.find((s) => s.id === id);
    if (entry === undefined || entry.renderer.appendPoint === undefined) return;

    // Entrance + live-value chase are renderer-owned: the renderer's
    // `appendPoint` registers an entry animator keyed by `time` and seeds
    // the live-track so the new point fades in and the trailing-Y starts
    // smoothing on the next render frame.
    entry.renderer.appendPoint(point, layerIndex);
  }

  /** Update the last data point of a series in place (e.g. live candle update). */
  updateData(id: string, point: OHLCInput | TimePointInput, layerIndex?: number): void {
    const entry = this.#series.find((s) => s.id === id);
    entry?.renderer.updateLastPoint?.(point, layerIndex);
  }

  /**
   * Keep only the most recent `count` points of a series — drop the oldest
   * tail when the series exceeds the cap. Smooth Y-range chase (no snap):
   * unlike {@link setSeriesData}, this does NOT set the bulk-replace snap
   * flag, so streaming windows can roll without per-tick Y jitter.
   *
   * Idempotent: a no-op when the series is already at or below `count`.
   * Use after {@link appendData} in a rolling-window stream:
   * ```ts
   * chart.appendData('feed', point);
   * chart.keepLast('feed', 100);
   * ```
   */
  keepLast(id: string, count: number, layerIndex?: number): void {
    const entry = this.#series.find((s) => s.id === id);
    entry?.renderer.keepLast?.(count, layerIndex);
  }

  /** Update visual options (color, width, etc.) for an existing series. */
  updateSeriesOptions(
    id: string,
    options:
      | Partial<CandlestickSeriesOptions>
      | Partial<LineSeriesOptions>
      | Partial<BarSeriesOptions>
      | Partial<PieSeriesOptions>
      | Partial<HeatmapSeriesOptions>,
  ): void {
    const entry = this.#series.find((s) => s.id === id);
    if (!entry) return;

    // Framework wrappers (notably Vue's deep watch) replay this method on
    // every render with a fresh options object, usually identical. Bumping
    // `overlayVersion` blindly would invalidate the snapshot cache on every
    // tick and defeat the whole point of memoization.
    //
    // Compare the inputs that actually feed overlays — label + layer colors —
    // before and after the update, and only bump when they really changed.
    const prevLabels = entry.labels;
    const prevColors = entry.renderer.getLayerColors().slice();

    // React / Vue / Svelte wrappers replay the user's options on every
    // render via this path. If the chart-level `animations.series.<type>`
    // category is disabled, the per-series force-off must be re-applied
    // here — otherwise a simple parent re-render silently re-enables
    // animations the chart asked to hold off.
    const forceOff = this.#animationsConfig.overrides(entry.renderer.kind);
    entry.renderer.updateOptions({ ...options, ...forceOff });
    // Keep the stored single-name label in sync with options (pie / candlestick
    // back-compat — line/bar set per-layer names through `setSeriesLabels`).
    if ('label' in options && typeof options.label === 'string') {
      entry.labels = [options.label];
    }
    this.#mainScheduler.markDirty();

    const nextColors = entry.renderer.getLayerColors();
    const colorsChanged = prevColors.length !== nextColors.length || prevColors.some((c, i) => c !== nextColors[i]);
    const labelChanged = !labelsEqual(prevLabels, entry.labels);
    if (colorsChanged || labelChanged) {
      this.#bumpOverlayVersion();
    }
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
          this.#yInited = true;
          const now = performance.now();
          this.#engine.onAxisReconfig(now);
          this.#applyEngineState(now);
          this.#mainScheduler.markDirty();
        }
        if (this.#batchOverlayDirty) {
          this.#batchOverlayDirty = false;
          this.emit('overlayChange');
        }
      }
    }
  }

  /** Show or hide a series. The series cross-fades over
   *  `animations.toggle`; the Y range re-fits on the same schedule
   *  (one-shot duration override) so the fade and the axis adjustment
   *  finish on the same frame. Hidden series are excluded from Y-range
   *  computation immediately so the axis can start moving while the line
   *  fades out in parallel.
   */
  setSeriesVisible(seriesId: string, visible: boolean): void {
    const entry = this.#series.find((s) => s.id === seriesId);
    if (!entry || entry.visible === visible) return;

    entry.visible = visible;
    this.#bumpOverlayVersion();

    // Renderer-owned alpha fade — kicks off independently of the engine's
    // Y retarget below so the cross-fade lives next to the geometry that
    // draws it. Pie and other renderers without `setAlpha` ride the binary
    // `entry.visible` flag and skip the fade entirely.
    const toggleMs = this.#animationsConfig.toggleMs;
    entry.renderer.setAlpha?.(visible ? 1 : 0, toggleMs);
    this.#mainScheduler.markDirty();

    if (this.#batchDepth > 0) {
      this.#batchVisualDirty = true;

      return;
    }

    // Y reflow still flows through the engine; renderer owns the alpha fade.
    this.#yInited = true;
    const now = performance.now();
    this.#engine.onSeriesVisibilityChanged(now);
    this.#applyEngineState(now);
  }

  /**
   * Whether streaming ticks slide the visible range to track the data tail.
   * Flipped off by a pan that pushes the tail off screen; re-engaged when
   * a follow-up pan brings the tail back into the destination window or
   * when {@link fitContent} / {@link setVisibleRange} commits a range
   * containing the tail.
   */
  getAutoScroll(): boolean {
    return this.#autoScroll;
  }

  isSeriesVisible(seriesId: string): boolean {
    return this.#series.find((s) => s.id === seriesId)?.visible ?? true;
  }

  /**
   * Show or hide a specific layer within a multi-layer series.
   *
   * Symmetric with {@link setSeriesVisible}: drives both the renderer's
   * per-layer alpha fade and the engine's Y re-fit through `toggleMs` so the
   * line fade and the axis adjustment finish on the same frame. Hidden layers
   * are excluded from Y-range computation immediately (via the renderer's
   * `getValueRange` reading `store.isVisible()`); the alpha fade keeps the
   * layer's geometry on screen until the engine's Y ease settles.
   */
  setLayerVisible(seriesId: string, layerIndex: number, visible: boolean): void {
    const entry = this.#series.find((s) => s.id === seriesId);
    if (!entry) return;

    // Single-layer renderers (candlestick, pie, single-layer line/bar) can't toggle;
    // use setSeriesVisible() instead. Skip to avoid a pointless re-fit/redraw.
    if (entry.renderer.getLayerCount() <= 1) return;
    if (entry.renderer.isLayerVisible(layerIndex) === visible) return;

    entry.renderer.setLayerVisible(layerIndex, visible);
    this.#bumpOverlayVersion();

    // Per-layer alpha fade rides alongside the engine's Y ease. Renderers
    // without per-layer alpha (candlestick, pie) are already excluded above
    // by the layer-count guard, so the optional call is just type-level safety.
    const toggleMs = this.#animationsConfig.toggleMs;
    entry.renderer.setLayerAlpha?.(layerIndex, visible ? 1 : 0, toggleMs);
    this.#mainScheduler.markDirty();

    if (this.#batchDepth > 0) {
      this.#batchVisualDirty = true;

      return;
    }

    this.#yInited = true;
    const now = performance.now();
    this.#engine.onSeriesVisibilityChanged(now);
    this.#applyEngineState(now);
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
    this.#fitVisibleToData(first, last, chartWidth);
    // Y and X both ease through the engine — Y rides the sticky-Y baseline,
    // X rides the spring's settle time, so the axis and viewport converge on
    // the same frame.
    this.#commitProgrammaticZoom({ xEase: true });
  }

  getVisibleRange() {
    // Return the committed logical target rather than the engine's eased
    // visual: external consumers (React `useVisibleRange`, multi-chart sync)
    // read this synchronously right after `setVisibleRange` / `pan` /
    // `zoomAt` and expect to see what they just set, not the mid-tween
    // value the engine is animating toward. Falls back to engine state
    // before any commit (initial `{0,0}` state).
    if (this.#logical.from === 0 && this.#logical.to === 0) {
      return this.#engine.getAnimationState().xRange;
    }

    return this.#logical;
  }

  /**
   * Return the full span of registered data, or `null` before any data has
   * arrived. `{ from: dataStart, to: dataEnd }` mirrors the chart's own
   * tracking and is cheaper than recomputing from series stores.
   */
  getDataRange(): XRange | null {
    if (this.#dataStart === null || this.#dataEnd === null) return null;

    return { from: this.#dataStart, to: this.#dataEnd };
  }

  /**
   * Imperatively set the visible time range. Three forms:
   *
   * - `number N` — show the last N bars from the data tail (anchor right).
   *   Resolved against current data bounds and data interval; keeps
   *   auto-scroll on. No-op if data hasn't loaded yet.
   * - `{ from, to }` — explicit time range. `from`/`to` accept either
   *   epoch milliseconds or `Date`. Cancels any in-flight animation and
   *   applies immediately. Auto-scroll stays on only if the tail is
   *   inside the new range (mirrors pan semantics).
   * - `{ from, bars }` — anchor the visible window at `from` and extend
   *   right by `bars` data intervals. Useful for warm-up windows where
   *   seed points sit on the left and a stream fills the gap on the
   *   right. `from` accepts a `Date` too.
   *
   * Typical use: on mount, zoom to the last N bars while keeping the full
   * buffer available for pan-back history inspection.
   *
   * `opts.gesture` (explicit `{ from, to }` form only) eases X and Y on the
   * same fast, velocity-matched profile a user pan/zoom uses instead of the
   * default programmatic settle (snap X, sticky-Y ease). Use it for
   * multi-chart sync so a synced pane tracks the originating gesture in
   * lockstep rather than lagging behind on the long sticky contract.
   */
  setVisibleRange(spec: VisibleRangeSpec, opts?: { gesture?: boolean }): void {
    if (typeof spec === 'number') {
      // Integer check rejects NaN, Infinity, and non-integers in one call;
      // the floor of 2 matches Viewport's applyRange minimum-span contract.
      if (!Number.isInteger(spec) || spec < 2) return;

      const { first, last } = this.getDataBounds();
      if (first === undefined || last === undefined) return;

      const trimmedFirst = Math.max(first, last - (spec - 1) * this.#dataInterval);
      const chartWidth = this.#canvasManager.size.media.width - this.yAxisWidth;
      this.#fitVisibleToData(trimmedFirst, last, chartWidth);
      // Programmatic zoom — X snaps to the new window (matches the legacy
      // `setRange` semantics every consumer reads `chart.getVisibleRange()`
      // synchronously after), Y eases via the sticky-Y baseline so the
      // axis re-fit isn't a jarring jump.
      this.#commitProgrammaticZoom();

      return;
    }

    if ('bars' in spec) {
      if (!Number.isInteger(spec.bars) || spec.bars < 2) return;

      const from = normalizeTime(spec.from);
      const to = from + spec.bars * this.#dataInterval;
      this.#autoScroll = this.#dataEnd !== null && this.#dataEnd >= from && this.#dataEnd <= to;
      this.#commitLogical({ from, to }, { emitChange: true });
      // Hold the viewport until the data fills the gap on the right —
      // standard streaming warm-up window.
      this.#holdUntilFilled = true;
      this.#commitProgrammaticZoom();

      return;
    }

    const from = normalizeTime(spec.from);
    const to = normalizeTime(spec.to);
    this.#autoScroll = this.#dataEnd !== null && this.#dataEnd >= from && this.#dataEnd <= to;
    this.#holdUntilFilled = false;
    const changed = this.#commitLogical({ from, to }, { emitChange: true });

    if (opts?.gesture) {
      // Gesture mode (multi-chart sync): ease X and Y on the same fast,
      // velocity-matched profile a hand pan/zoom uses rather than the
      // sticky-Y programmatic settle, so a synced pane tracks the
      // originating gesture in lockstep. Skip the engine retarget on a
      // no-op commit — the source re-emits `viewportChange` every animation
      // frame with an unchanged logical X, and re-arming the Y curve each
      // frame would reset its segment clock and stall the ease.
      if (changed) this.#commitGestureZoom();

      return;
    }

    this.#commitProgrammaticZoom();
  }

  getYRange() {
    return this.#yRange;
  }

  getCrosshairPosition(): CrosshairPosition | null {
    return this.#crosshairPos;
  }

  /**
   * Programmatically set or clear the crosshair. Same effect as the user
   * hovering over `(timeToX(time), valueToY(y))` — emits `crosshairMove`,
   * marks the overlay layer dirty, and lets `<Crosshair>` / `<Tooltip>`
   * react via their normal store subscriptions.
   *
   * Pass `null` to clear (mirrors the pointer-leave path).
   *
   * `y` is optional. Resolution order when omitted:
   *   1. **current crosshair's y** — preserves whatever the chart already
   *      has (real cursor y, or a previously-synthesised value). This is
   *      what makes the cross-chart broadcast pattern work: when an echo
   *      arrives at the chart that originated the hover, the existing y
   *      stays in place and the idempotency check below short-circuits the
   *      loop. Without preservation, the echo would overwrite the source's
   *      real cursor y with the midpoint default and the tooltip would
   *      jitter between cursor and midpoint every mouse-move.
   *   2. **midpoint of the current Y range** — fallback when there is no
   *      current crosshair (first programmatic set on a chart that hasn't
   *      been hovered yet).
   *
   * Idempotent: a call that produces the same `(time, y)` pair as the
   * current crosshair is a no-op (no emit). Combined with the y-preservation
   * above, this lets N charts broadcast their hover to each other without
   * a feedback-loop guard.
   *
   * The echo protection assumes the broadcast is **synchronous** (call
   * `setCrosshair` directly from the `crosshairMove` listener). An echo
   * routed through an async hop — a state store, a React render — can
   * arrive with a stale `time` while the origin chart streams, miss the
   * idempotency check, and flip that chart to time-anchored until the next
   * real pointer move (see {@link #syncCrosshairToViewport}).
   */
  setCrosshair(pos: { time: number; y?: number } | null): void {
    if (pos === null) {
      if (this.#crosshairPos === null) return;
      this.#crosshairPos = null;
      this.#overlayScheduler.markDirty();
      this.emit('crosshairMove', null);
      return;
    }

    const { time } = pos;
    if (!Number.isFinite(time)) return;

    const current = this.#crosshairPos;
    let y: number;
    if (pos.y !== undefined) {
      y = pos.y;
    } else if (current !== null) {
      y = current.y;
    } else {
      const yRange = this.#yRange;
      y = (yRange.min + yRange.max) / 2;
    }

    // Reject non-finite y same as time — `valueToY(NaN)` produces NaN
    // pixel coords that break overlays anchoring to the crosshair.
    if (!Number.isFinite(y)) return;

    if (current !== null && current.time === time && current.y === y) return;

    const mediaX = this.timeScale.timeToX(time);
    const mediaY = this.yScale.valueToY(y);

    // Anchor flips only past the idempotency check — an echo of the same
    // (time, y) back to the chart that originated the hover returns above
    // and leaves that chart pointer-anchored.
    this.#crosshairAnchor = 'time';
    this.#crosshairPos = { mediaX, mediaY, time, y };
    this.#overlayScheduler.markDirty();
    this.emit('crosshairMove', this.#crosshairPos);
  }

  /** Get the last visible value and whether the absolute last point is on screen. */
  getLastValue(seriesId: string): { value: number; isLive: boolean } | null {
    return getLastValue(seriesId, this.#series, this.#engine.getAnimationState().xRange);
  }

  /** Get the second-to-last value, useful for computing change. */
  getPreviousClose(seriesId: string): number | null {
    return getPreviousClose(seriesId, this.#series);
  }

  getLastData(seriesId: string): OHLCData | TimePoint | null {
    const entry = this.#series.find((s) => s.id === seriesId);
    if (!entry || !isTimeSeriesRenderer(entry.renderer)) return null;

    return entry.renderer.getLastDataPoint();
  }

  /** Find the data point closest to the given timestamp within one data interval. */
  getDataAtTime(seriesId: string, time: number): OHLCData | TimePoint | null {
    const entry = this.#series.find((s) => s.id === seriesId);
    if (!entry) return null;
    return entry.renderer.getDataAtTime?.(time, this.#dataInterval) ?? null;
  }

  /**
   * Get all layers' data at a given time for multi-layer series (Bar/Line
   * with stacking). Each entry carries the owning `layerIndex` and the
   * snapped sample time — callers must not derive layer identity from the
   * array index, because hidden layers are filtered out.
   */
  getLayerSnapshots(
    seriesId: string,
    time: number,
  ): { layerIndex: number; time: number; value: number; color: string }[] | null {
    const entry = this.#series.find((s) => s.id === seriesId);
    if (!entry?.visible) return null;

    return entry.renderer.getLayerSnapshots?.(time, this.#dataInterval) ?? null;
  }

  getSeriesIds(): string[] {
    if (!this.#seriesIdCache) {
      this.#seriesIdCache = this.#series.map((s) => s.id);
    }

    return this.#seriesIdCache.slice();
  }

  /**
   * True if any visible series has a time axis (line / bar / candlestick).
   * Used to gate crosshair rendering — a spatial-only chart (pie, heatmap)
   * has no meaningful x/y coordinate system, so the dashed hairlines would
   * just be visual noise.
   */
  #hasTimeSeries(): boolean {
    for (const entry of this.#series) {
      if (!entry.visible) continue;
      if (isTimeSeriesRenderer(entry.renderer)) return true;
    }

    return false;
  }

  /**
   * Filter `getSeriesIds()` by renderer type. A concrete kind (`'pie'`,
   * `'heatmap'`, a custom kind, …) returns series of that exact kind;
   * `'time'` returns every time-axis series (line/bar/candlestick and any
   * custom time-series kind).
   *
   * - `opts.visibleOnly` — exclude series with `isSeriesVisible=false`; for
   *   multi-layer series also exclude when every layer is hidden.
   * - `opts.singleLayerOnly` — exclude series with more than one layer.
   *   Useful for YLabel fallback priority (stick to a single line first).
   */
  getSeriesIdsByType(type: SeriesKind | 'time', opts?: { visibleOnly?: boolean; singleLayerOnly?: boolean }): string[] {
    const visibleOnly = opts?.visibleOnly === true;
    const singleLayerOnly = opts?.singleLayerOnly === true;
    const result: string[] = [];
    for (const entry of this.#series) {
      const matches = type === 'time' ? isTimeSeriesRenderer(entry.renderer) : entry.renderer.kind === type;
      if (!matches) continue;

      const layerCount = entry.renderer.getLayerCount();
      if (singleLayerOnly && layerCount > 1) continue;

      if (visibleOnly) {
        if (!entry.visible) continue;
        if (layerCount > 1) {
          let anyLayerVisible = false;
          for (let i = 0; i < layerCount; i++) {
            if (entry.renderer.isLayerVisible(i)) {
              anyLayerVisible = true;
              break;
            }
          }
          if (!anyLayerVisible) continue;
        }
      }

      result.push(entry.id);
    }

    return result;
  }

  /**
   * Cumulative top last-value for stacked series — the point a YLabel badge
   * anchors to on the rendered stack head. Falls back to `getLastValue` for
   * series without stacked concepts (Candlestick, single-layer Line/Bar).
   * Returns `null` for unknown ids or empty series.
   */
  getStackedLastValue(seriesId: string): { value: number; isLive: boolean } | null {
    return getStackedLastValue(seriesId, this.#series, this.#engine.getAnimationState().xRange);
  }

  /**
   * Stacked value at an arbitrary `time` — the cumulative stack top at that
   * sample, sharing a basis with {@link getStackedLastValue}. Falls back to the
   * nearest raw sample (close / value) for renderers without a stacked concept
   * (Candlestick, single-layer Line/Bar). Returns `null` for unknown ids or
   * when no sample sits near `time`. Used by the YLabel intro count-up start.
   */
  getStackedValueAtTime(seriesId: string, time: number): number | null {
    const entry = this.#series.find((s) => s.id === seriesId);
    if (!entry) return null;

    const stacked = entry.renderer.getStackedValueAtTime?.(time, this.#dataInterval);
    if (stacked !== null && stacked !== undefined) return stacked;

    const point = entry.renderer.getDataAtTime?.(time, this.#dataInterval);
    if (!point) return null;

    return 'close' in point ? point.close : point.value;
  }

  /**
   * Per-layer last snapshots with each layer's own `time`. Returns `null`
   * for single-layer renderers or when no visible layer has data. Used by
   * overlay components that must display every layer in last-mode even
   * when layers advance at different rates (ragged streams).
   */
  getLayerLastSnapshots(seriesId: string): { layerIndex: number; time: number; value: number; color: string }[] | null {
    const entry = this.#series.find((s) => s.id === seriesId);

    return entry?.renderer.getLayerLastSnapshots?.() ?? null;
  }

  /**
   * Shallow view of the internal series entries so unit tests can introspect
   * renderer state without exporting a public `getRenderer(id)` (which would
   * leak an implementation detail). Named to discourage use outside of tests.
   *
   * @internal
   */
  listSeriesForTest(): Array<{ id: string; renderer: SeriesRenderer }> {
    return this.#series.map((s) => ({ id: s.id, renderer: s.renderer }));
  }

  /** Get the primary display color for a series. */
  getSeriesColor(seriesId: string): string | null {
    const entry = this.#series.find((s) => s.id === seriesId);
    if (!entry) return null;
    const colors = entry.renderer.getLayerColors();
    return colors[0] ?? this.#theme.line.color;
  }

  /** The series' primary name (first layer). Used for single-layer overlays. */
  getSeriesLabel(seriesId: string): string | undefined {
    return this.#series.find((s) => s.id === seriesId)?.labels?.[0];
  }

  /** The display name of one layer, or `undefined` when that layer is unnamed. */
  getLayerLabel(seriesId: string, layerIndex: number): string | undefined {
    return this.#series.find((s) => s.id === seriesId)?.labels?.[layerIndex];
  }

  /**
   * Set every layer's display name at once (index = layer). Drives the tooltip,
   * legend, and info bar. Called by the framework wrappers as the carried
   * per-layer labels in `data` change. No-ops (and skips the overlay bump) when
   * the labels are unchanged, so it's safe to call on every data tick.
   */
  setSeriesLabels(seriesId: string, labels: (string | undefined)[]): void {
    const entry = this.#series.find((s) => s.id === seriesId);
    if (!entry || labelsEqual(entry.labels, labels)) return;

    entry.labels = labels;
    this.#bumpOverlayVersion();
  }

  /**
   * Set the per-layer color overrides carried in `data` (sparse — `undefined`
   * leaves that layer on the theme base). A {@link ValueColor} per layer: a
   * string (uniform) or a function of value (per bar / per segment). Handed to
   * the renderer, which keeps them separate from the theme base so a theme swap
   * preserves them. Called by the framework wrappers; no-ops when unchanged.
   */
  setLayerColors(seriesId: string, overrides: (ValueColor | undefined)[]): void {
    const entry = this.#series.find((s) => s.id === seriesId);
    if (!entry || colorOverridesEqual(entry.colorOverrides, overrides)) return;

    entry.colorOverrides = overrides;
    entry.renderer.setColorOverrides?.(overrides);
    this.#mainScheduler.markDirty();
    this.#bumpOverlayVersion();
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
      // The renderer keeps `data` color overrides separate from the theme base,
      // so applyTheme rewrites only the base and the overrides ride through.
      entry.renderer.applyTheme(theme, prev);
    }
    this.#mainScheduler.markDirty();
    this.#bumpOverlayVersion();
  }

  getTheme(): ChartTheme {
    return this.#theme;
  }

  /** BCP 47 locale applied to the built-in time-axis / tooltip / crosshair formatting. */
  setLocale(locale: string | undefined): void {
    this.timeScale.setLocale(locale);
    this.#bumpOverlayVersion();
  }

  getLocale(): string | undefined {
    return this.timeScale.getLocale();
  }

  /** IANA timezone applied to the same built-in date-time formatting. */
  setTimeZone(timeZone: string | undefined): void {
    this.timeScale.setTimeZone(timeZone);
    this.#bumpOverlayVersion();
  }

  getTimeZone(): string | undefined {
    return this.timeScale.getTimeZone();
  }

  /** Update axis configuration and re-render. */
  setAxis(config: AxisConfig): void {
    const prevYW = this.yAxisWidth;
    const prevXH = this.xAxisHeight;

    this.#axis = config;
    // Sync Y bounds from axis config
    this.#yBounds = { min: config.y?.min, max: config.y?.max };
    this.#yInited = true;
    const now = performance.now();
    this.#engine.onAxisReconfig(now);
    this.#applyEngineState(now);
    if (this.yAxisWidth !== prevYW || this.xAxisHeight !== prevXH) {
      this.syncScales();
    }
    this.#mainScheduler.markDirty();
  }

  /**
   * Apply label-density knobs driven by `<YAxis labelCount=… minLabelSpacing=…>`
   * — kept separate from {@link setAxis} so component props don't force a
   * Y-animation reset. Triggers a viewportChange + repaint so static charts
   * react without waiting for pan/zoom.
   */
  setYAxisLabelDensity(params: { labelCount?: number | null; minLabelSpacing?: number | null }): void {
    let dirty = false;
    if ('labelCount' in params) {
      this.yScale.setLabelCount(params.labelCount ?? null);
      dirty = true;
    }
    if ('minLabelSpacing' in params) {
      this.yScale.setMinSpacing(params.minLabelSpacing ?? null);
      dirty = true;
    }
    if (dirty) {
      this.syncScales();
      this.emit('viewportChange');
      this.#mainScheduler.markDirty();
    }
  }

  /** Label-density knobs for the time axis — mirror of {@link setYAxisLabelDensity}. */
  setTimeAxisLabelDensity(params: { labelCount?: number | null; minLabelSpacing?: number | null }): void {
    let dirty = false;
    if ('labelCount' in params) {
      this.timeScale.setLabelCount(params.labelCount ?? null);
      dirty = true;
    }
    if ('minLabelSpacing' in params) {
      this.timeScale.setMinSpacing(params.minLabelSpacing ?? null);
      dirty = true;
    }
    if (dirty) {
      this.syncScales();
      this.emit('viewportChange');
      this.#mainScheduler.markDirty();
    }
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

  /**
   * Update viewport padding at runtime. Refits the visible time range to
   * current data bounds **only when horizontal padding (left/right) changes**
   * — vertical padding only affects the Y-range computation, so touching it
   * shouldn't reset the user's zoom / auto-scroll state. This matters when
   * a wrapper re-applies padding reactively (e.g. in response to a Title /
   * InfoBar ResizeObserver).
   */
  setPadding(padding: ChartOptions['padding']): void {
    const prev = this.#padding;
    this.#padding = resolvePadding(padding);
    const next = this.#padding;
    const horizontalChanged =
      !isSameHorizontalPadding(prev.left, next.left) || !isSameHorizontalPadding(prev.right, next.right);
    const verticalChanged = prev.top !== next.top || prev.bottom !== next.bottom;
    if (horizontalChanged) {
      const { first, last } = this.getDataBounds();
      if (first !== undefined && last !== undefined) {
        const chartWidth = this.#canvasManager.size.media.width - this.yAxisWidth;
        this.#fitVisibleToData(first, last, chartWidth);
      }
    }
    if (horizontalChanged || verticalChanged) {
      // Horizontal change shifts logicalRange → Y target moves with the new
      // window; vertical change shifts the pixel-padded yRange → renderers
      // need the next setYRange call to pick up the new top/bottom gutters.
      this.#yInited = true;
      const now = performance.now();
      this.#engine.onAxisReconfig(now);
      this.#applyEngineState(now);
    }
    this.syncScales();
    this.#mainScheduler.markDirty();
    // Vertical changes need their own emit: fitToData's viewport 'change'
    // fired before the Y re-fit, so subscribers that landed on it saw a stale
    // yScale. Re-emit after syncScales pushes the new yRange so React
    // components (YLabel, YAxis) pick up the final scale. Covers both
    // vertical-only (no prior emit) and combined changes (first emit stale).
    if (verticalChanged) {
      this.emit('viewportChange');
    }
  }

  /** Show or hide the background grid. Takes effect on the next render frame. */
  setGrid(grid: { visible: boolean }): void {
    this.#grid = grid.visible;
    this.#mainScheduler.markDirty();
  }

  /**
   * Set the visual state for one side of the chart. Typically called in
   * response to the `onEdgeReached` callback:
   *   - `loading` while a history fetch is in flight,
   *   - `no-data` once the fetch confirmed there's nothing more,
   *   - `idle` when the host no longer wants any edge affordance.
   * The state persists until replaced. `has-more` is accepted for API
   * symmetry and currently renders identically to `idle`.
   */
  setEdgeState(side: EdgeSide, state: EdgeState): void {
    if (this.#edgeStates[side] === state) return;
    this.#edgeStates[side] = state;
    this.#overlayScheduler.markDirty();
  }

  /** Read the current host-declared state for a given edge. */
  getEdgeState(side: EdgeSide): EdgeState {
    return this.#edgeStates[side];
  }

  /**
   * Swap the painter used for a side's `loading` spinner — the same
   * pluggable-function contract as the series intro animations. `null`
   * (default) falls back to the built-in three-dot spinner. Takes effect
   * immediately if that side is currently in the `loading` state.
   */
  setEdgeIndicator(side: EdgeSide, indicator: LoadingIndicatorFn | null): void {
    this.#edgeIndicatorFns[side] = indicator;
    if (this.#edgeStates[side] === 'loading') this.#overlayScheduler.markDirty();
  }

  /**
   * Resolve the boundary point's Y position and series kind on the primary
   * visible time series, for a custom edge indicator that wants to start
   * exactly where the real chart leaves off and match its shape (candle vs.
   * plain bar/line). `left` continues from the first visible candle's
   * `open` (the value immediately preceding the boundary); `right` from the
   * last visible candle's `close`.
   */
  #resolveEdgeAnchor(side: EdgeSide, boundaryTime: number): { valueY: number; seriesKind: SeriesKind } | null {
    const singleLayer = this.getSeriesIdsByType('time', { visibleOnly: true, singleLayerOnly: true });
    const seriesId = singleLayer[0] ?? this.getSeriesIdsByType('time', { visibleOnly: true })[0];
    if (!seriesId) return null;

    const point = this.getDataAtTime(seriesId, boundaryTime);
    if (!point) return null;

    const entry = this.#series.find((s) => s.id === seriesId);
    if (!entry) return null;

    return {
      valueY: this.yScale.valueToY(resolveEdgeAnchorValue(side, point)),
      seriesKind: entry.renderer.kind,
    };
  }

  /**
   * Resolve the media-pixel spacing between adjacent bars at the chart's
   * current zoom level, for a custom edge indicator that wants to size its
   * placeholder shapes to match the real bars that will render once data
   * lands. `null` when the viewport has no meaningful span yet.
   */
  #resolveEdgeBarSpacing(): number | null {
    const spacing = this.timeScale.barWidthMedia(this.#dataInterval);

    return Number.isFinite(spacing) && spacing > 0 ? spacing : null;
  }

  /**
   * Notify chart that a YLabel overlay is mounted / unmounted. Currently a
   * no-op — placeholder for the right-padding reflow that will adjust the
   * chart area to make room for the badge.
   * TODO: implement reflow.
   */
  setYLabel(_has: boolean): void {
    // intentionally empty
  }

  /**
   * Dispatch a crosshair move to every renderer that supports spatial hover
   * (pie, heatmap — anything implementing hitTest/setHoverIndex). Any change
   * in hover index schedules a main-layer redraw. Keep this loop capability-
   * probed, not kind-gated: a kind check here silently kills hover for the
   * next spatial renderer.
   */
  #updateHover(pos: CrosshairPosition | null): void {
    const size = this.#canvasManager.size;
    const vpad = this.#padding;
    const padding = {
      top: vpad.top * size.verticalPixelRatio,
      bottom: vpad.bottom * size.verticalPixelRatio,
    };
    let changed = false;
    let hovered: SeriesHoverInfo | null = null;
    for (const entry of this.#series) {
      if (!entry.renderer.hitTest || !entry.renderer.setHoverIndex) continue;
      let index = -1;
      if (pos) {
        const bx = pos.mediaX * size.horizontalPixelRatio;
        const by = pos.mediaY * size.verticalPixelRatio;
        index = entry.renderer.hitTest(bx, by, size.bitmap.width, size.bitmap.height, padding);
      }
      if (entry.renderer.setHoverIndex(index)) {
        changed = true;
      }
      if (index >= 0 && !hovered) {
        hovered = { seriesId: entry.id, index, info: entry.renderer.getHoverInfo?.(this.#theme) ?? null };
      }
    }
    if (changed) {
      this.#mainScheduler.markDirty();
      this.emit('seriesHover', hovered);
    }
  }

  /**
   * Read-only counterpart to {@link #updateHover} for `pointClick` — same
   * capability-probed `hitTest` scan, but doesn't touch `setHoverIndex` (a
   * click shouldn't move the hover state the last pointer move already set).
   * Returns the first spatial series (pie, heatmap, or a custom spatial kind)
   * whose `hitTest` claims the position, or `null` if none does.
   */
  #spatialHitAt(pos: CrosshairPosition): { seriesId: string; index: number } | null {
    const size = this.#canvasManager.size;
    const vpad = this.#padding;
    const padding = {
      top: vpad.top * size.verticalPixelRatio,
      bottom: vpad.bottom * size.verticalPixelRatio,
    };
    const bx = pos.mediaX * size.horizontalPixelRatio;
    const by = pos.mediaY * size.verticalPixelRatio;

    for (const entry of this.#series) {
      if (!entry.renderer.hitTest) continue;
      const index = entry.renderer.hitTest(bx, by, size.bitmap.width, size.bitmap.height, padding);
      if (index >= 0) return { seriesId: entry.id, index };
    }

    return null;
  }

  /**
   * Re-derive the crosshair after the viewport moved beneath it. A streaming
   * auto-scroll, wheel zoom, or animated Y re-fit shifts the pixel↔data
   * mapping while the cursor stays put — without this, the stored position
   * goes stale: the tooltip freezes on the old time/values while the data
   * (and any snap dots anchored to it) slides away underneath.
   *
   * Which half of the position is truth depends on {@link #crosshairAnchor}:
   * a pointer-anchored crosshair stays under the cursor and re-resolves
   * `time`/`y`; a time-anchored one keeps `time`/`y` and re-projects the
   * pixel position so it tracks its data point across the screen. A
   * time-anchored point whose time scrolls out of the visible range clears
   * the crosshair entirely (mirroring pointer-leave) — otherwise the
   * edge-clamped tooltip would pin to the chart border, live-updating for
   * an invisible point.
   *
   * Called once per painted main frame (after `syncScales`). When the
   * viewport didn't move, the re-derived values are bit-identical and the
   * method exits without emitting.
   */
  #syncCrosshairToViewport(): void {
    const pos = this.#crosshairPos;
    if (pos === null) return;

    // Y re-targeting on a streaming append can land the settled range one
    // float ULP away from the previous frame — a strict equality would turn
    // that invisible jitter into a crosshairMove per tick. Treat changes
    // below a relative epsilon (1e-9 of the visible span, sub-micropixel)
    // as "didn't move".
    const { from, to } = this.timeScale.getRange();
    const yRange = this.yScale.getRange();
    const timeTolerance = Math.abs(to - from) * 1e-9;
    const yTolerance = Math.abs(yRange.max - yRange.min) * 1e-9;
    const pixelTolerance = 1e-6;

    let next: CrosshairPosition;
    if (this.#crosshairAnchor === 'pointer') {
      const time = this.timeScale.xToTime(pos.mediaX);
      const y = this.yScale.yToValue(pos.mediaY);

      // A degenerate scale (zero-width range, zero-size canvas) can derive
      // non-finite values — keep the last good position rather than emit NaN.
      if (!Number.isFinite(time) || !Number.isFinite(y)) return;
      if (Math.abs(time - pos.time) <= timeTolerance && Math.abs(y - pos.y) <= yTolerance) return;

      next = { mediaX: pos.mediaX, mediaY: pos.mediaY, time, y };
    } else {
      // The anchored point scrolled out of the visible range — clear the
      // crosshair (mirrors pointer-leave) instead of letting the clamped
      // tooltip pin to the chart edge for an invisible point. Linked charts
      // re-broadcast on every hover frame, so it comes back on its own.
      if (pos.time < from || pos.time > to) {
        this.#crosshairPos = null;
        this.#overlayScheduler.markDirty();
        this.emit('crosshairMove', null);
        this.#updateHover(null);

        return;
      }

      const mediaX = this.timeScale.timeToX(pos.time);
      const mediaY = this.yScale.valueToY(pos.y);

      if (!Number.isFinite(mediaX) || !Number.isFinite(mediaY)) return;
      if (Math.abs(mediaX - pos.mediaX) <= pixelTolerance && Math.abs(mediaY - pos.mediaY) <= pixelTolerance) return;

      next = { mediaX, mediaY, time: pos.time, y: pos.y };
    }

    this.#crosshairPos = next;
    this.#overlayScheduler.markDirty();
    this.emit('crosshairMove', next);
    this.#updateHover(next);
  }

  /** Tear down the chart: cancel animations, remove listeners, and detach the canvas. */
  destroy(): void {
    for (const entry of this.#series) entry.renderer.dispose();
    this.#series = [];
    this.#markers = [];
    this.#regions = [];
    this.#lines = [];
    this.#seriesIdCache = null;
    this.#mainScheduler.destroy();
    this.#overlayScheduler.destroy();
    this.#interactions?.destroy();
    this.#canvasManager.destroy();
    this.#perfHud?.destroy();
    this.#perfHud = null;
    // Only tear down the monitor if we created it. Caller-supplied monitors
    // may be shared across multiple charts or consumed by host telemetry.
    if (this.#ownsPerfMonitor) this.#perfMonitor?.destroy();
    this.#perfMonitor = null;
    this.#ownsPerfMonitor = false;
    this.removeAllListeners();
  }

  /** The attached performance monitor, or `null` when instrumentation is disabled. */
  getPerfMonitor(): PerfMonitor | null {
    return this.#perfMonitor;
  }

  /** Compute the earliest and latest timestamps across all series. */
  private getDataBounds(): { first: number | undefined; last: number | undefined } {
    let first: number | undefined;
    let last: number | undefined;
    for (const entry of this.#series) {
      if (!entry.visible) continue;
      if (!isTimeSeriesRenderer(entry.renderer)) continue;

      // `getTimeBounds` aggregates across ALL layers, so a ragged multi-layer
      // series reports its true span (not just layer 0's).
      const bounds = entry.renderer.getTimeBounds();
      if (bounds === null) continue;

      if (first === undefined || bounds.first < first) first = bounds.first;
      if (last === undefined || bounds.last > last) last = bounds.last;
    }

    return { first, last };
  }

  /** Set by `setSeriesData`/bulk-replace paths so the next `onDataChanged`
   * snaps the Y range (instead of easing) and `yScale.getRange()` reflects
   * the new domain synchronously. Cleared by `onDataChanged` after each run. */
  #dataReplaceSnapPending = false;

  private onDataChanged(): void {
    if (this.#batchDepth > 0) {
      this.#batchDataDirty = true;
      return;
    }

    this.updateDataInterval();

    const { first, last } = this.getDataBounds();
    if (first !== undefined) this.#dataStart = first;
    if (last !== undefined) {
      this.#prevDataEnd = this.#dataEnd;
      this.#dataEnd = last;
    }

    // Snap Y/X only on a true bulk replace (`chart.setSeriesData` flipped
    // `#dataReplaceSnapPending`) or on the first paint with data. Streaming
    // appends and React-batched bursts all flow through the streaming retarget
    // so the engine's X spring rides its baseline settle into the new tail —
    // snapping here would produce a jump-per-commit pattern visible as
    // "X teleports between batches".
    const replaceSnap = this.#dataReplaceSnapPending;
    this.#dataReplaceSnapPending = false;

    // Capture "was this the first onDataChanged call that actually had
    // data" *before* the engine signal flips `#yInited`. Initial mounts
    // where data flows in asynchronously (e.g. `useOHLCStream` first emits
    // `[]` then later `setData(history)`) hit this path on the second call;
    // the first (empty) call returns early from `#computeYTarget` without
    // setting `#yInited`.
    const isFirstDataPaint = !this.#yInited && first !== undefined;

    // A bulk replace swaps in an entirely new tick set. If the tick trackers
    // stay armed with the previous dataset they'd fade the old labels out and
    // the new ones in over the next 250 ms, briefly showing "ghost" grid
    // lines from the prior range. Reset so the dataset swap snaps the same
    // way the Y emit below is about to snap the Y bound.
    if (replaceSnap) {
      this.yScale.tickTracker.reset();
      this.timeScale.tickTracker.reset();
    }

    // Engine pulls the X target by calling `#computeXTarget`
    // through the `computeXTarget` closure — the closure runs viewport
    // fit / streaming-target math on demand and reads `#dataStart` /
    // `#dataEnd` (for the timestamps) plus `#pendingFitToData` (mirrors
    // `replaceSnap`) to pick the right path. Y is pulled separately via the
    // `computeYTarget` closure against the new X window.
    // `#yInited` flips optimistically — `#computeYTarget` self-clears
    // it when no series has data in the window, so the next paint with
    // values lands as a first-paint snap.
    this.#pendingFitToData = replaceSnap;
    const now = performance.now();
    if (replaceSnap || isFirstDataPaint) {
      // Seed the cadence baseline at paint/replace time so the first streaming
      // append measures a real wall-clock gap and rides the cadence-tuned
      // settle. Without this the first append eases on the bare floor and
      // settles before the next tick (a bell curve that stops) while every
      // later tick slides continuously — the visible first-point stutter.
      this.#cadence.seed(now);
      this.#engine.onDataReplaced(now);
    } else {
      this.#engine.onPointAppended(now);
    }

    if (this.#engine.lastXTarget !== null) {
      this.#xInited = true;
    }
    if (first !== undefined) {
      this.#yInited = true;
    }

    this.#applyEngineState(now);
    // Re-sync scales so React components read correct yScale values.
    this.syncScales();

    // On the very first paint with data, render synchronously so the
    // canvas comes up alongside the DOM (YLabel, axis labels) in the
    // same browser paint. Subsequent updates go through `markDirty` so
    // streaming ticks coalesce per RAF and Y-range easing gets at least
    // one frame to advance before painting.
    if (isFirstDataPaint) {
      this.#renderFrame();
    } else {
      this.#mainScheduler.markDirty();
    }
    this.emit('dataUpdate');
    this.#bumpOverlayVersion();
  }

  private updateDataInterval(): void {
    for (const entry of this.#series) {
      if (!isTimeSeriesRenderer(entry.renderer)) continue;

      // `>= 2` guard preserved: `detectInterval` on a lone timestamp lies.
      const times = entry.renderer.sampleTimes(20);
      if (times.length >= 2) {
        this.#dataInterval = detectInterval(times);
        break;
      }
    }
  }

  /** Whether the Y range has been initialized (first snap vs smooth lerp).
   *  Pre-init Y emits are forced to `instant` so the first paint snaps to
   *  data regardless of the caller's requested kind. Also reset by paths
   *  that intentionally invalidate the current Y baseline (axis bound
   *  change, empty viewport). */
  #yInited = false;
  /** Whether the engine's X slot has received its first emit. Pre-init X
   *  emits are forced to `instant` so first paint snaps to the fitted
   *  range — without this guard the engine would ease from `{0,0}` into
   *  the new target and the very first frame would render with a
   *  zero-width X domain. */
  #xInited = false;

  /**
   * One-shot `setVisibleRange` argument applied on the first data arrival.
   * Captured at chart construction from {@link ChartOptions.viewport.initialRange};
   * cleared the moment it's consumed so subsequent data swaps don't snap
   * back to the initial window.
   */
  #initialVisibleRange: VisibleRangeSpec | undefined;

  /** Last Y bounds the engine resolved into {@link AnimationState.yRange}.
   *  Used by {@link renderMain} to detect Y movement frame-to-frame so
   *  `viewportChange` only emits when the Y range actually shifted — DOM
   *  axis labels subscribe to that event and re-renders on every tick are
   *  expensive. Initialised to NaN so the first real Y emit always passes
   *  the change check. */
  #prevYMin = Number.NaN;
  #prevYMax = Number.NaN;

  /**
   * Sample the visible data window and return the resolved Y bounds, or
   * `null` when no series has data inside the X destination range.
   * Sampling runs against `logicalRange` (the X target, not the animating
   * current), so Y stays on a stable target while X eases — both dimensions
   * converge together. Clears {@link #yInited} on empty so the next emit
   * with valid data lands as an instant snap.
   */
  #computeYTarget(xTarget?: XRange): { min: number; max: number } | null {
    const targetVisible = xTarget ?? this.#logical;

    // Only collect individual values when bounds use a function/percentage (rare).
    const needsAllValues =
      (this.#yBounds.min !== undefined && this.#yBounds.min !== 'auto' && typeof this.#yBounds.min !== 'number') ||
      (this.#yBounds.max !== undefined && this.#yBounds.max !== 'auto' && typeof this.#yBounds.max !== 'number');
    const allValues: number[] | null = needsAllValues ? [] : null;

    const raw = computeTargetYRange(targetVisible, this.#series, allValues);
    if (raw === null) {
      this.#yInited = false;
      return null;
    }

    const min = resolveBound(this.#yBounds.min, raw.min, raw.max, allValues ?? [], 'min');
    const max = resolveBound(this.#yBounds.max, raw.max, raw.min, allValues ?? [], 'max');

    return { min, max };
  }

  /**
   * Engine pull-on-demand X target. Called by the engine's `computeXTarget`
   * closure during `engine.onPointAppended` / `engine.onDataReplaced`.
   * Reads `#dataStart` / `#dataEnd` (refreshed by `onDataChanged` just
   * before the engine signal) plus `#pendingFitToData` flag, then dispatches:
   *
   * - **uninit (viewport never committed)** → fit to data, apply any
   *   one-shot `initialVisibleRange`, return the new logical range.
   *   First-paint fit.
   * - **bulk replace + autoscroll** (`#pendingFitToData`) → fit to data,
   *   return logical. `chart.setSeriesData(...)` lands here.
   * - **streaming append + autoscroll** → `computeStreamingTarget` (preserves
   *   any pan offset across ticks via `#prevDataEnd`). The engine's X spring
   *   absorbs the new target — velocity carries across retargets so a burst
   *   of ticks doesn't restart easing on each one.
   * - **autoscroll off** → `null` (no X retarget; user has panned away
   *   from the tail).
   */
  #computeXTarget(): XRange | null {
    if (this.#dataStart === null || this.#dataEnd === null) return null;

    const { from, to } = this.#logical;
    const uninitialized = from === 0 && to === 0;
    const chartWidth = this.#canvasManager.size.media.width - this.yAxisWidth;

    if (uninitialized) {
      this.#fitVisibleToData(this.#dataStart, this.#dataEnd, chartWidth);
      // One-shot `initialVisibleRange` (e.g. "last 35 bars") — applied
      // inside the closure so the Y target the engine pulls next reflects
      // the *initial-window* data rather than the full dataset. Folds
      // post-mount `setVisibleRange` calls into the first paint.
      if (this.#initialVisibleRange !== undefined) {
        this.setVisibleRange(this.#initialVisibleRange);
        this.#initialVisibleRange = undefined;
      }

      return this.#logical;
    }

    if (!this.#autoScroll) return null;

    if (this.#pendingFitToData) {
      this.#fitVisibleToData(this.#dataStart, this.#dataEnd, chartWidth);

      return this.#logical;
    }

    const result = computeStreamingTarget({
      currentLogical: this.#logical,
      lastTime: this.#dataEnd,
      prevDataEnd: this.#prevDataEnd,
      dataInterval: this.#dataInterval,
      paddingRight: this.#padding.right,
      chartWidth,
      holdUntilFilled: this.#holdUntilFilled,
    });

    if (result.releaseHold) this.#holdUntilFilled = false;
    if (result.reengageAutoScroll) this.#autoScroll = true;
    if (result.newLogical === null) return null;

    // Observe cadence only when X actually advances. Sub-tick / intra-bar
    // emissions that don't move `lastTime` would otherwise poison the EMA
    // with their wall-clock spacing. The spring's baseline settle time is
    // then nudged so it stays slightly longer than the measured tick — the
    // spring keeps velocity instead of decaying to rest between ticks.
    this.#cadence.observe(performance.now());
    this.#engine.setXSettleMs(this.#cadence.pickSettleMs(this.#animationsConfig.axis.x.settleMs));

    this.#commitLogical(result.newLogical, { emitChange: false, skipValidation: true });
    this.#prevDataEnd = this.#dataEnd;

    return result.newLogical;
  }

  /**
   * Fit the viewport's logical X range around a data span. Mirrors the
   * old `viewport.fitToData` side effects: clears the warm-up hold,
   * forces autoscroll on (data tail is in the new window by construction),
   * commits the new range via `viewport.setRange` (which emits `change`).
   */
  #fitVisibleToData(firstTime: number, lastTime: number, chartWidth: number): void {
    const padding = this.#padding;
    const range = computeFitToData({
      firstTime,
      lastTime,
      dataInterval: this.#dataInterval,
      maxVisibleBars: this.#maxVisibleBars,
      chartWidth,
      padding: { left: padding.left, right: padding.right },
    });
    this.#holdUntilFilled = false;
    this.#autoScroll = true;
    this.#commitLogical(range, { emitChange: true });
  }

  /**
   * Commit a programmatic zoom — `fitContent` or `setVisibleRange`. Reads
   * the viewport's just-committed logical range as the X target; pulls
   * the matching Y target via the engine's `computeYTarget` callback so
   * the axis re-fits to the new window without the chart having to wire
   * Y separately.
   *
   * - First paint (`#xInited` or `#yInited` not yet set) → both axes snap
   *   so consumers reading `chart.getYRange()` / `chart.getVisibleRange()`
   *   synchronously after mount see the final values.
   * - Otherwise X snaps and Y eases on the sticky baseline. `fitContent`
   *   passes `xEase: true` so X eases instead — viewport and axis converge
   *   on the same frame.
   */
  #commitProgrammaticZoom(opts?: { xEase?: boolean }): void {
    const target = this.#logical;
    if (target.to <= target.from) return;

    const now = performance.now();
    if (!this.#xInited || !this.#yInited) {
      this.#snapToLogical(now);

      return;
    }

    this.#engine.onProgrammaticZoom({ xTarget: target, xEase: opts?.xEase }, now);
    this.#applyEngineState(now);
  }

  /**
   * Commit the current logical X to the engine on the *gesture* profile:
   * X and Y both ease over `animations.axis.{x,y}.gesture` via `onPanZoom`,
   * exactly the path a user pan/zoom takes. Contrast {@link
   * #commitProgrammaticZoom}, which snaps X and eases Y on the slower
   * sticky-Y baseline.
   *
   * Used by `setVisibleRange(..., { gesture: true })` for multi-chart sync,
   * so a synced pane re-fits its Y in lockstep with the originating gesture
   * instead of lagging on the long sticky contract. First paint still snaps
   * (same as the programmatic path) so synchronous readers see final values.
   */
  #commitGestureZoom(): void {
    const target = this.#logical;
    if (target.to <= target.from) return;

    const now = performance.now();
    if (!this.#xInited || !this.#yInited) {
      this.#snapToLogical(now);

      return;
    }

    this.#engine.onPanZoom({ xTarget: target, yAuto: true }, now);
    this.#applyEngineState(now);
  }

  /**
   * First-paint snap: land both axes on the current logical X immediately
   * (Y via {@link #computeYTarget}) and flip the init flags so later commits
   * ease instead of snapping. Shared by the programmatic and gesture zoom
   * commits — both must snap before the chart has painted once so a
   * synchronous `getYRange()` / `getVisibleRange()` read sees final values.
   */
  #snapToLogical(now: number): void {
    const target = this.#logical;
    const yTarget = this.#computeYTarget(target);
    this.#xInited = true;
    if (yTarget !== null) this.#yInited = true;
    this.#engine.snap({ x: target, y: yTarget ?? undefined }, now);
    this.#applyEngineState(now);
  }

  /**
   * Validate and commit a new logical X range. Mirrors the old
   * `Viewport.applyLogical` contract: silently no-ops on invalid input
   * (`to <= from`, fewer than 2 bars), then writes `#logical` and (if
   * `opts.emitChange` is true) wakes the render loop + emits
   * `viewportChange` for DOM subscribers.
   *
   * Streaming-target writes pass `emitChange: false` because the engine
   * drives the animation: `engine.onWake` already markedDirty, and the
   * follow-up `renderMain` syncs scales — a redundant `viewportChange`
   * emit here would just trigger a wasted React re-render per stream tick.
   *
   * Returns `true` when the range actually changed (passed validation and
   * differed from the current logical), `false` on a no-op. Callers that
   * drive the engine afterwards can skip a redundant retarget on `false` —
   * see `setVisibleRange`'s gesture path, where a per-frame echo would
   * otherwise re-arm and stall the in-flight Y ease.
   */
  #commitLogical(range: XRange, opts: { emitChange: boolean; skipValidation?: boolean }): boolean {
    const { from, to } = range;
    if (!Number.isFinite(from) || !Number.isFinite(to)) return false;
    if (to <= from) return false;
    // Streaming-target paths preserve the current visible range width verbatim;
    // skip the 2-bar minimum guard (it's user-input validation, not an
    // internal invariant). User-driven setRange / setVisibleRange leave it on.
    if (!opts.skipValidation && (to - from) / this.#dataInterval < 2) return false;

    if (this.#logical.from === from && this.#logical.to === to) return false;

    this.#logical = { from, to };
    if (opts.emitChange) {
      this.syncScales();
      this.#mainScheduler?.markDirty();
      this.emit('viewportChange');
    }

    return true;
  }

  /**
   * Apply pixel-padding to the engine's raw Y target and store the
   * result in `#yRange`. Mirrors the old `Viewport.setYRange` contract:
   * symmetric pad top / bottom from `#padding`, suppressed on the side
   * that has an explicit (fixed) axis bound.
   */
  #applyPaddedYRange(min: number, max: number, chartHeight: number, fixedMin: boolean, fixedMax: boolean): void {
    const dataRange = max - min;
    const padTop = chartHeight > 0 ? (this.#padding.top / chartHeight) * dataRange : 0;
    const padBottom = chartHeight > 0 ? (this.#padding.bottom / chartHeight) * dataRange : 0;
    this.#yRange = {
      min: fixedMin ? min : min - padBottom,
      max: fixedMax ? max : max + padTop,
    };
  }

  /**
   * Shift the visible time range by `timeDelta` ms. Hard-clamped so at
   * least one data point stays on screen — no rubber-band, no overshoot.
   * A pan that moves the viewport off the live-tail position flips
   * autoscroll off. Fires `edgeReached` whenever the clamp trims the
   * gesture (i.e., the user pushed past the boundary), so consumers can
   * trigger history loads. Forwards the committed target to the engine
   * as a gesture for visual easing. Public so consumers can drive pan
   * programmatically.
   */
  pan(timeDelta: number, chartWidth = this.#lastChartWidth): void {
    if (chartWidth > 0) this.#lastChartWidth = chartWidth;
    this.#holdUntilFilled = false;

    const result = computePan({
      currentLogical: this.#logical,
      timeDelta,
      chartWidth,
      dataInterval: this.#dataInterval,
      padding: { left: this.#padding.left, right: this.#padding.right },
      dataStart: this.#dataStart,
      dataEnd: this.#dataEnd,
    });
    if (result.newLogical === null) return;

    this.#autoScroll = !result.autoScrollOff;
    this.#commitLogical(result.newLogical, { emitChange: true });

    if (result.edgeReached !== null) {
      this.#edgeBoundaries[result.edgeReached.side] = result.edgeReached.boundaryTime;
      this.#onEdgeReached?.(result.edgeReached);
    }

    this.#cadence.pause();
    this.#emitGestureToEngine();
  }

  /**
   * Zoom around a time anchor. `factor < 1` zooms in, `> 1` zooms out.
   * In historical mode the window anchors to `centerTime` (cursor-driven).
   * Zoom-out is hard-capped at the padded data span. Forwards the committed
   * target to the engine as a gesture for visual easing. Public so consumers
   * can drive zoom programmatically.
   *
   * Sticky-follow: while `#autoScroll` is on, the new window is repositioned
   * so its right edge sits at `dataEnd + paddingRight` (follow position).
   * Span (zoom level) from `computeZoom` is preserved; only the position
   * is locked to the tail. This avoids the next-tick `computeStreamingTarget`
   * offset clamp (which would otherwise slide X left to the follow position
   * and produce a visible jump). Cursor-anchored zoom is intentionally
   * sacrificed in follow-live mode — pan first to inspect history.
   */
  zoomAt(centerTime: number, factor: number, chartWidth = this.#lastChartWidth): void {
    if (chartWidth > 0) this.#lastChartWidth = chartWidth;
    this.#holdUntilFilled = false;

    const result = computeZoom({
      currentLogical: this.#logical,
      centerTime,
      factor,
      chartWidth,
      dataInterval: this.#dataInterval,
      padding: { left: this.#padding.left, right: this.#padding.right },
      dataStart: this.#dataStart,
      dataEnd: this.#dataEnd,
    });
    if (result.newLogical === null) return;

    let newLogical = result.newLogical;

    if (this.#autoScroll && this.#dataEnd !== null) {
      const span = newLogical.to - newLogical.from;
      const prTime = resolvePaddingTime(this.#padding.right, span, this.#dataInterval, chartWidth);
      const desiredTo = this.#dataEnd + prTime;
      newLogical = { from: desiredTo - span, to: desiredTo };
      this.#prevDataEnd = this.#dataEnd;
    }

    this.#commitLogical(newLogical, { emitChange: true });
    this.#cadence.pause();
    this.#emitGestureToEngine();
  }

  /**
   * Common tail for `pan` / `zoomAt`: routes the just-committed `#logical`
   * to the engine as a gesture so the X spring retargets and the Y spring
   * eases over `animations.axis.y.gesture`.
   */
  #emitGestureToEngine(): void {
    const target = this.#logical;
    if (target.to <= target.from) return;

    this.#xInited = true;
    this.#yInited = true;
    const now = performance.now();
    this.#engine.onPanZoom({ xTarget: target, yAuto: true }, now);
    this.#applyEngineState(now);
  }

  /**
   * Tick the engine at the given wall clock and push the resolved X / Y
   * ranges into the viewport + scales. Called from every emit path so that
   * synchronous readers (`chart.getYRange()`, `chart.getVisibleRange()`
   * immediately after `setSeriesData` / `setSeriesVisible`) see the new
   * values without waiting for the next RAF — matches the legacy contract
   * pinned by `data-update-sync`, `visibility-batch`, and the `y-label`
   * repositioning tests.
   *
   * The caller passes the same wall it used as the event's `startWall` so
   * `effectiveNow === startWall` and the prune step keeps zero-duration
   * events long enough for the slot processor to snap them.
   */
  #applyEngineState(now: number): void {
    const state = this.#engine.tick(now);
    const size = this.#canvasManager.size;
    if (size.media.width === 0 || size.media.height === 0) return;

    const hasMinBound = this.#yBounds.min !== undefined && this.#yBounds.min !== 'auto';
    const hasMaxBound = this.#yBounds.max !== undefined && this.#yBounds.max !== 'auto';
    const chartHeight = size.media.height - this.xAxisHeight;
    this.#applyPaddedYRange(state.yRange.min, state.yRange.max, chartHeight, hasMinBound, hasMaxBound);
    this.#prevYMin = state.yRange.min;
    this.#prevYMax = state.yRange.max;
    this.syncScales();
  }

  /**
   * Lightweight scale sync: updates timeScale/yScale from current viewport state
   * without advancing the Y smoothing animation. Called from the viewport 'change'
   * handler, so DOM axis components always read fresh coordinates on re-render.
   */
  private syncScales(): void {
    const size = this.#canvasManager.size;
    if (size.media.width === 0 || size.media.height === 0) return;

    const chartWidth = size.media.width - this.yAxisWidth;
    const chartHeight = size.media.height - this.xAxisHeight;

    this.timeScale.update(
      this.#engine.getAnimationState().xRange,
      chartWidth,
      size.horizontalPixelRatio,
      this.#dataInterval,
    );
    this.yScale.update(this.#yRange, chartHeight, size.verticalPixelRatio);
  }

  /** Expensive: background, grid, all series. Only on data/viewport/resize change. */
  private renderMain(timestamp?: number): void {
    const size = this.#canvasManager.size;
    if (size.media.width === 0 || size.media.height === 0) return;

    // Engine owns both X and Y animation. Prefer the RAF-provided timestamp
    // so deterministic test harnesses (installRaf) drive the engine's dt
    // from synthetic frame time instead of the real wall clock.
    const now = typeof timestamp === 'number' ? timestamp : performance.now();

    const animationState = this.#engine.tick(now);
    if (animationState.animating) {
      this.#mainScheduler.markDirty();
    }

    // Engine state is the source of truth for X visual (read directly via
    // engine.getAnimationState().xRange in syncScales / getVisibleRange).
    // Y needs pixel padding applied before scales / renderers read it;
    // detect movement frame-to-frame so `viewportChange` only emits when
    // the axis shifted — DOM axis labels subscribe to that event and
    // re-renders aren't free.
    const yMin = animationState.yRange.min;
    const yMax = animationState.yRange.max;
    const yChanged = yMin !== this.#prevYMin || yMax !== this.#prevYMax;
    if (yChanged) {
      const hasMinBound = this.#yBounds.min !== undefined && this.#yBounds.min !== 'auto';
      const hasMaxBound = this.#yBounds.max !== undefined && this.#yBounds.max !== 'auto';
      const chartHeight = size.media.height - this.xAxisHeight;
      this.#applyPaddedYRange(yMin, yMax, chartHeight, hasMinBound, hasMaxBound);
      this.#prevYMin = yMin;
      this.#prevYMax = yMax;
    }

    this.syncScales();

    // Scales are fresh — reconcile the crosshair with the (possibly moved)
    // viewport so hover state never paints stale.
    this.#syncCrosshairToViewport();

    // Re-engage tail-following only when the user lands the viewport *at*
    // the live-tail position (newTo ≈ dataEnd + paddingRight). Just having
    // dataEnd inside the window is no longer enough — the previous rule
    // let any clamp-to-edge pan flip autoScroll back on and streaming
    // would visibly drag the viewport back to the tail.
    if (this.#dataEnd !== null && !this.#autoScroll) {
      const logical = this.#engine.lastXTarget ?? this.#logical;
      const range = logical.to - logical.from;
      if (range > 0) {
        const chartWidth = this.#canvasManager.size.media.width - this.yAxisWidth;
        const rightPadTime = resolvePaddingTime(this.#padding.right, range, this.#dataInterval, chartWidth);
        const tolerance = this.#dataInterval * 0.5;
        if (Math.abs(logical.to - (this.#dataEnd + rightPadTime)) < tolerance) {
          this.#autoScroll = true;
        }
      }
    }

    if (yChanged) {
      this.emit('viewportChange');
    }

    // Tick-tracker animation state — set inside the useMainLayer callback,
    // read by the settled-check below. Declared here so both blocks share
    // the same lexical scope.
    let yTickAnimating = false;
    let timeTickAnimating = false;

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

      // Diff current tick sets against the previous frame's and route the
      // entering / exiting tick values through the engine. The engine's
      // tickFade slot owns the 0→1 / 1→0 opacity ease; the tracker is now
      // a passive holder of the current set (plus the previous, for the
      // diff). Each surface that reads ticks (canvas grid, DOM axis
      // labels) sources opacity from `state.tickOpacity` via the same
      // snapshot helper so they animate in lockstep frame-for-frame.
      // Tick trackers diff internally against the next tick set and start the
      // appropriate fade animators; `renderMain` advances them once per frame
      // via the `.tick(now)` calls below so they tween in lockstep with the rest
      // of the chart's animation.
      this.yScale.tickTracker.setCurrentTicks(this.yScale.niceTickValues());
      this.timeScale.tickTracker.setCurrentTicks(this.timeScale.niceTickValues(this.#dataInterval).ticks);
      this.yScale.tickTracker.tick(now);
      this.timeScale.tickTracker.tick(now);
      const yTickSnap = this.yScale.tickTracker.snapshot();
      const timeTickSnap = this.timeScale.tickTracker.snapshot();
      yTickAnimating = yTickSnap.isAnimating;
      timeTickAnimating = timeTickSnap.isAnimating;
      // DOM axis components (TimeAxis, YAxis) re-render off `tickFrame`.
      // Emit on every animating frame — both tick-tracker fades and the
      // engine's X / Y slides count. Without the engine clause, an X-only
      // streaming slide between tick boundaries would emit nothing and
      // labels would hold the slide-start `timeToX(time)` value while the
      // canvas glides past them, then snap forward on the next event.
      if (yTickSnap.isAnimating || timeTickSnap.isAnimating || animationState.animating) {
        this.emit('tickFrame');
      }

      if (this.#grid) {
        renderGrid({
          scope,
          timeScale: this.timeScale,
          yScale: this.yScale,
          theme: this.#theme,
          yTicks: yTickSnap,
          timeTicks: timeTickSnap,
        });
      }

      // Time-region bands sit between the grid and the series so the data reads
      // on top of the shading.
      this.#drawRegions(scope, chartBitmapWidth, chartBitmapHeight);

      const vpad = this.#padding;
      const padding = { top: vpad.top, bottom: vpad.bottom };
      const perfMon = this.#perfMonitor;
      for (const entry of this.#series) {
        // Renderer-owned per-series alpha drives the show/hide fade. A
        // hidden series with alpha at 0 is fully gone — skip. A hidden
        // series mid-fade still renders at its fading alpha; the
        // `entry.visible` flag exists only to gate Y-range inclusion, not
        // rendering. Renderers without `getAlpha` (pie) fall back to the
        // binary visible flag.
        const alpha = entry.renderer.getAlpha?.() ?? (entry.visible ? 1 : 0);
        if (alpha <= 0) continue;

        const renderArgs = {
          scope,
          timeScale: this.timeScale,
          yScale: this.yScale,
          theme: this.#theme,
          dataInterval: this.#dataInterval,
          padding,
          state: animationState,
          seriesId: entry.id,
        };

        const prevAlpha = context.globalAlpha;
        if (alpha < 1) context.globalAlpha = prevAlpha * alpha;

        if (perfMon) {
          const s0 = performance.now();
          entry.renderer.render(renderArgs);
          // Stamp per-series samples with the current frame timestamp so the
          // monitor's time-window trim picks them up in step with the main
          // frame sample recorded at the bottom of this callback.
          perfMon.recordSeries(entry.id, performance.now() - s0, now);
        } else {
          entry.renderer.render(renderArgs);
        }

        if (alpha < 1) context.globalAlpha = prevAlpha;
      }

      context.restore();
    });

    // Generic animation poll — any renderer that still needs a frame keeps us going.
    let seriesNeedsAnim = false;
    for (const entry of this.#series) {
      if (entry.renderer.needsAnimation) {
        seriesNeedsAnim = true;
        this.#mainScheduler.markDirty();
        break;
      }
    }

    // Arm the tick fade trackers only once the entire chart has reached a
    // settled state — viewport animation done, no series entrance animation,
    // and no tracker fades in flight. Until then, tick churn from the initial
    // mount (fitToData, `setVisibleRange` deep-link, streaming pre-roll) all
    // snaps so the user doesn't see a long opening fade.
    // Arm the tick fade trackers the first time the entire chart reaches a
    // settled state — viewport animation done, no series entrance, no
    // tracker fades in flight. Initial mount snaps every transient tick
    // set; from the first quiescent frame on, set changes fade in/out.
    // We never disarm: `niceTickValues` typically returns the same set
    // across consecutive frames once the tick interval is resolved, so
    // streaming + zoom don't churn the tracker — only real set changes do.
    const trackersStillFading = yTickAnimating || timeTickAnimating;
    // Engine `animating` covers both X (engine X slot) and Y (transition);
    // viewport no longer has its own X animator since Phase 2 step 2.
    if (!animationState.animating && !seriesNeedsAnim && !trackersStillFading) {
      this.yScale.tickTracker.markArmed();
      this.timeScale.tickTracker.markArmed();
    }
  }

  /**
   * Paint a full frame: the main layer, then the overlay synchronously on
   * top so both land in the same browser paint. The overlay scheduler's
   * queued frame (a crosshair move, the pulse re-arm from the previous
   * frame) is consumed first — the synchronous paint below replaces it, so
   * the overlay is no longer cleared + repainted twice in the same frame.
   * `markDirty` calls made *during* `renderOverlay` (pulse, edge spinner)
   * land after the consume and re-arm cleanly for the next frame.
   */
  #renderFrame(timestamp?: number): void {
    this.#measuredRender('main', timestamp, () => this.renderMain(timestamp));

    this.#overlayScheduler.consume();
    this.#measuredRender('overlay', timestamp, () => this.renderOverlay(timestamp));
  }

  /** Run a layer's paint, booking duration + draw calls to the perf monitor
   *  when one is attached — keeps overlay time out of the `main` samples. */
  #measuredRender(layer: 'main' | 'overlay', timestamp: number | undefined, render: () => void): void {
    const monitor = this.#perfMonitor;
    if (!monitor) {
      render();

      return;
    }

    monitor.resetDrawCalls(layer);
    const t0 = performance.now();
    render();
    monitor.recordFrame(layer, performance.now() - t0, timestamp ?? t0);
  }

  /** Cheap overlay: crosshair, nearest-point dots, pulse animation, edge indicator. */
  private renderOverlay(_timestamp?: number): void {
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

    // A pulsing marker keeps the overlay ticking just like a line pulse.
    if (this.#markers.some((m) => m.pulse)) overlayAnimates = true;

    // The loading-state edge indicator animates a spinner; keep the overlay ticking.
    const edgeAnimates = this.#edgeStates.left === 'loading' || this.#edgeStates.right === 'loading';
    // Any non-idle edge needs a single redraw; only `loading` needs continuous frames.
    const edgeVisible = this.#edgeStates.left !== 'idle' || this.#edgeStates.right !== 'idle';

    // Skip the full-bitmap clear when the overlay is empty AND was already
    // empty last pass — only the painted→empty transition (e.g. mouseleave
    // erasing a stale crosshair) needs one erasing clear.
    const hasContent =
      Boolean(this.#crosshairPos) ||
      overlayAnimates ||
      edgeVisible ||
      this.#markers.length > 0 ||
      this.#lines.length > 0;
    if (!hasContent && !this.#overlayHasContent) return;

    this.#overlayHasContent = hasContent;

    this.#canvasManager.useOverlayLayer((scope) => {
      // useOverlayLayer already cleared the bitmap — an empty overlay stops
      // here with the stale content erased.
      if (!hasContent) return;

      const chartBitmapWidth = (size.media.width - this.yAxisWidth) * size.horizontalPixelRatio;
      const chartBitmapHeight = (size.media.height - this.xAxisHeight) * size.verticalPixelRatio;

      scope.context.save();
      scope.context.beginPath();
      scope.context.rect(0, 0, chartBitmapWidth, chartBitmapHeight);
      scope.context.clip();

      // Base crosshair lines on top of the clipped area. Skip when the only
      // visible series is pie — crosshair hairlines read as time/price
      // coordinates, which have no meaning on a pie and would just obscure
      // the disk.
      if (this.#crosshairPos && this.#hasTimeSeries()) {
        const bx = this.#crosshairPos.mediaX * size.horizontalPixelRatio;
        const by = this.#crosshairPos.mediaY * size.verticalPixelRatio;
        renderCrosshair(scope, bx, by, this.#theme);
      }

      // Dispatch to each renderer's overlay hook — crosshair dots, pulses, etc.
      const ovpad = this.#padding;
      const overlayPadding = { top: ovpad.top, bottom: ovpad.bottom };
      const overlayState = this.#engine.getAnimationState();
      for (const entry of this.#series) {
        if (!entry.visible) continue;
        entry.renderer.drawOverlay?.({
          scope,
          timeScale: this.timeScale,
          yScale: this.yScale,
          theme: this.#theme,
          dataInterval: this.#dataInterval,
          padding: overlayPadding,
          crosshair: this.#crosshairPos,
          state: overlayState,
          seriesId: entry.id,
        });
      }

      // Reference lines (thresholds / event boundaries): above series overlays,
      // below point markers so an event dot reads on top of its own line.
      this.#drawLines(scope, chartBitmapWidth, chartBitmapHeight);

      // Point annotations (event markers): above series overlays, below edge indicators.
      this.#drawMarkers(scope, chartBitmapWidth, chartBitmapHeight);

      // Edge indicators last — they paint over any series overlay that happened
      // to land in the overshoot area.
      if (edgeVisible) {
        drawEdgeIndicators({
          scope,
          chartMediaWidth: size.media.width - this.yAxisWidth,
          chartMediaHeight: size.media.height - this.xAxisHeight,
          timeScale: this.timeScale,
          theme: this.#theme,
          edgeStates: this.#edgeStates,
          edgeIndicatorFns: this.#edgeIndicatorFns,
          resolveBoundary: (side) => resolveEdgeBoundary(side, this.#edgeBoundaries[side], this.getDataBounds()),
          resolveEdgeAnchor: (side, boundaryTime) => this.#resolveEdgeAnchor(side, boundaryTime),
          resolveEdgeBarSpacing: () => this.#resolveEdgeBarSpacing(),
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

      // A pulsing marker within the visible window keeps the tick alive too.
      if (!visibleLast) {
        for (const marker of this.#markers) {
          if (marker.pulse && marker.time >= from && marker.time <= to) {
            visibleLast = true;
            break;
          }
        }
      }

      if (visibleLast) this.#overlayScheduler.markDirty();
    }

    // Spinner needs a frame cadence of its own, independent of series overlays.
    if (edgeAnimates) this.#overlayScheduler.markDirty();
  }
}

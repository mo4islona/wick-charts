import type { BitmapCoordinateSpace } from '../canvas-manager';
import type { TimeScale } from '../scales/time-scale';
import type { YScale } from '../scales/y-scale';
import type { ChartTheme } from '../theme/types';
import type { OHLCData, TimePoint } from '../types';

export interface SeriesRenderContext {
  scope: BitmapCoordinateSpace;
  timeScale: TimeScale;
  yScale: YScale;
  theme: ChartTheme;
  dataInterval: number;
}

/** Overlay render state passed to {@link SeriesRenderer.drawOverlay}. */
export interface OverlayRenderContext {
  scope: BitmapCoordinateSpace;
  timeScale: TimeScale;
  yScale: YScale;
  theme: ChartTheme;
  dataInterval: number;
  /** Current crosshair position, or null when none. */
  crosshair: { mediaX: number; mediaY: number; time: number; y: number } | null;
}

/** Shape returned by {@link SeriesRenderer.getHoverInfo} / per-slice entries of {@link SeriesRenderer.getSliceInfo}. */
export interface HoverInfo {
  label: string;
  value: number;
  percent: number;
  color: string;
}

export type SliceInfo = HoverInfo;

/**
 * Every series renderer implements this interface. Chart dispatches uniformly —
 * any type-specific behavior is opted into via the optional members below.
 *
 * Single-layer renderers (Candlestick, Pie) default most layer methods to no-ops.
 * Multi-layer renderers (Line, Bar) override them against each internal store.
 */
export interface SeriesRenderer {
  /** Paint the series on the main layer. */
  render(ctx: SeriesRenderContext): void;

  /** Optional: return the effective min/max for auto-range (e.g. stacked totals). */
  getValueRange?(from: number, to: number): { min: number; max: number } | null;

  // --- Data ingest ---------------------------------------------------------

  /**
   * Replace the series' data. For multi-layer renderers (Line, Bar), `layerIndex`
   * selects which internal store to target; defaults to 0.
   */
  setData(data: unknown, layerIndex?: number): void;

  /** Append a single point (real-time tick). Optional — not all renderers support streaming. */
  appendPoint?(point: unknown, layerIndex?: number): void;

  /** Replace the last point in place (live candle update). Optional. */
  updateLastPoint?(point: unknown, layerIndex?: number): void;

  // --- Layer model ---------------------------------------------------------

  /** Number of visual layers the renderer owns. Default: 1. */
  getLayerCount(): number;
  /** Show/hide a layer. No-op for single-layer renderers. */
  setLayerVisible(index: number, visible: boolean): void;
  /** Current visibility of a layer. */
  isLayerVisible(index: number): boolean;
  /** Per-layer colors. Single-layer renderers return `[primary]`. */
  getLayerColors(): string[];

  // --- Theme ---------------------------------------------------------------

  /** Apply a new theme. Each renderer decides what that means for itself. */
  applyTheme(theme: ChartTheme, prevTheme: ChartTheme): void;

  /**
   * Shallow-merge new visual options into the renderer's configuration.
   * Each renderer narrows the parameter in its concrete signature.
   */
  // biome-ignore lint/suspicious/noExplicitAny: each renderer narrows this in its concrete signature
  updateOptions(options: any): void;

  // --- Spatial hover (pie / future scatter / heatmap) ----------------------

  /** Hit-test a bitmap-space coordinate; return the hovered index or -1. Optional. */
  hitTest?(bx: number, by: number, bitmapWidth: number, bitmapHeight: number): number;
  /** Set the currently hovered index. Returns true if the value changed. Optional. */
  setHoverIndex?(index: number): boolean;
  /** Get info about the currently hovered element, or null. Optional. */
  getHoverInfo?(theme: ChartTheme): HoverInfo | null;

  // --- Generic data queries (tooltips/legends) -----------------------------

  /** Pie-style breakdown of all elements. Optional. */
  getSliceInfo?(theme: ChartTheme): SliceInfo[] | null;
  /** Last data value for the series, or null if empty. Optional. */
  getLastValue?(): number | null;
  /** Nearest data point to a given time, or null. Optional. */
  getDataAtTime?(time: number, interval: number): TimePoint | OHLCData | null;

  /**
   * For multi-layer renderers: nearest data point per visible layer at `time`,
   * tagged with its display color. Used by Chart for tooltips/legends.
   * Returns null for single-layer renderers (or when no visible layer has data).
   */
  getLayerSnapshots?(time: number, interval: number): { value: number; color: string }[] | null;

  /** Total data points across all owned stores. Used by Chart for batch-load detection. */
  getTotalLength?(): number;

  // --- Animation & overlays ------------------------------------------------

  /** True while the renderer has an active animation (Chart polls per frame). */
  readonly needsAnimation?: boolean;
  /**
   * Optional overlay hook. Chart invokes this during the overlay pass so each
   * renderer can paint type-specific overlays (crosshair dots, pulse dots).
   */
  drawOverlay?(ctx: OverlayRenderContext): void;
  /** True when the renderer wants the overlay layer to keep ticking (pulse animations, etc.). */
  readonly overlayNeedsAnimation?: boolean;
  /**
   * True if the renderer has overlay content (e.g. pulse dots) whose positions fall within
   * [from, to]. Chart uses this to stop scheduling overlay frames when animated content is
   * fully off-screen. Default when omitted: assume visible (safe, may waste CPU).
   */
  hasOverlayContentInRange?(from: number, to: number): boolean;

  // --- Lifecycle -----------------------------------------------------------

  /**
   * Subscribe to data-changed notifications (any internal store update).
   * Returns an unsubscribe function.
   */
  onDataChanged?(listener: () => void): () => void;
  /** Tear down listeners and any owned resources. */
  dispose(): void;
}

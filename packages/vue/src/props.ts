// Component props live here rather than in each SFC: the `*.vue` shim hides
// an SFC's named exports from `tsc`, so `index.ts` could not re-export them.

import type {
  AnimationsConfig,
  AxisConfig,
  BandData,
  BandSeriesOptions,
  BarSeriesOptions,
  CandlestickData,
  CandlestickSeriesOptions,
  ChartInstance,
  ChartOptions,
  ChartTheme,
  CrosshairPosition,
  DepthLevel,
  DepthSeriesOptions,
  EdgeReachedInfo,
  GridOptions,
  HeatmapCellInput,
  HeatmapSeriesOptions,
  LineSeriesOptions,
  MultiLayerData,
  PieSeriesOptions,
  PieSliceInput,
  PointClickInfo,
  SankeyLink,
  SankeyNode,
  SankeySeriesOptions,
  SeriesHoverInfo,
  VisibleRange,
  VisibleRangeSpec,
  YAxisConfig,
} from '@wick-charts/core';

type PerfOption = NonNullable<ChartOptions['perf']>;

export interface BandSeriesProps {
  /**
   * Band data — one band per layer. A single band passes a flat
   * `{ time, low, high }[]`; several bands pass `BandPoint[][]`. To name/color
   * a band, pass `{ label, color?, data }` (or an array of them). Time accepts
   * ms or `Date`. On a numeric or category X axis (`axis.x.type`) samples
   * carry `x` in place of `time`: `{ x: 'EU', low, high }`.
   */
  data: BandData;
  /** Visual options override — fill, edge stroke, curve, entrance / intro / smoothing. */
  options?: Partial<BandSeriesOptions>;
  /** Stable series ID — same value across remounts. */
  id?: string;
  /** Show/hide the series without unmounting it — excludes it from the Y-range fit and tooltip/legend. Default `true`. Live. */
  visible?: boolean;
  /** Named Y scale from the container's `scales` — autoscales on its own, sharing the time axis. Default: the default scale. Live. */
  scale?: string;
}

export interface BarSeriesProps {
  /**
   * Flat `TimePoint[]`, `TimePoint[][]`, or named `{ label, color?, data }` layers. Time accepts ms or `Date`.
   * On a numeric or category X axis (`axis.x.type`) points carry `x` in place of `time`.
   */
  data: MultiLayerData;
  options?: Partial<BarSeriesOptions>;
  /** Stable series ID — same value across remounts. */
  id?: string;
  /** Show/hide the series without unmounting it — excludes it from the Y-range fit and tooltip/legend. Default `true`. Live. */
  visible?: boolean;
  /** Named Y scale from the container's `scales` — autoscales on its own, sharing the time axis. Default: the default scale. Live. */
  scale?: string;
}

export interface CandlestickSeriesProps {
  /** Flat `OHLCInput[]`, or `{ label, data }` to name the stream. */
  data: CandlestickData;
  options?: Partial<CandlestickSeriesOptions>;
  /** Stable series ID — same value across remounts. */
  id?: string;
  /** Show/hide the series without unmounting it — excludes it from the Y-range fit and tooltip/legend. Default `true`. Live. */
  visible?: boolean;
  /** Named Y scale from the container's `scales` — autoscales on its own, sharing the time axis. Default: the default scale. Live. */
  scale?: string;
}

export interface ChartContainerProps {
  /** Visual theme. Live — changing this at runtime updates all themed elements. */
  theme?: ChartTheme;
  /** Grouped axis configuration (Y/X visibility, bounds, sizing). Live. */
  axis?: AxisConfig;
  /**
   * Named secondary Y scales, keyed by id — a series opts in with its `scale`
   * prop and autoscales on its own, sharing the time axis. Same fields as
   * `axis.y`; `position` defaults to the side opposite the default axis. One
   * axis column fits on each side — render it with `<YAxis scale="id" />`.
   * Live.
   */
  scales?: Record<string, YAxisConfig>;
  /**
   * Viewport padding. `top`/`bottom` are in pixels. `left`/`right` accept either pixels (`50`)
   * or data intervals (`{ intervals: 3 }`). Set to 0 for edge-to-edge sparklines. Updates are
   * applied reactively when this prop or the measured header height changes.
   * Defaults: `{ top: 20, bottom: 20, right: { intervals: 3 }, left: { intervals: 0.5 } }`.
   */
  padding?: {
    top?: number;
    bottom?: number;
    right?: number | { intervals: number };
    left?: number | { intervals: number };
  };
  /**
   * Viewport-level streaming behavior. Captured at mount only — changing
   * this prop after the chart is created is ignored.
   */
  viewport?: {
    /**
     * Most bars the chart's own fit shows. The first data load fits every bar
     * up to this count; while the data holds fewer, streamed bars widen the
     * window, and once it is full the window keeps its width and follows the
     * latest bar. `fitContent()` and an explicit bar count are not capped.
     * Default: 200. Values below 2 are clamped.
     */
    maxVisibleBars?: number;
    /**
     * Initial visible range applied before the first paint with data. Same
     * shape as the imperative `chart.setVisibleRange` — pass a bar count
     * (e.g. `35`), an explicit `{from, to}` window, or `{from, bars}` for
     * a warm-up pair.
     *
     * It stays the chart's window until the user zooms or pans or the app
     * sets a range, so a series that loads later or data set again keeps it.
     * A bar count widens with streamed bars until it holds that many; a
     * `{from, …}` window ends once streaming moves it. Captured at mount.
     */
    initialRange?: VisibleRangeSpec;
  };
  /**
   * Controlled visible range. Same shape as the imperative
   * `chart.setVisibleRange` — a bar count, an explicit `{from, to}` window,
   * or `{from, bars}`. Every reference/value change applies via
   * `chart.setVisibleRange`, so pair it with `onVisibleRangeChange` for a
   * two-way binding; a same-value literal (compared structurally) is a
   * no-op, so an inline object doesn't re-apply on every render.
   *
   * For an initial window that isn't re-applied on every prop
   * change, use `viewport.initialRange` instead.
   */
  visibleRange?: VisibleRangeSpec;
  /** Show the chart background gradient. Live. Defaults to false. */
  gradient?: boolean;
  /**
   * Enable zoom, pan, and crosshair interactions. Defaults to true.
   *
   * Mount-only — core has no `setInteractive`, so changing this prop after
   * mount is ignored.
   */
  interactive?: boolean;
  /**
   * Background grid configuration. Live. Default: `{ visible: true }`.
   * `{ vertical: false }` keeps only the horizontal lines.
   */
  grid?: GridOptions;
  /**
   * Soft fade-out at the top of the plot area, so series content dissolves
   * under a floating `<Title>` / `<InfoBar>` instead of colliding with it.
   * The mask erases canvas alpha rather than painting a cover color, so it
   * stays correct over a background gradient. Live.
   *
   * Two directions, independently controlled:
   *
   * **X (under the axis)** — panning content slides under the Y-axis
   * column and dissolves instead of hard-clipping at the pane edge. **On
   * by default** as a 60px ramp that finishes just inside the axis
   * column, before the label glyphs — on whichever side
   * `axis.y.position` puts it (a left-axis ramp ends at the pane edge
   * instead). The axis side's key (`{ right }` by default, `{ left }` for
   * a left axis) overrides the total ramp width in CSS px (`0` disables);
   * the other key adds a plain zone at the opposite pane edge (default
   * off). A chart with only pie / heatmap series has no axis column, so
   * both keys add plain zones there.
   *
   * **Top (under the header)** — opt-in. `true` enables the auto zone
   * (measured header + 24px run-out, half the header fold-in released so
   * data rides up into the zone at rest), `{ top }` sets the zone height
   * explicitly, and `{ overlap }` tunes how many px of the fold-in to
   * release (0 keeps the strict fold-in). Off unless one of those is set.
   *
   * `false` — every mask off, strict edges everywhere.
   */
  fade?: boolean | { top?: number; overlap?: number; right?: number; left?: number };
  /**
   * How `<Title>` and `<InfoBar>` are positioned relative to the canvas. Live.
   * - `'overlay'` (default): absolute overlays on top of the canvas.
   * - `'inline'`: flex siblings above the canvas — the canvas (and grid) shift down.
   */
  headerLayout?: 'overlay' | 'inline';
  /**
   * Animation control. `true` / omitted uses built-in defaults; `false`
   * disables every category. Per-series options on `<LineSeries>` /
   * `<CandlestickSeries>` / `<BarSeries>` override these chart-level
   * defaults unless the category here is explicitly `false`.
   *
   * **Init-only, but diffed by value, not reference.** A same-value
   * inline object literal is a no-op — only a genuine change to the
   * resolved config recreates the underlying `ChartInstance`, since the
   * animation engine doesn't support live reconfiguration yet.
   */
  animations?: boolean | AnimationsConfig;
  /**
   * Enable runtime performance instrumentation. Off by default. Read at mount only;
   * later changes are ignored.
   */
  perf?: PerfOption;
  /**
   * Fired after the user releases a pan/zoom gesture that pulled the viewport
   * past a data edge by more than ~10% of the visible range. Hosts typically
   * respond by prefetching more history. Captured at mount only; changing
   * the prop identity later is ignored.
   */
  onEdgeReached?: (info: EdgeReachedInfo) => void;
  /**
   * Fired on a click (or tap) on the chart canvas that isn't the tail end
   * of a pan drag. `info.spatialHit` resolves a pie/heatmap/custom-spatial
   * series directly under the pointer; for a time-series series, resolve
   * the point yourself from `info.time` (`chart.getDataAtTime` /
   * `buildHoverSnapshots`). Live — the latest callback is always used.
   */
  onPointClick?: (info: PointClickInfo) => void;
  /**
   * Fired on a double-click on the chart canvas. The chart also responds
   * by calling `fitContent()`. Live — the latest callback is always used.
   */
  onPointDoubleClick?: (info: PointClickInfo) => void;
  /**
   * Fired when the spatially-hovered series/index changes (pie, heatmap,
   * or a custom spatial kind) — `null` when the pointer leaves every hit
   * area. Live — the latest callback is always used.
   */
  onSeriesHover?: (hit: SeriesHoverInfo | null) => void;
  /**
   * Fired once the underlying `ChartInstance` is constructed — on mount,
   * and again if the chart is ever rebuilt (a genuine `animations` value
   * change). Live — the latest callback is always used for the next rebuild.
   */
  onReady?: (chart: ChartInstance) => void;
  /**
   * Fired whenever the committed visible range changes — pan, zoom,
   * `fitContent()`, a data update that shifts the tail-scroll window, or a
   * `visibleRange` prop change. Live — the latest callback is always used.
   */
  onVisibleRangeChange?: (range: VisibleRange) => void;
  /**
   * Fired on every crosshair move, with `null` when the pointer leaves the
   * chart. Live — the latest callback is always used.
   */
  onCrosshairMove?: (position: CrosshairPosition | null) => void;
}

export interface DepthSeriesProps {
  /** Bid levels as `[price, size]`, in any order. Cumulative depth is computed from them. */
  bids: readonly DepthLevel[];
  /** Ask levels as `[price, size]`, in any order. Cumulative depth is computed from them. */
  asks: readonly DepthLevel[];
  /** Visual options override — `span` of the default view, side colors, stroke width, intro / update durations. */
  options?: Partial<DepthSeriesOptions>;
  /** Stable series ID — same value across remounts. */
  id?: string;
  /** Show/hide the series without unmounting it — excludes it from the Y-range fit and tooltip/legend. Default `true`. Live. */
  visible?: boolean;
}

export interface HeatmapSeriesProps {
  data: HeatmapCellInput[];
  options?: Partial<HeatmapSeriesOptions>;
  /** Stable series ID — same value across remounts. */
  id?: string;
  /** Show/hide the series without unmounting it — excludes it from the Y-range fit and tooltip/legend. Default `true`. Live. */
  visible?: boolean;
}

export interface LineSeriesProps {
  /**
   * Flat `TimePoint[]`, `TimePoint[][]`, or named `{ label, color?, data }` layers. Time accepts ms or `Date`.
   * On a numeric or category X axis (`axis.x.type`) points carry `x` in place of `time`.
   */
  data: MultiLayerData;
  options?: Partial<LineSeriesOptions>;
  /** Stable series ID — same value across remounts. */
  id?: string;
  /** Show/hide the series without unmounting it — excludes it from the Y-range fit and tooltip/legend. Default `true`. Live. */
  visible?: boolean;
  /** Named Y scale from the container's `scales` — autoscales on its own, sharing the time axis. Default: the default scale. Live. */
  scale?: string;
}

export interface PieSeriesProps {
  data: PieSliceInput[];
  options?: Partial<PieSeriesOptions>;
  /** Stable series ID — same value across remounts. */
  id?: string;
  /** Show/hide the series without unmounting it — excludes it from the Y-range fit and tooltip/legend. Default `true`. Live. */
  visible?: boolean;
}

export interface SankeySeriesProps {
  /** Stages of the flow. A node no link reaches is not drawn. */
  nodes: readonly SankeyNode[];
  /** Flows between nodes by `id`. Links must not form a cycle — the series throws on one. */
  links: readonly SankeyLink[];
  /** Visual options override — node colors, node width and gap, link opacity, labels, entry / update durations. */
  options?: Partial<SankeySeriesOptions>;
  /** Stable series ID — same value across remounts. */
  id?: string;
  /** Show/hide the series without unmounting it — excludes it from the tooltip. Default `true`. Live. */
  visible?: boolean;
}

// Chart

export type { AnimationsConfig } from './animation/config';
// Built-in transitions. Each factory lives in its own module so unused
// curves tree-shake out — import only the ones you need. `spring` is the
// universal critically-damped spring; pass `<YRange>` to plug it into the
// Y axis or `<VisibleRange>` for X.
export { spring } from './animation/spring';
export type { AnimationTime, Milliseconds } from './animation/time';
export { parseAnimationTime } from './animation/time';
// Y-bound transition contract.
export type { RetargetOptions, Transition, TransitionContext, TransitionFactory } from './animation/transition';
// Push-model viewport state machine — owns X / Y range animation and exposes
// `getAnimationState` / `getTarget` to renderers and scales.
export {
  type AnimationState,
  type PanZoomOptions,
  type ProgrammaticZoomOptions,
  type SnapTarget,
  type ViewportEngine,
  type ViewportEngineOptions,
  createViewportEngine,
} from './animation/viewport-engine';
export { hermite } from './animation/y-range-hermite';
export { snap } from './animation/y-range-snap';
// Axis helpers
export type { MountAxisLabelsOptions } from './axis/dom-labels';
export { mountAxisLabels } from './axis/dom-labels';
export type { ChartOptions, EdgeReachedInfo, EdgeSide, EdgeState } from './chart';
export { ChartInstance } from './chart';
// Markers — point annotations (event markers) pinned to time/value, drawn on the
// overlay layer. Kept out of the series model, so excluded from tooltips, the
// legend, and Y-range autoscale. Add via `chart.addMarker(config)`.
export type { MarkerConfig, MarkerShape } from './components/marker';
// Reference lines — horizontal thresholds / baselines (pinned to a value) or
// vertical event boundaries (pinned to a time), drawn on the overlay layer.
// Kept out of the series model. Add via `chart.addLine(config)`.
export type {
  ReferenceLineConfig,
  ReferenceLineOrientation,
  ReferenceLineStyle,
} from './components/reference-line';
// Time regions — translucent vertical bands shading a time interval (anomaly /
// maintenance windows), drawn on the main layer behind the series. Kept out of
// the series model. Add via `chart.addRegion(config)`.
export type { TimeRegionConfig, TimeRegionEnd } from './components/time-region';
// Series data reconciliation — shared by the React / Vue / Svelte wrappers so
// every framework picks the same cheapest-correct mutation (append / keepLast /
// update / replace) and streams without Y-snapping.
export type { SeriesSyncState, SyncLayersArgs, SyncSeriesLayerArgs } from './data/sync';
export { EMPTY_SYNC_STATE, syncLayers, syncSeriesLayer, toLayers } from './data/sync';
// Overlay primitives — helpers, types, and positioning used by framework overlays
export type { LegendItem } from './legend';
export type {
  NavigatorCandlePoint,
  NavigatorControllerParams,
  NavigatorData,
  NavigatorLinePoint,
  NavigatorOptions,
  NavigatorSeriesType,
} from './navigator';
// Navigator
export { NavigatorController } from './navigator';
// Performance instrumentation
export type { FrameKind, PercentileSample, PerfConfig, PerfMonitorOptions, PerfStats } from './perf';
export { PerfMonitor, perfHud } from './perf';
// Tick fade tracker (read-only types — instances live on chart.timeScale/yScale)
export type { TickEntry, TickTrackerSnapshot } from './scales/tick-tracker';
export { AxisTickTracker, computeTickFadeDiff } from './scales/tick-tracker';
// Series definitions — pass one to `chart.addSeries(def, options)` so the
// chart stays renderer-agnostic and unused series types tree-shake out. The
// string form (`addSeries('line', ...)`) requires a one-time
// `registerBuiltinSeries()` call at startup.
export { BarSeriesDef } from './series/bar';
export { CandlestickSeriesDef } from './series/candlestick';
export {
  type SeriesCreateEnv,
  type SeriesDefinition,
  registerSeriesDefinition,
} from './series/definition';
export { LineSeriesDef } from './series/line';
export {
  roundedBarFill,
  roundedCandleFill,
  smoothCurve,
  steppedCurve,
  straightCurve,
} from './series/painters/builtins';
export type { CurveKind, RoundedRectArgs, TracePathArgs } from './series/painters/canvas-path';
// Painters — optional custom per-element drawing for bar / candle / line series,
// the shipped built-ins (rounded corners, line smoothing), and reusable canvas
// primitives. A custom painter is a plain function passed to the series option;
// there is no name registry.
export { fillRoundedRect, tracePath } from './series/painters/canvas-path';
export type {
  BarGeometry,
  BarPaintArgs,
  BarPainter,
  CandleGeometry,
  CandlePaintArgs,
  CandlePainter,
  CornerMask,
  LinePaintArgs,
  LinePainter,
  LinePoint,
  PaintEnv,
} from './series/painters/types';
export { PieSeriesDef } from './series/pie';
export { registerBuiltinSeries } from './series/register-builtins';
export type { HoverInfo, SliceInfo } from './series/types';
export type {
  BuildHoverSnapshotsArgs,
  BuildLastSnapshotsArgs,
  SeriesSnapshot,
  SnapshotSort,
} from './snapshots';
export { buildHoverSnapshots, buildLastSnapshots } from './snapshots';
// Data
export type { ThemeConfig, ThemePreset } from './theme/palettes';
export { autoGradient, createTheme, isDarkBg } from './theme/palettes';
export { resolveAxisFontSize, resolveAxisTextColor, resolveCandlestickBodyColor } from './theme/resolve';
export {
  andromeda,
  ayuMirage,
  catppuccin,
  dracula,
  githubLight,
  gruvbox,
  handwritten,
  highContrast,
  lavenderMist,
  lightPink,
  materialPalenight,
  minimalLight,
  mintBreeze,
  monokaiPro,
  nightOwl,
  oneDarkPro,
  panda,
  peachCream,
  quietLight,
  rosePineDawn,
  sandDune,
  solarizedLight,
} from './theme/themes';
// Theme
export type { ChartTheme, Typography } from './theme/types';
export type { TooltipPosition, TooltipPositionArgs } from './tooltip-position';
export { computeTooltipPosition } from './tooltip-position';
// Types
export type {
  AxisBound,
  AxisConfig,
  BarSeriesOptions,
  CandlestickData,
  CandlestickSeriesOptions,
  ChartLayout,
  CrosshairPosition,
  HorizontalPadding,
  LineSeriesOptions,
  MultiLayerData,
  OHLCData,
  OHLCInput,
  PieLabelsOptions,
  PieOtherOptions,
  PieSeriesOptions,
  PieSliceData,
  SeriesLayer,
  SeriesType,
  StackingMode,
  TimePoint,
  TimePointInput,
  TimeValue,
  ValueColor,
  VisibleRange,
  VisibleRangeSpec,
  XAxisConfig,
  XRange,
  YAxisConfig,
  YRange,
} from './types';
// Utils
export type { TooltipField, TooltipFormatter, ValueFormatter } from './utils/format';
export { formatCompact, formatPriceAdaptive } from './utils/format';
export { detectInterval, formatDate, formatTime, normalizeTime } from './utils/time';

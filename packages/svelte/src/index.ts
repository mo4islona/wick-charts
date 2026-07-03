/**
 * @wick-charts/svelte — Svelte bindings for Wick Charts.
 *
 * Everything importable from the library is re-exported here: components
 * (`<ChartContainer>`, `<CandlestickSeries>`, …), option types, and themes.
 * The underlying `@wick-charts/core` engine is bundled into this package —
 * its source lives at
 * https://github.com/mo4islona/wick-charts/tree/main/packages/core/src.
 */

export type {
  AxisBound,
  AxisConfig,
  BarPaintArgs,
  BarPainter,
  BarSeriesOptions,
  /** @deprecated Use {@link StackingMode} instead. */
  BuildHoverSnapshotsArgs,
  BuildLastSnapshotsArgs,
  CandlePaintArgs,
  CandlePainter,
  CandlestickSeriesOptions,
  ChartLayout,
  ChartOptions,
  ChartTheme,
  CornerMask,
  CrosshairPosition,
  CurveKind,
  HeatmapCellData,
  HeatmapCellLabelsOptions,
  HeatmapSeriesOptions,
  HoverInfo,
  LegendItem,
  LinePaintArgs,
  LinePainter,
  /** @deprecated Use {@link TimePoint} instead. */
  LineSeriesOptions,
  MarkerConfig,
  MarkerShape,
  NavigatorCandlePoint,
  NavigatorControllerParams,
  NavigatorData,
  NavigatorLinePoint,
  NavigatorOptions,
  NavigatorSeriesType,
  OHLCData,
  OHLCInput,
  PaintEnv,
  PerfConfig,
  PerfMonitorOptions,
  PerfStats,
  PieSeriesOptions,
  PieSliceData,
  ReferenceLineConfig,
  ReferenceLineOrientation,
  ReferenceLineStyle,
  RoundedRectArgs,
  SeriesCreateEnv,
  SeriesDefinition,
  SeriesSnapshot,
  SeriesType,
  SliceInfo,
  SnapshotSort,
  StackingMode,
  ThemeConfig,
  ThemePreset,
  TimePoint,
  TimePointInput,
  TimeRegionConfig,
  TimeRegionEnd,
  TimeValue,
  TooltipField,
  TooltipFormatter,
  TooltipPosition,
  TooltipPositionArgs,
  TracePathArgs,
  Typography,
  ValueFormatter,
  VisibleRange,
  XAxisConfig,
  YAxisConfig,
  YRange,
} from '@wick-charts/core';
// Painters — custom per-element drawing for bar / candle / line series.
export {
  BarSeriesDef,
  CandlestickSeriesDef,
  ChartInstance,
  HeatmapSeriesDef,
  LineSeriesDef,
  NavigatorController,
  PerfMonitor,
  PieSeriesDef,
  andromeda,
  autoGradient,
  ayuMirage,
  buildHoverSnapshots,
  buildLastSnapshots,
  catppuccin,
  computeTooltipPosition,
  createTheme,
  detectInterval,
  dracula,
  fillRoundedRect,
  formatCompact,
  formatDate,
  formatPriceAdaptive,
  formatTime,
  githubLight,
  gruvbox,
  handwritten,
  highContrast,
  lavenderMist,
  lightPink,
  materialPalenight,
  minimalLight,
  mintBreeze,
  mixColors,
  monokaiPro,
  nightOwl,
  normalizeTime,
  oneDarkPro,
  panda,
  peachCream,
  perfHud,
  quietLight,
  registerBuiltinSeries,
  registerSeriesDefinition,
  resolveAxisFontSize,
  resolveAxisTextColor,
  resolveCandlestickBodyColor,
  rosePineDawn,
  roundedBarFill,
  roundedCandleFill,
  sampleRamp,
  sandDune,
  smoothCurve,
  solarizedLight,
  steppedCurve,
  straightCurve,
  tracePath,
} from '@wick-charts/core';

export { default as BarSeries } from './BarSeries.svelte';
export { default as CandlestickSeries } from './CandlestickSeries.svelte';
// Svelte components
export { default as ChartContainer } from './ChartContainer.svelte';
// Context and stores
export { getChartContext, getThemeContext } from './context';
export { default as HeatmapSeries } from './HeatmapSeries.svelte';
export { default as LineSeries } from './LineSeries.svelte';
export { default as PieSeries } from './PieSeries.svelte';
export {
  createCrosshairPosition,
  createLastYValue,
  createPreviousClose,
  createVisibleRange,
  createYRange,
} from './stores';
export { default as Crosshair } from './ui/Crosshair.svelte';
export { default as HeatmapTooltip } from './ui/HeatmapTooltip.svelte';
export { default as InfoBar } from './ui/InfoBar.svelte';
export { default as Legend } from './ui/Legend.svelte';
export { default as Marker } from './ui/Marker.svelte';
export { default as Navigator } from './ui/Navigator.svelte';
export { default as NumberFlow } from './ui/NumberFlow.svelte';
export { default as PieLegend } from './ui/PieLegend.svelte';
export { default as PieTooltip } from './ui/PieTooltip.svelte';
export { default as ReferenceLine } from './ui/ReferenceLine.svelte';
export { default as TimeAxis } from './ui/TimeAxis.svelte';
export { default as TimeRegion } from './ui/TimeRegion.svelte';
export { default as Title } from './ui/Title.svelte';
// UI overlays
export { default as Tooltip } from './ui/Tooltip.svelte';
export { default as YAxis } from './ui/YAxis.svelte';
export { default as YLabel } from './ui/YLabel.svelte';

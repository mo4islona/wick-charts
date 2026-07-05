/**
 * @wick-charts/react — React bindings for Wick Charts.
 *
 * Everything importable from the library is re-exported here: components
 * (`<ChartContainer>`, `<CandlestickSeries>`, …), option types, utility
 * hooks, and themes. The underlying `@wick-charts/core` engine is bundled
 * into this package — its source lives at
 * https://github.com/mo4islona/wick-charts/tree/main/packages/core/src.
 */

export type {
  AnimationTime,
  AnimationsConfig,
  AxisBound,
  AxisConfig,
  BarElementTransform,
  BarEntryAnimation,
  BarIntroDirectives,
  BarIntroElement,
  BarIntroFn,
  BarIntroFrame,
  BarIntroValueArgs,
  BarPaintArgs,
  BarPainter,
  BarSeriesOptions,
  BaseSeriesRenderer,
  BitmapCoordinateSpace,
  BuildHoverSnapshotsArgs,
  BuildLastSnapshotsArgs,
  CandleElementTransform,
  CandleIntroDirectives,
  CandleIntroElement,
  CandleIntroFn,
  CandleIntroFrame,
  CandlePaintArgs,
  CandlePainter,
  CandlestickEntryAnimation,
  CandlestickSeriesOptions,
  ChartLayout,
  ChartOptions,
  ChartTheme,
  CornerMask,
  CrosshairPosition,
  CurveKind,
  CustomSpatialSeriesRenderer,
  EdgeReachedInfo,
  EdgeSide,
  EdgeState,
  HeatmapCellData,
  HeatmapCellLabelsOptions,
  HeatmapSeriesOptions,
  HeatmapSeriesRenderer,
  HoverInfo,
  LegendItem,
  LineIntroDirectives,
  LineIntroFn,
  LineIntroFrame,
  LineIntroValueArgs,
  LinePaintArgs,
  LinePainter,
  LineSeriesOptions,
  LoadingIndicatorArgs,
  LoadingIndicatorFn,
  MarkerConfig,
  MarkerShape,
  MultiLayerData,
  NavigatorCandlePoint,
  NavigatorControllerParams,
  NavigatorData,
  NavigatorLinePoint,
  NavigatorOptions,
  NavigatorSeriesType,
  OHLCData,
  OHLCInput,
  OverlayRenderContext,
  PaintEnv,
  PerfConfig,
  PerfMonitorOptions,
  PerfStats,
  PieSeriesOptions,
  PieSeriesRenderer,
  PieSliceData,
  PointClickInfo,
  ReferenceLineConfig,
  ReferenceLineOrientation,
  ReferenceLineStyle,
  RenderPadding,
  RoundedRectArgs,
  SeriesCreateEnv,
  SeriesDefinition,
  SeriesHoverInfo,
  SeriesKind,
  SeriesRenderContext,
  SeriesRenderer,
  SeriesSnapshot,
  SeriesType,
  SliceInfo,
  SnapshotSort,
  StackingMode,
  ThemeConfig,
  ThemePreset,
  TimeFormatOptions,
  TimeFormatter,
  TimePoint,
  TimePointInput,
  TimeRegionConfig,
  TimeRegionEnd,
  TimeSeriesRenderer,
  TimeTickGenerator,
  TimeValue,
  TooltipField,
  TooltipFormatter,
  TooltipPosition,
  TooltipPositionArgs,
  TracePathArgs,
  Transition,
  TransitionContext,
  TransitionFactory,
  Typography,
  ValueFormatter,
  ValueTickGenerator,
  VisibleRange,
  VisibleRangeSpec,
  WaveIntroDirectives,
  WaveIntroElement,
  WaveIntroFn,
  WaveIntroFrame,
  WaveIntroTransform,
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
  XScale,
  YScale,
  andromeda,
  autoGradient,
  ayuMirage,
  buildHoverSnapshots,
  buildLastSnapshots,
  candleUnfoldIntro,
  catppuccin,
  computeTooltipPosition,
  createTheme,
  deepEqual,
  detectInterval,
  dracula,
  fadeIntro,
  fillRoundedRect,
  formatCompact,
  formatDate,
  formatPriceAdaptive,
  formatTime,
  githubLight,
  growIntro,
  gruvbox,
  handwritten,
  hermite,
  highContrast,
  isDarkBg,
  isTimeSeriesRenderer,
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
  parseAnimationTime,
  peachCream,
  perfHud,
  plotterIntro,
  quietLight,
  registerBuiltinSeries,
  registerSeriesDefinition,
  resolveAxisFontSize,
  resolveAxisTextColor,
  resolveCandlestickBodyColor,
  riseIntro,
  rosePineDawn,
  roundedBarFill,
  roundedCandleFill,
  sampleRamp,
  sandDune,
  skeletonLoadingIndicator,
  smoothCurve,
  snap,
  solarizedLight,
  spring,
  springIntro,
  steppedCurve,
  straightCurve,
  sweepIntro,
  traceIntro,
  tracePath,
  unfoldIntro,
  wickBodyIntro,
  wipeIntro,
} from '@wick-charts/core';

export { BarSeries } from './BarSeries';
export { CandlestickSeries } from './CandlestickSeries';
// React components
export { ChartContainer } from './ChartContainer';
// React hooks
export { useChartInstance } from './context';
export type { EdgeLoaderProps, EdgeLoaderRenderArgs } from './EdgeLoader';
export { EdgeLoader } from './EdgeLoader';
export type { HeatmapSeriesProps } from './HeatmapSeries';
export { HeatmapSeries } from './HeatmapSeries';
export { LineSeries } from './LineSeries';
export { PieSeries } from './PieSeries';
export {
  useCrosshairPosition,
  useLastYValue,
  usePreviousClose,
  useVisibleRange,
  useYRange,
} from './store-bridge';
export { ThemeProvider, useTheme, useThemeOptional } from './ThemeContext';
export { Crosshair } from './ui/Crosshair';
export type { HeatmapTooltipProps } from './ui/HeatmapTooltip';
export { HeatmapTooltip } from './ui/HeatmapTooltip';
export type { InfoBarProps, InfoBarRenderContext } from './ui/InfoBar';
export { InfoBar } from './ui/InfoBar';
export type { LegendItemOverride, LegendProps, LegendToggleInfo } from './ui/Legend';
// Legend
export { Legend } from './ui/Legend';
// Markers — point annotations (event markers)
export type { MarkerProps } from './ui/Marker';
export { Marker } from './ui/Marker';
export type { NavigatorProps } from './ui/Navigator';
export { Navigator } from './ui/Navigator';
export { NumberFlow } from './ui/NumberFlow';
export type { PieLegendMode, PieLegendPosition, PieLegendProps, PieLegendRenderContext } from './ui/PieLegend';
export { PieLegend } from './ui/PieLegend';
export { PieTooltip } from './ui/PieTooltip';
// Reference lines — horizontal threshold / vertical event boundary
export type { ReferenceLineProps } from './ui/ReferenceLine';
export { ReferenceLine } from './ui/ReferenceLine';
export type { SparklineProps, SparklineValuePosition, SparklineVariant } from './ui/Sparkline';
export { Sparkline } from './ui/Sparkline';
export { TimeAxis, TimeAxis as XAxis } from './ui/TimeAxis';
// Time regions — translucent shaded bands over a time interval
export type { TimeRegionProps } from './ui/TimeRegion';
export { TimeRegion } from './ui/TimeRegion';
export type { TitleProps } from './ui/Title';
export { Title } from './ui/Title';
export type { TooltipProps, TooltipRenderContext, TooltipSort } from './ui/Tooltip';
// UI overlays
export { Tooltip } from './ui/Tooltip';
export type { YAxisProps } from './ui/YAxis';
export { YAxis } from './ui/YAxis';
export { YLabel } from './ui/YLabel';

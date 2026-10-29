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
  BandData,
  BandEntryAnimation,
  BandPoint,
  BandPointInput,
  BandSampleInput,
  BandSeriesOptions,
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
  BarValueLabelsOptions,
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
  CollapseZerosOptions,
  CornerMask,
  CrosshairPosition,
  CrosshairXLabel,
  CurveKind,
  CustomSpatialSeriesRenderer,
  DepthBook,
  DepthBookDelta,
  DepthLevel,
  DepthSeriesOptions,
  EdgeReachedInfo,
  EdgeSide,
  EdgeState,
  GaugeSeriesOptions,
  GaugeSeriesRenderer,
  GaugeZone,
  HeatmapCellData,
  HeatmapCellInput,
  HeatmapCellLabelsOptions,
  HeatmapSeriesOptions,
  HeatmapSeriesRenderer,
  HeikinAshiStream,
  HoverInfo,
  LayerSnapshot,
  LegendItem,
  LineIntroDirectives,
  LineIntroFn,
  LineIntroFrame,
  LineIntroValueArgs,
  LinePaintArgs,
  LinePainter,
  LinePointInput,
  LineSeriesOptions,
  LoadingIndicatorArgs,
  LoadingIndicatorFn,
  LogScaleOptions,
  MarkerConfig,
  MarkerShape,
  MultiLayerData,
  NavigatorCandlePoint,
  NavigatorCandlePointInput,
  NavigatorControllerParams,
  NavigatorData,
  NavigatorDataInput,
  NavigatorLinePoint,
  NavigatorLinePointInput,
  NavigatorOptions,
  NavigatorSeriesType,
  OHLCData,
  OHLCInput,
  OverlayRenderContext,
  PaintEnv,
  PerfConfig,
  PerfHudColors,
  PerfHudOptions,
  PerfMonitorOptions,
  PerfStats,
  PieSeriesOptions,
  PieSeriesRenderer,
  PieSliceData,
  PieSliceInput,
  PointClickInfo,
  RadialItem,
  RadialLabelArgs,
  RadialLabelPainter,
  RadialLabelRing,
  RadialLayout,
  RadialLayoutFrame,
  RadialProgressSeriesOptions,
  RadialProgressSeriesRenderer,
  ReferenceLineConfig,
  ReferenceLineOrientation,
  ReferenceLineStyle,
  RenderPadding,
  RingPaintArgs,
  RingPainter,
  RingSlot,
  RoundedRectArgs,
  SankeyData,
  SankeyLabelsOptions,
  SankeyLink,
  SankeyNode,
  SankeySeriesOptions,
  SankeySeriesRenderer,
  ScaleTickArgs,
  SeriesCreateEnv,
  SeriesDefinition,
  SeriesHoverInfo,
  SeriesKind,
  SeriesRenderContext,
  SeriesRenderer,
  SeriesSnapshot,
  SeriesType,
  SignificantFormatOptions,
  SliceInfo,
  SnapshotSort,
  StackingMode,
  ThemeConfig,
  ThemePreset,
  TickAnimation,
  TickFrame,
  TickStyle,
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
  ValueStyle,
  ValueTickGenerator,
  VisibleRange,
  VisibleRangeSpec,
  WaveIntroDirectives,
  WaveIntroElement,
  WaveIntroFn,
  WaveIntroFrame,
  WaveIntroTransform,
  XAxisConfig,
  XAxisFormatter,
  XAxisPadding,
  XAxisType,
  XBandPointInput,
  XPointInput,
  XRange,
  YAxisConfig,
  YAxisPosition,
  YRange,
  YScaleTransform,
} from '@wick-charts/core';
// Painters — custom per-element drawing for bar / candle / line series.
export {
  BandSeriesDef,
  BarSeriesDef,
  CandlestickSeriesDef,
  ChartInstance,
  DepthSeriesDef,
  GaugeSeriesDef,
  HeatmapSeriesDef,
  LineSeriesDef,
  NavigatorController,
  PerfMonitor,
  PieSeriesDef,
  RadialProgressSeriesDef,
  SankeySeriesDef,
  XScale,
  YScale,
  andromeda,
  autoGradient,
  ayuMirage,
  backfillSweepIntro,
  buildHoverSnapshots,
  buildLastSnapshots,
  candleUnfoldIntro,
  catppuccin,
  centerOutIntro,
  collapseZeros,
  computeTooltipPosition,
  createTheme,
  deepEqual,
  detectInterval,
  dracula,
  fadeIntro,
  fillRoundedRect,
  flyTicks,
  formatCompact,
  formatDate,
  formatPriceAdaptive,
  formatSignificant,
  formatTime,
  formatTooltipNumber,
  formatTooltipValue,
  githubLight,
  growIntro,
  gruvbox,
  handwritten,
  headTags,
  heikinAshi,
  heikinAshiStream,
  hermite,
  heroCenter,
  heroLayout,
  highContrast,
  hollowCandle,
  isDarkBg,
  isTimeSeriesRenderer,
  lavenderMist,
  lightPink,
  listCenter,
  logScale,
  materialPalenight,
  minimalLight,
  mintBreeze,
  mixColors,
  monokaiPro,
  nightOwl,
  normalizeTime,
  ohlcBar,
  oneDarkPro,
  panda,
  parseAnimationTime,
  peachCream,
  perfHud,
  plotterIntro,
  popTicks,
  quietLight,
  radarTicks,
  registerBuiltinSeries,
  registerSeriesDefinition,
  resolveAxisFontSize,
  resolveAxisTextColor,
  resolveCandlestickBodyColor,
  ringsLayout,
  riseIntro,
  rosePineDawn,
  roundedBarFill,
  roundedCandleFill,
  sampleRamp,
  sandDune,
  skeletonLoadingIndicator,
  skeletonMorphIntro,
  smoothCurve,
  snap,
  solarizedLight,
  solidRing,
  spring,
  springIntro,
  startLabels,
  steppedCurve,
  straightCurve,
  sweepIntro,
  tickRing,
  traceIntro,
  tracePath,
  traceRoundedRect,
  unfoldIntro,
  wickBodyIntro,
  wipeIntro,
} from '@wick-charts/core';

export type { BandSeriesProps } from './BandSeries';
export { BandSeries } from './BandSeries';
export type { BarSeriesProps } from './BarSeries';
export { BarSeries } from './BarSeries';
export type { CandlestickSeriesProps } from './CandlestickSeries';
export { CandlestickSeries } from './CandlestickSeries';
export type { ChartContainerProps } from './ChartContainer';
// React components
export { ChartContainer } from './ChartContainer';
// React hooks
export { useChartInstance } from './context';
export type { DepthSeriesProps } from './DepthSeries';
export { DepthSeries } from './DepthSeries';
export type { EdgeLoaderProps, EdgeLoaderRenderArgs } from './EdgeLoader';
export { EdgeLoader } from './EdgeLoader';
export type { GaugeSeriesProps } from './GaugeSeries';
export { GaugeSeries } from './GaugeSeries';
export type { HeatmapSeriesProps } from './HeatmapSeries';
export { HeatmapSeries } from './HeatmapSeries';
export type { LineSeriesProps } from './LineSeries';
export { LineSeries } from './LineSeries';
export type { PieSeriesProps } from './PieSeries';
export { PieSeries } from './PieSeries';
export type { RadialProgressSeriesProps } from './RadialProgressSeries';
export { RadialProgressSeries } from './RadialProgressSeries';
export type { SankeySeriesProps } from './SankeySeries';
export { SankeySeries } from './SankeySeries';
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
export type { NumberFlowProps } from './ui/NumberFlow';
export { NumberFlow } from './ui/NumberFlow';
export type { PieLegendMode, PieLegendPosition, PieLegendProps, PieLegendRenderContext } from './ui/PieLegend';
export { PieLegend } from './ui/PieLegend';
export type { PieTooltipProps, PieTooltipRenderContext } from './ui/PieTooltip';
export { PieTooltip } from './ui/PieTooltip';
// Reference lines — horizontal threshold / vertical event boundary
export type { ReferenceLineProps } from './ui/ReferenceLine';
export { ReferenceLine } from './ui/ReferenceLine';
export type { SankeyTooltipProps, SankeyTooltipRenderContext } from './ui/SankeyTooltip';
export { SankeyTooltip } from './ui/SankeyTooltip';
export type { SparklineProps, SparklineValuePosition, SparklineVariant } from './ui/Sparkline';
export { Sparkline } from './ui/Sparkline';
// Time regions — translucent shaded bands over a time interval
export type { TimeRegionProps } from './ui/TimeRegion';
export { TimeRegion } from './ui/TimeRegion';
export type { TitleProps } from './ui/Title';
export { Title } from './ui/Title';
export type { TooltipProps, TooltipRenderContext, TooltipSort } from './ui/Tooltip';
// UI overlays
export { Tooltip } from './ui/Tooltip';
export type { XAxisProps } from './ui/XAxis';
export { TimeAxis, XAxis } from './ui/XAxis';
export type { YAxisProps } from './ui/YAxis';
export { YAxis } from './ui/YAxis';
export type { YLabelDirection, YLabelProps, YLabelRenderContext } from './ui/YLabel';
export { YLabel } from './ui/YLabel';

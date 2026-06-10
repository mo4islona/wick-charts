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
  EdgeReachedInfo,
  EdgeSide,
  EdgeState,
  HoverInfo,
  LegendItem,
  LinePaintArgs,
  LinePainter,
  /** @deprecated Use {@link TimePoint} instead. */
  LineSeriesOptions,
  NavigatorCandlePoint,
  NavigatorControllerParams,
  NavigatorData,
  NavigatorLinePoint,
  NavigatorOptions,
  NavigatorSeriesType,
  OHLCData,
  OHLCInput,
  PaintEnv,
  PieSeriesOptions,
  PieSliceData,
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
  LineSeriesDef,
  NavigatorController,
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
  hermite,
  highContrast,
  isDarkBg,
  lavenderMist,
  lightPink,
  materialPalenight,
  minimalLight,
  mintBreeze,
  monokaiPro,
  nightOwl,
  normalizeTime,
  oneDarkPro,
  panda,
  parseAnimationTime,
  peachCream,
  quietLight,
  registerBuiltinSeries,
  registerSeriesDefinition,
  resolveAxisFontSize,
  resolveAxisTextColor,
  resolveCandlestickBodyColor,
  rosePineDawn,
  roundedBarFill,
  roundedCandleFill,
  sandDune,
  smoothCurve,
  snap,
  solarizedLight,
  spring,
  steppedCurve,
  straightCurve,
  tracePath,
} from '@wick-charts/core';

export { BarSeries } from './BarSeries';
export { CandlestickSeries } from './CandlestickSeries';
// React components
export { ChartContainer } from './ChartContainer';
// React hooks
export { useChartInstance } from './context';
export type { EdgeLoaderProps, EdgeLoaderRenderArgs } from './EdgeLoader';
export { EdgeLoader } from './EdgeLoader';
export { LineSeries } from './LineSeries';
export { PieSeries } from './PieSeries';
export {
  useCrosshairPosition,
  useLastYValue,
  usePreviousClose,
  useVisibleRange,
  useYRange,
} from './store-bridge';
export { ThemeProvider, useTheme } from './ThemeContext';
export { Crosshair } from './ui/Crosshair';
export type { InfoBarProps, InfoBarRenderContext } from './ui/InfoBar';
export { InfoBar } from './ui/InfoBar';
export type { LegendItemOverride, LegendProps } from './ui/Legend';
// Legend
export { Legend } from './ui/Legend';
export type { NavigatorProps } from './ui/Navigator';
export { Navigator } from './ui/Navigator';
export { NumberFlow } from './ui/NumberFlow';
export type { PieLegendMode, PieLegendPosition, PieLegendProps, PieLegendRenderContext } from './ui/PieLegend';
export { PieLegend } from './ui/PieLegend';
export { PieTooltip } from './ui/PieTooltip';
export type { SparklineProps, SparklineValuePosition, SparklineVariant } from './ui/Sparkline';
export { Sparkline } from './ui/Sparkline';
export { TimeAxis, TimeAxis as XAxis } from './ui/TimeAxis';
export type { TitleProps } from './ui/Title';
export { Title } from './ui/Title';
export type { TooltipProps, TooltipRenderContext, TooltipSort } from './ui/Tooltip';
// UI overlays
export { Tooltip } from './ui/Tooltip';
export type { YAxisProps } from './ui/YAxis';
export { YAxis } from './ui/YAxis';
export { YLabel } from './ui/YLabel';

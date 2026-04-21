// Re-export core (users import everything from '@wick-charts/react')

export type {
  AxisBound,
  AxisConfig,
  BarSeriesOptions,
  /** @deprecated Use {@link StackingMode} instead. */
  BarStacking,
  BuildHoverSnapshotsArgs,
  BuildLastSnapshotsArgs,
  CandlestickSeriesOptions,
  ChartLayout,
  ChartOptions,
  ChartTheme,
  CrosshairPosition,
  HoverInfo,
  LegendItem,
  /** @deprecated Use {@link TimePoint} instead. */
  LineData,
  LineSeriesOptions,
  OHLCData,
  OHLCInput,
  PieSeriesOptions,
  PieSliceData,
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
  Typography,
  ValueFormatter,
  VisibleRange,
  XAxisConfig,
  YAxisConfig,
  YRange,
} from '@wick-charts/core';
export {
  ChartInstance,
  andromeda,
  ayuMirage,
  buildHoverSnapshots,
  buildLastSnapshots,
  catppuccin,
  computeTooltipPosition,
  createTheme,
  darkTheme,
  detectInterval,
  dracula,
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
  lightTheme,
  materialPalenight,
  minimalLight,
  mintBreeze,
  monokaiPro,
  nightOwl,
  normalizeTime,
  oneDarkPro,
  panda,
  peachCream,
  quietLight,
  rosePineDawn,
  sandDune,
  solarizedLight,
} from '@wick-charts/core';

export { BarSeries } from './BarSeries';
export { CandlestickSeries } from './CandlestickSeries';
// React components
export { ChartContainer } from './ChartContainer';
// React hooks
export { useChartInstance } from './context';
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
/** @deprecated Use {@link InfoBarProps} instead. */
export type { InfoBarProps, InfoBarRenderContext, TooltipLegendProps } from './ui/InfoBar';
/** @deprecated Use {@link InfoBar} instead. */
export { InfoBar, TooltipLegend } from './ui/InfoBar';
export type { LegendItemOverride, LegendProps } from './ui/Legend';
// Legend
export { Legend } from './ui/Legend';
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

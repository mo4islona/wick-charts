// Re-export core (users import everything from '@wick-charts/react')

export type {
  AxisBound,
  AxisConfig,
  BarSeriesOptions,
  /** @deprecated Use {@link StackingMode} instead. */
  BarStacking,
  CandlestickSeriesOptions,
  ChartLayout,
  ChartOptions,
  ChartTheme,
  CrosshairPosition,
  /** @deprecated Use {@link TimePoint} instead. */
  LineData,
  LineSeriesOptions,
  OHLCData,
  OHLCInput,
  PieSeriesOptions,
  PieSliceData,
  SeriesType,
  StackingMode,
  ThemeConfig,
  ThemePreset,
  TimePoint,
  TimePointInput,
  TimeValue,
  Typography,
  VisibleRange,
  XAxisConfig,
  YAxisConfig,
  YRange,
} from '@wick-charts/core';
export {
  ChartInstance,
  andromeda,
  ayuMirage,
  buildTheme,
  catppuccin,
  createTheme,
  darkTheme,
  detectInterval,
  dracula,
  formatDate,
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
  themes,
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
export type { LegendItem, LegendProps } from './ui/Legend';
// Legend
export { Legend } from './ui/Legend';
export { NumberFlow } from './ui/NumberFlow';
export type { PieLegendFormat, PieLegendProps } from './ui/PieLegend';
export { PieLegend } from './ui/PieLegend';
export { PieTooltip } from './ui/PieTooltip';
export type { SparklineProps, SparklineValuePosition, SparklineVariant } from './ui/Sparkline';
export { Sparkline } from './ui/Sparkline';
export { TimeAxis, TimeAxis as XAxis } from './ui/TimeAxis';
export type { TooltipSort } from './ui/Tooltip';
// UI overlays
export { Tooltip } from './ui/Tooltip';
export { YAxis } from './ui/YAxis';
export { YLabel } from './ui/YLabel';

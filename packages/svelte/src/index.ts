// Re-export core

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
  TooltipField,
  TooltipFormatter,
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
  catppuccin,
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

export { default as BarSeries } from './BarSeries.svelte';
export { default as CandlestickSeries } from './CandlestickSeries.svelte';
// Svelte components
export { default as ChartContainer } from './ChartContainer.svelte';
// Context and stores
export { getChartContext, getThemeContext } from './context';
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
export { default as Legend } from './ui/Legend.svelte';
export { default as NumberFlow } from './ui/NumberFlow.svelte';
export { default as PieLegend } from './ui/PieLegend.svelte';
export { default as PieTooltip } from './ui/PieTooltip.svelte';
export { default as TimeAxis } from './ui/TimeAxis.svelte';
export { default as Title } from './ui/Title.svelte';
// UI overlays
export { default as Tooltip } from './ui/Tooltip.svelte';
export { default as TooltipLegend } from './ui/TooltipLegend.svelte';
export { default as YAxis } from './ui/YAxis.svelte';
export { default as YLabel } from './ui/YLabel.svelte';

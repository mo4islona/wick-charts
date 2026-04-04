// Re-export core
export {
  ChartInstance, darkTheme, lightTheme, buildTheme, createTheme, themes,
  andromeda, ayuMirage, catppuccin, dracula, githubLight, gruvbox,
  handwritten, highContrast, lavenderMist, lightPink, minimalLight,
  mintBreeze, materialPalenight, monokaiPro, nightOwl, oneDarkPro,
  panda, peachCream, quietLight, rosePineDawn, sandDune, solarizedLight,
  formatDate, formatTime, detectInterval, niceTimeIntervals, syncSeriesData,
} from '@wick-charts/core';

export type {
  ChartOptions, AxisBound, AxisConfig, BarSeriesOptions, BarStacking, CandlestickSeriesOptions,
  CrosshairPosition, LineData, LineSeriesOptions, OHLCData, PieSeriesOptions,
  PieSliceData, YRange, VisibleRange,
  XAxisConfig, YAxisConfig, ChartTheme, Typography, ThemeConfig, ThemePreset,
} from '@wick-charts/core';

// Svelte components
export { default as ChartContainer } from './ChartContainer.svelte';
export { default as LineSeries } from './LineSeries.svelte';
export { default as BarSeries } from './BarSeries.svelte';
export { default as CandlestickSeries } from './CandlestickSeries.svelte';
export { default as PieSeries } from './PieSeries.svelte';

// UI overlays
export { default as Tooltip } from './ui/Tooltip.svelte';
export { default as Crosshair } from './ui/Crosshair.svelte';
export { default as YLabel } from './ui/YLabel.svelte';
export { default as YAxis } from './ui/YAxis.svelte';
export { default as TimeAxis } from './ui/TimeAxis.svelte';
export { default as PieTooltip } from './ui/PieTooltip.svelte';
export { default as NumberFlow } from './ui/NumberFlow.svelte';

// Context and stores
export { getChartContext, getThemeContext } from './context';
export { createVisibleRange, createYRange, createLastPrice, createPreviousClose, createCrosshairPosition } from './stores';

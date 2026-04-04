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

// Vue components
export { default as ChartContainer } from './ChartContainer.vue';
export { default as LineSeries } from './LineSeries.vue';
export { default as BarSeries } from './BarSeries.vue';
export { default as CandlestickSeries } from './CandlestickSeries.vue';
export { default as PieSeries } from './PieSeries.vue';

// UI overlays
export { default as Tooltip } from './ui/Tooltip.vue';
export { default as Crosshair } from './ui/Crosshair.vue';
export { default as YLabel } from './ui/YLabel.vue';
export { default as YAxis } from './ui/YAxis.vue';
export { default as TimeAxis } from './ui/TimeAxis.vue';
export { default as PieTooltip } from './ui/PieTooltip.vue';
export { default as NumberFlow } from './ui/NumberFlow.vue';

// Composables and context
export { useChartInstance, useTheme } from './context';
export { useVisibleRange, useYRange, useLastPrice, usePreviousClose, useCrosshairPosition } from './composables';

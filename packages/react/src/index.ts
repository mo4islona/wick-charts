// Re-export core (users import everything from '@wick-charts/react')
export {
  ChartInstance,
  darkTheme,
  lightTheme,
  buildTheme,
  createTheme,
  themes,
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
  minimalLight,
  mintBreeze,
  materialPalenight,
  monokaiPro,
  nightOwl,
  oneDarkPro,
  panda,
  peachCream,
  quietLight,
  rosePineDawn,
  sandDune,
  solarizedLight,
  formatDate,
  formatTime,
  detectInterval,
  niceTimeIntervals,
  syncSeriesData,
} from '@wick-charts/core';

export type {
  ChartOptions,
  AxisBound,
  AxisConfig,
  BarSeriesOptions,
  BarStacking,
  CandlestickSeriesOptions,
  CrosshairPosition,
  LineData,
  LineSeriesOptions,
  OHLCData,
  PieSeriesOptions,
  PieSliceData,
  YRange,
  VisibleRange,
  XAxisConfig,
  YAxisConfig,
  ChartTheme,
  Typography,
  ThemeConfig,
  ThemePreset,
} from '@wick-charts/core';

// React components
export { ChartContainer } from './ChartContainer';
export { LineSeries } from './LineSeries';
export { BarSeries } from './BarSeries';
export { CandlestickSeries } from './CandlestickSeries';
export { PieSeries } from './PieSeries';

// React hooks
export { useChartInstance } from './context';
export { ThemeProvider, useTheme } from './ThemeContext';
export {
  useCrosshairPosition,
  useLastPrice,
  usePreviousClose,
  useYRange,
  useVisibleRange,
} from './store-bridge';

// UI overlays
export { Tooltip } from './ui/Tooltip';
export type { TooltipSort } from './ui/Tooltip';
export { Crosshair } from './ui/Crosshair';
export { YLabel } from './ui/YLabel';
export { YAxis } from './ui/YAxis';
export { TimeAxis, TimeAxis as XAxis } from './ui/TimeAxis';
export { PieTooltip } from './ui/PieTooltip';
export { NumberFlow } from './ui/NumberFlow';

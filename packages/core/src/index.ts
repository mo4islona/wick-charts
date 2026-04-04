// Chart
export { ChartInstance } from './chart';
export type { ChartOptions } from './chart';

// Types
export type {
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
} from './types';

// Theme
export type { ChartTheme, Typography } from './theme/types';
export { darkTheme } from './theme/dark';
export { lightTheme } from './theme/light';
export type { ThemeConfig, ThemePreset } from './theme/palettes';
export { buildTheme, createTheme, themes } from './theme/palettes';
export {
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
} from './theme/themes';

// Utils
export { detectInterval, formatDate, formatTime, niceTimeIntervals } from './utils/time';
export { binarySearch, clamp, lerp } from './utils/math';

// Data
export { syncSeriesData } from './data/sync';

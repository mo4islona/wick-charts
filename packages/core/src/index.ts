// Chart

export type { ChartOptions, EdgeReachedInfo, EdgeSide, EdgeState } from './chart';
export { ChartInstance } from './chart';
// Overlay primitives — helpers, types, and positioning used by framework overlays
export type { LegendItem } from './legend';
export type { HoverInfo, SliceInfo } from './series/types';
export type {
  BuildHoverSnapshotsArgs,
  BuildLastSnapshotsArgs,
  SeriesSnapshot,
  SnapshotSort,
} from './snapshots';
export { buildHoverSnapshots, buildLastSnapshots } from './snapshots';
// Data
export { darkTheme } from './theme/dark';
export { lightTheme } from './theme/light';
export type { ThemeConfig, ThemePreset } from './theme/palettes';
export { createTheme } from './theme/palettes';
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
  materialPalenight,
  minimalLight,
  mintBreeze,
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
// Theme
export type { ChartTheme, Typography } from './theme/types';
export type { TooltipPosition, TooltipPositionArgs } from './tooltip-position';
export { computeTooltipPosition } from './tooltip-position';
// Types
export type {
  AxisBound,
  AxisConfig,
  BarSeriesOptions,
  /** @deprecated Use {@link StackingMode} instead. */
  BarStacking,
  CandlestickSeriesOptions,
  ChartLayout,
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
  TimePoint,
  TimePointInput,
  TimeValue,
  VisibleRange,
  XAxisConfig,
  YAxisConfig,
  YRange,
} from './types';
// Utils
export type { TooltipField, TooltipFormatter, ValueFormatter } from './utils/format';
export { formatCompact, formatPriceAdaptive } from './utils/format';
export { detectInterval, formatDate, formatTime, normalizeTime } from './utils/time';
export type { HorizontalPadding } from './viewport';

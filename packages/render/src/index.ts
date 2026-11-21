/**
 * @wick-charts/render — render Wick Charts to PNG or SVG in Node, with no browser.
 *
 * The `@wick-charts/core` engine is bundled into this package.
 */

// Themes as in the app, so a Node-only project needs no second package.
export {
  type ChartTheme,
  type ThemeConfig,
  type ThemePreset,
  andromeda,
  ayuMirage,
  catppuccin,
  createTheme,
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
} from '@wick-charts/core';

export { RenderSpecError } from './errors';
export { registerFont } from './fonts';
export { type McpServerOptions, serveMcp } from './mcp';
export { type RenderFormat, type RenderOptions, type RenderResult, renderChart } from './render';
export { chartSpecSchema } from './schema';
export type {
  BandSeriesSpec,
  BarSeriesSpec,
  CandlestickSeriesSpec,
  ChartSpec,
  DepthSeriesSpec,
  GaugeSeriesSpec,
  HeatmapSeriesSpec,
  HistogramSeriesSpec,
  LegendSpec,
  LineSeriesSpec,
  PieSeriesSpec,
  RadarSeriesSpec,
  RadialProgressSeriesSpec,
  SankeySeriesSpec,
  SeriesSpec,
  SeriesType,
  TitleSpec,
  XAxisSpec,
  YAxisSpec,
} from './spec';
export { THEME_NAMES, type ThemeName } from './themes';

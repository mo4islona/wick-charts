import type {
  AxisConfig,
  BandData,
  BandSeriesOptions,
  BarSeriesOptions,
  CandlestickData,
  CandlestickSeriesOptions,
  ChartTheme,
  DepthLevel,
  DepthSeriesOptions,
  GaugeSeriesOptions,
  GridOptions,
  HeatmapCellInput,
  HeatmapSeriesOptions,
  HistogramData,
  HistogramSeriesOptions,
  HorizontalPadding,
  LineSeriesOptions,
  MarkerConfig,
  MultiLayerData,
  PieSeriesOptions,
  PieSliceInput,
  RadarLayer,
  RadarSeriesOptions,
  RadialProgressSeriesOptions,
  ReferenceLineConfig,
  SankeyLink,
  SankeyNode,
  SankeySeriesOptions,
  ThemePreset,
  TimeRegionConfig,
  ValueFormatter,
  VisibleRangeSpec,
  XAxisFormatter,
  YAxisConfig,
} from '@wick-charts/core';

import type { ThemeName } from './themes';

/** Props every series shares, as on the framework series components. */
interface SeriesBase {
  /** Stable id for markers (`seriesId`) and the result's description. */
  id?: string;
  /** Default: `true`. A hidden series keeps its legend entry, dimmed. */
  visible?: boolean;
}

/** A series on the time or category axis. */
interface CartesianSeriesBase extends SeriesBase {
  /** Named Y scale from {@link ChartSpec.scales}. Default: the default scale. */
  scale?: string;
}

export interface LineSeriesSpec extends CartesianSeriesBase {
  type: 'line';
  data: MultiLayerData;
  options?: Partial<LineSeriesOptions>;
}

export interface BarSeriesSpec extends CartesianSeriesBase {
  type: 'bar';
  data: MultiLayerData;
  options?: Partial<BarSeriesOptions>;
}

export interface BandSeriesSpec extends CartesianSeriesBase {
  type: 'band';
  data: BandData;
  options?: Partial<BandSeriesOptions>;
}

export interface CandlestickSeriesSpec extends CartesianSeriesBase {
  type: 'candlestick';
  data: CandlestickData;
  options?: Partial<CandlestickSeriesOptions>;
}

export interface HistogramSeriesSpec extends CartesianSeriesBase {
  type: 'histogram';
  data: HistogramData;
  options?: Partial<HistogramSeriesOptions>;
}

export interface PieSeriesSpec extends SeriesBase {
  type: 'pie';
  data: PieSliceInput[];
  options?: Partial<PieSeriesOptions>;
}

export interface RadialProgressSeriesSpec extends SeriesBase {
  type: 'radialProgress';
  data: PieSliceInput[];
  options?: Partial<RadialProgressSeriesOptions>;
}

export interface GaugeSeriesSpec extends SeriesBase {
  type: 'gauge';
  value: number;
  options?: Partial<GaugeSeriesOptions>;
}

export interface HeatmapSeriesSpec extends SeriesBase {
  type: 'heatmap';
  data: HeatmapCellInput[];
  options?: Partial<HeatmapSeriesOptions>;
}

export interface DepthSeriesSpec extends SeriesBase {
  type: 'depth';
  bids: readonly DepthLevel[];
  asks: readonly DepthLevel[];
  options?: Partial<DepthSeriesOptions>;
}

export interface RadarSeriesSpec extends SeriesBase {
  type: 'radar';
  axes: string[];
  data: RadarLayer[];
  options?: Partial<RadarSeriesOptions>;
}

export interface SankeySeriesSpec extends SeriesBase {
  type: 'sankey';
  nodes: readonly SankeyNode[];
  links: readonly SankeyLink[];
  options?: Partial<SankeySeriesOptions>;
}

export type SeriesSpec =
  | LineSeriesSpec
  | BarSeriesSpec
  | BandSeriesSpec
  | CandlestickSeriesSpec
  | HistogramSeriesSpec
  | PieSeriesSpec
  | RadialProgressSeriesSpec
  | GaugeSeriesSpec
  | HeatmapSeriesSpec
  | DepthSeriesSpec
  | RadarSeriesSpec
  | SankeySeriesSpec;

export type SeriesType = SeriesSpec['type'];

/** `<XAxis>` props. `false` hides the labels; the axis row keeps its height, as without `<XAxis>`. */
export interface XAxisSpec {
  format?: XAxisFormatter;
  labelCount?: number;
  minLabelSpacing?: number;
}

/** `<YAxis>` props for the default scale. */
export interface YAxisSpec {
  /** A formatter, or a template such as `"{value}%"` or `"€{value:2}"`. */
  format?: ValueFormatter | string;
  labelCount?: number;
  minLabelSpacing?: number;
}

/** `<Title>` props. */
export interface TitleSpec {
  text?: string;
  /** Smaller, muted text after the title, such as a timeframe. */
  sub?: string;
}

/** `<Legend>` props. A pie or radial progress chart lists its slices. */
export interface LegendSpec {
  /** Default: `'bottom'`. */
  position?: 'bottom' | 'right';
  /** Replace the items the series give. */
  items?: { label: string; color: string }[];
}

/**
 * One chart, described as data: the props of `ChartContainer` and of its
 * children. The same spec gives the same chart as the framework components.
 * Every field is JSON except the `format` functions.
 */
export interface ChartSpec {
  /** Image width in CSS px. Default: `800`. */
  width?: number;
  /** Image height in CSS px. Default: `400`. */
  height?: number;
  /** A preset name such as `'githubLight'`, a preset such as `githubLight`, or a `createTheme()` result. Default: `'catppuccin'`. */
  theme?: ThemeName | ChartTheme | ThemePreset;
  /** Fill behind the chart. Default: the theme background. `'transparent'` leaves the PNG transparent. */
  background?: string;
  /** The theme's vertical background gradient, as `ChartContainer` `gradient`. Default: `false`. */
  gradient?: boolean;
  axis?: AxisConfig;
  scales?: Record<string, YAxisConfig>;
  /** Plot padding, as `ChartContainer` `padding`: px, or `{ intervals }` of data on the X sides. */
  padding?: { top?: number; bottom?: number; right?: HorizontalPadding; left?: HorizontalPadding };
  /** Most bars the default fit shows. Default: 200. */
  viewport?: { maxVisibleBars?: number };
  /** The X range to show, as `ChartContainer` `visibleRange`. Default: all the data. */
  visibleRange?: VisibleRangeSpec;
  grid?: GridOptions;
  /** Edge fades, as `ChartContainer` `fade`. An SVG has no fades: SVG cannot erase what is under it. */
  fade?: boolean | { top?: number; overlap?: number; right?: number; left?: number };
  locale?: string;
  timeZone?: string;
  title?: string | TitleSpec;
  /** `true` for the default legend. Default: no legend. */
  legend?: boolean | LegendSpec;
  /** `<XAxis>` props. `false` hides the labels and keeps their row; `axis.x.visible: false` removes the row. */
  xAxis?: false | XAxisSpec;
  /** `<YAxis>` props. `false` hides the labels and keeps their column; `axis.y.visible: false` removes the column. */
  yAxis?: false | YAxisSpec;
  series: SeriesSpec[];
  markers?: MarkerConfig[];
  regions?: TimeRegionConfig[];
  /** Reference lines, as `<ReferenceLine>`. */
  lines?: ReferenceLineConfig[];
}

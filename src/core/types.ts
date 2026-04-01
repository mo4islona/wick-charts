export interface OHLCData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface LineData {
  time: number;
  value: number;
}

export interface VisibleRange {
  from: number;
  to: number;
}

export interface PriceRange {
  min: number;
  max: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface CanvasSize {
  media: Size;
  bitmap: Size;
  horizontalPixelRatio: number;
  verticalPixelRatio: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface CrosshairPosition {
  mediaX: number;
  mediaY: number;
  time: number;
  price: number;
}

export interface ChartLayout {
  chartArea: Rect;
  priceAxisWidth: number;
  timeAxisHeight: number;
}

export type SeriesType = "candlestick" | "line";

export interface CandlestickSeriesOptions {
  upColor: string;
  downColor: string;
  wickUpColor: string;
  wickDownColor: string;
  bodyWidthRatio: number;
}

export interface LineSeriesOptions {
  color: string;
  lineWidth: number;
  areaFill: boolean;
  areaTopColor: string;
  areaBottomColor: string;
}

export interface BarSeriesOptions {
  positiveColor: string;
  negativeColor: string;
  barWidthRatio: number;
}

export interface StackedBarSeriesOptions {
  colors: string[];
  barWidthRatio: number;
}

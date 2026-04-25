/** Series type the navigator should render in its miniature view. */
export type NavigatorSeriesType = 'line' | 'bar' | 'candlestick';

/** Minimal point shape for line and bar miniature series. */
export interface NavigatorLinePoint {
  time: number;
  value: number;
}

/** Minimal point shape for candlestick miniature series. */
export interface NavigatorCandlePoint {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

/**
 * Data passed to the navigator. The discriminant `type` selects the miniature
 * rendering style. Line and bar accept either a single `points` array
 * (shorthand) or `series` for multi-series overlays — every series shares the
 * same y-range and is drawn in the navigator's neutral foreground color.
 * Candlestick stays single-series; multi-candlestick miniatures don't read.
 */
export type NavigatorData =
  | { type: 'line' | 'bar'; points: readonly NavigatorLinePoint[] }
  | { type: 'line' | 'bar'; series: readonly (readonly NavigatorLinePoint[])[] }
  | { type: 'candlestick'; points: readonly NavigatorCandlePoint[] };

export interface NavigatorOptions {
  /**
   * Strip height in CSS pixels. When omitted, falls back to
   * `chart.getTheme().navigator.height`.
   */
  height?: number;
}

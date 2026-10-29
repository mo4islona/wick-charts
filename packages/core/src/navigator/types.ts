import type { TimeValue } from '../types';

/** Series type the navigator should render in its miniature view. */
export type NavigatorSeriesType = 'line' | 'bar' | 'candlestick';

/** Minimal point shape for line and bar miniature series. Time is a timestamp in milliseconds. */
export interface NavigatorLinePoint {
  time: number;
  value: number;
}

/** {@link NavigatorLinePoint} that also accepts `Date` for the time field. */
export type NavigatorLinePointInput = Omit<NavigatorLinePoint, 'time'> & { time: TimeValue };

/** Minimal point shape for candlestick miniature series. Time is a timestamp in milliseconds. */
export interface NavigatorCandlePoint {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

/** {@link NavigatorCandlePoint} that also accepts `Date` for the time field, so an `OHLCInput[]` fits. */
export type NavigatorCandlePointInput = Omit<NavigatorCandlePoint, 'time'> & { time: TimeValue };

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

/** {@link NavigatorData} whose points also accept `Date` times, like the series data. */
export type NavigatorDataInput =
  | { type: 'line' | 'bar'; points: readonly NavigatorLinePointInput[] }
  | { type: 'line' | 'bar'; series: readonly (readonly NavigatorLinePointInput[])[] }
  | { type: 'candlestick'; points: readonly NavigatorCandlePointInput[] };

export interface NavigatorOptions {
  /**
   * Strip height in CSS pixels. When omitted, falls back to
   * `chart.getTheme().navigator.height`.
   */
  height?: number;
}

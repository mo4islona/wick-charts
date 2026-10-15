import type { BandPoint, OHLCData, TimePoint } from '../types';

/** Any point a time-series renderer stores. */
export type SeriesPoint = OHLCData | TimePoint | BandPoint;

/** True for a band sample — the only point kind with edges but no `close`. */
export function isBandPoint(point: SeriesPoint): point is BandPoint {
  return !('close' in point) && 'high' in point;
}

/**
 * A point's representative scalar: `close` for OHLC, `value` for line / bar,
 * the midpoint for a band. For ordering and anchoring only — a band has no
 * single value to display.
 */
export function pointValue(point: SeriesPoint): number {
  if ('close' in point) return point.close;
  if (isBandPoint(point)) return (point.low + point.high) / 2;

  return point.value;
}

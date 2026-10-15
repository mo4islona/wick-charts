/**
 * Last-value queries used by overlay components (YLabel, InfoBar). Pulled
 * out of ChartInstance because the math is pure series-store reads — no
 * chart state beyond the series array and the current visible X window.
 */

import { type SeriesRenderer, isTimeSeriesRenderer } from '../series/types';
import type { XRange } from '../types';
import { type SeriesPoint, isBandPoint, pointValue } from '../utils/point';

export interface LastValueSeries {
  readonly id: string;
  readonly renderer: SeriesRenderer;
}

export interface LastValueResult {
  value: number;
  isLive: boolean;
}

/** The value a last-value badge shows — `null` for a band, which has no single value. */
function badgeValue(point: SeriesPoint): number | null {
  return isBandPoint(point) ? null : pointValue(point);
}

/**
 * Return the last visible value and whether the absolute last data point
 * is on screen. Returns `null` for unknown ids, empty stores, or windows
 * with no visible points.
 */
export function getLastValue(
  seriesId: string,
  series: readonly LastValueSeries[],
  xRange: XRange,
): LastValueResult | null {
  const entry = series.find((s) => s.id === seriesId);
  if (!entry) return null;

  const renderer = entry.renderer;
  if (!isTimeSeriesRenderer(renderer)) return null;

  const last = renderer.getLastDataPoint();
  if (!last) return null;

  const { from, to } = xRange;
  if (last.time >= from && last.time <= to) {
    const value = badgeValue(last);

    return value === null ? null : { value, isLive: true };
  }

  const visible = renderer.getVisibleDataPoints(from, to);
  if (visible.length === 0) return null;

  const value = badgeValue(visible[visible.length - 1]);

  return value === null ? null : { value, isLive: false };
}

/**
 * Cumulative top last-value for stacked series — the point a YLabel badge
 * anchors to on the rendered stack head. Falls back to {@link getLastValue}
 * for renderers without a stacked concept (Candlestick, single-layer Line/Bar).
 */
export function getStackedLastValue(
  seriesId: string,
  series: readonly LastValueSeries[],
  xRange: XRange,
): LastValueResult | null {
  const entry = series.find((s) => s.id === seriesId);
  if (!entry) return null;

  const stacked = entry.renderer.getStackedLastValue?.();
  if (stacked) return stacked;

  return getLastValue(seriesId, series, xRange);
}

/** Second-to-last value, useful for computing change. */
export function getPreviousClose(seriesId: string, series: readonly LastValueSeries[]): number | null {
  const entry = series.find((s) => s.id === seriesId);
  if (!entry) return null;

  const renderer = entry.renderer;
  if (!isTimeSeriesRenderer(renderer)) return null;

  const prev = renderer.getSecondLastDataPoint();
  if (!prev) return null;

  return badgeValue(prev);
}

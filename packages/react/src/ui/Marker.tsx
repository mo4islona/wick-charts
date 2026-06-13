import { useLayoutEffect, useRef } from 'react';

import type { MarkerShape, TimeValue } from '@wick-charts/core';

import { useChartInstance } from '../context';

export interface MarkerProps {
  /** X anchor — epoch ms or a `Date`. */
  time: TimeValue;
  /**
   * Y anchor as a data value. Omit and set {@link MarkerProps.seriesId} to snap
   * the marker to that series' nearest data point at `time`.
   */
  value?: number;
  /** Snap Y to this series' value at `time` when `value` is omitted. Also the default color source. */
  seriesId?: string;
  /** Glyph at the anchor. Default: `'dot'`. Arrows point their tip at the anchor. */
  shape?: MarkerShape;
  /** Reuse the line pulse halo around the anchor. Default: `false`. */
  pulse?: boolean;
  /** Optional text label drawn in a pill next to the anchor. */
  label?: string;
  /** Color override. Falls back to the series color (when `seriesId` is set), then the theme line color. */
  color?: string;
}

/**
 * A point annotation (event marker) pinned to a `time` / `value` — "anomaly
 * opened here", "deploy v1.2.3", "alert resolved". Renders on the chart's
 * overlay canvas and stays out of the series model, so it never shows up in the
 * tooltip, legend, or Y-range autoscale, and is clipped to the plot area.
 *
 * ```tsx
 * <Marker time={openedMs} seriesId="metric" shape="arrow-down" pulse label="broke" color="#f0556a" />
 * ```
 */
export function Marker({ time, value, seriesId, shape, pulse, label, color }: MarkerProps) {
  const chart = useChartInstance();
  const idRef = useRef<string | null>(null);

  // Normalized ms drives the update effect's dep list so a fresh `Date` object
  // for the same instant doesn't trigger a redundant update on every render.
  const timeMs = time instanceof Date ? time.getTime() : time;

  // Register once on mount; tear down on unmount.
  useLayoutEffect(() => {
    const id = chart.addMarker({ time, value, seriesId, shape, pulse, label, color });
    idRef.current = id;

    return () => {
      chart.removeMarker(id);
      idRef.current = null;
    };
  }, [chart]);

  // Push prop changes through to the live marker.
  useLayoutEffect(() => {
    const id = idRef.current;
    if (id === null) return;

    chart.updateMarker(id, { time, value, seriesId, shape, pulse, label, color });
  }, [chart, timeMs, value, seriesId, shape, pulse, label, color]);

  return null;
}

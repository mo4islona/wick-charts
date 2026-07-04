import { useLayoutEffect, useRef } from 'react';

import type { TimeRegionEnd, TimeValue } from '@wick-charts/core';

import { useChartInstance } from '../context';

export interface TimeRegionProps {
  /** Left edge — epoch ms or a `Date`. */
  from: TimeValue;
  /**
   * Right edge — epoch ms or a `Date`. Omit (or pass `'now'`) for an open-ended
   * region that extends to the right edge of the plot — the "still firing" case.
   */
  to?: TimeRegionEnd;
  /** Band fill — any CSS color, typically translucent. Default: a faint tint of `color`. */
  fill?: string;
  /** Optional text label drawn in an annotation chip at the top of the band. */
  label?: string;
  /** Edge-line and label-chip accent. Default: the theme's muted axis text color. */
  color?: string;
}

/** Normalize a region edge to a stable dep-list key (a `Date` is identity-unstable across renders). */
function edgeKey(edge: TimeRegionEnd | undefined): number | string | undefined {
  if (edge === undefined || edge === 'now') return edge;

  return edge instanceof Date ? edge.getTime() : edge;
}

/**
 * A translucent vertical band shading the interval `[from, to]` — an anomaly
 * window, a maintenance window, a highlighted session. Renders on the chart's
 * main layer *behind* the series and stays out of the series model, so it never
 * affects the Y-range autoscale, tooltip, or legend. Omit `to` (or pass
 * `'now'`) for an open-ended band that extends to the right edge.
 *
 * ```tsx
 * <TimeRegion from={openedMs} to={recoveredMs ?? 'now'} fill="rgba(240, 85, 106, 0.08)" label="anomaly window" />
 * ```
 */
export function TimeRegion({ from, to, fill, label, color }: TimeRegionProps) {
  const chart = useChartInstance();
  const idRef = useRef<string | null>(null);

  // Register once on mount; tear down on unmount.
  useLayoutEffect(() => {
    const id = chart.addRegion({ from, to, fill, label, color });
    idRef.current = id;

    return () => {
      chart.removeRegion(id);
      idRef.current = null;
    };
  }, [chart]);

  // Push prop changes through to the live region. Normalized edge keys keep a
  // fresh `Date` for the same instant from triggering a redundant update.
  useLayoutEffect(() => {
    const id = idRef.current;
    if (id === null) return;

    chart.updateRegion(id, { from, to, fill, label, color });
  }, [chart, edgeKey(from), edgeKey(to), fill, label, color]);

  return null;
}

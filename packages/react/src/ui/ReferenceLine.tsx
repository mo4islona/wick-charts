import { useLayoutEffect, useRef } from 'react';

import type { ReferenceLineStyle, TimeValue } from '@wick-charts/core';

import { useChartInstance } from '../context';

export interface ReferenceLineProps {
  /** Horizontal line at this Y data value. Mutually exclusive with {@link ReferenceLineProps.time}. */
  value?: number;
  /** Vertical line at this `time` (epoch ms or `Date`). Mutually exclusive with {@link ReferenceLineProps.value}. */
  time?: TimeValue;
  /** Line and label-pill color. Default: the theme line color. */
  color?: string;
  /** Optional text label drawn in a pill at the line's near end. */
  label?: string;
  /** Dash style. Default: `'dashed'`. */
  style?: ReferenceLineStyle;
  /** Stroke width in CSS pixels. Default: `1`. */
  width?: number;
}

/**
 * A straight reference line across the plot — a horizontal threshold / baseline
 * pinned to a `value`, or a vertical event boundary pinned to a `time`
 * (mutually exclusive). Renders on the chart's overlay layer *above* the series
 * and stays out of the series model, so it never affects the Y-range autoscale,
 * tooltip, or legend.
 *
 * ```tsx
 * <ReferenceLine value={0.5} label="alert" color="#f0556a" />
 * <ReferenceLine time={deployMs} label="deploy" />
 * ```
 */
export function ReferenceLine({ value, time, color, label, style, width }: ReferenceLineProps) {
  const chart = useChartInstance();
  const idRef = useRef<string | null>(null);

  // Normalized ms keeps a fresh `Date` for the same instant from triggering a redundant update.
  const timeMs = time instanceof Date ? time.getTime() : time;

  // Register once on mount; tear down on unmount.
  useLayoutEffect(() => {
    const id = chart.addLine({ value, time, color, label, style, width });
    idRef.current = id;

    return () => {
      chart.removeLine(id);
      idRef.current = null;
    };
  }, [chart]);

  // Push prop changes through to the live line.
  useLayoutEffect(() => {
    const id = idRef.current;
    if (id === null) return;

    chart.updateLine(id, { value, time, color, label, style, width });
  }, [chart, value, timeMs, color, label, style, width]);

  return null;
}

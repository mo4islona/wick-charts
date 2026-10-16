import { useLayoutEffect, useRef } from 'react';

import { type XAxisFormatter, mountAxisLabels } from '@wick-charts/core';

import { useChartInstance } from '../context';
import { useAxisLayout, useVisibleRange } from '../store-bridge';

export interface XAxisProps {
  /** Desired number of labels (≥ 2). Overrides chart-level `axis.x.labelCount`. */
  labelCount?: number;
  /** Minimum pixel gap between adjacent labels (hard floor). Overrides chart-level. */
  minLabelSpacing?: number;
  /**
   * Custom label formatter. `x` is epoch ms on a time axis, the number on a
   * numeric axis, the category name on a category axis; `step` is the tick
   * spacing. Also formats the crosshair label and the tooltip / info-bar
   * headers. Default: time formatting, a locale number, or the name.
   */
  format?: XAxisFormatter;
}

/** The X axis labels of any `axis.x.type` — time, numeric or category. */
export function XAxis({ labelCount, minLabelSpacing, format }: XAxisProps = {}) {
  const chart = useChartInstance();
  // Subscribe so the container re-renders when chart geometry shifts
  // (yAxisWidth / xAxisHeight can change on resize, legend mount, etc.).
  useVisibleRange(chart);
  const layout = useAxisLayout(chart);

  const containerRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    chart.setTimeAxisLabelDensity({
      labelCount: labelCount ?? null,
      minLabelSpacing: minLabelSpacing ?? null,
    });

    return () => {
      chart.setTimeAxisLabelDensity({ labelCount: null, minLabelSpacing: null });
    };
  }, [chart, labelCount, minLabelSpacing]);

  useLayoutEffect(() => {
    chart.setXAxisFormat(format ?? null);

    return () => chart.setXAxisFormat(null);
  }, [chart, format]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (container === null) return;

    return mountAxisLabels({ chart, container, axis: 'x' });
  }, [chart]);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        left: layout.leftAxisWidth,
        bottom: 0,
        right: layout.rightAxisWidth,
        height: layout.xAxisHeight,
        pointerEvents: 'none',
        display: 'flex',
        alignItems: 'center',
      }}
    />
  );
}

/** Alias of {@link XAxis}, kept from when the X axis was time-only. */
export const TimeAxis = XAxis;

import { useLayoutEffect, useRef } from 'react';

import { type ValueFormatter, mountAxisLabels } from '@wick-charts/core';

import { useChartInstance } from '../context';
import { useAxisLayout, useYRange } from '../store-bridge';

export interface YAxisProps {
  /**
   * Custom tick-label formatter. When supplied, overrides the built-in
   * range-adaptive formatter for this axis.
   */
  format?: ValueFormatter;
  /**
   * Desired number of labels (≥ 2). Overrides any chart-level `axis.y.labelCount`.
   * Realized count may differ ±1 after the 1-2-5 snap.
   */
  labelCount?: number;
  /** Minimum pixel gap between adjacent labels (hard floor). Overrides chart-level. */
  minLabelSpacing?: number;
  /**
   * Named Y scale (`ChartContainer` `scales`) this axis labels. Default: the
   * default scale. An overlay scale has no column, so only `format` and the
   * label density apply.
   */
  scale?: string;
}

export function YAxis({ format, labelCount, minLabelSpacing, scale }: YAxisProps = {}) {
  const chart = useChartInstance();
  useYRange(chart);
  const layout = useAxisLayout(chart);
  // An id `scales` doesn't define (yet) must not fall through to the default scale.
  const known = scale === undefined || chart.getYScaleIds().includes(scale);
  const defaultColumn = { position: layout.yAxisPosition, width: layout.yAxisWidth };
  const namedColumn = known ? chart.getYScaleColumn(scale) : null;
  const column = scale === undefined ? defaultColumn : namedColumn;
  const hasColumn = column !== null;

  const containerRef = useRef<HTMLDivElement | null>(null);

  // Route the prop through yScale so the *same* formatter drives every
  // surface that reads `yScale.formatY()` (Crosshair, YLabel fallback).
  useLayoutEffect(() => {
    if (!known) return;

    chart.setYAxisFormat({ format: format ?? null, scale });

    return () => chart.setYAxisFormat({ format: null, scale });
  }, [chart, format, scale, known]);

  useLayoutEffect(() => {
    if (!known) return;

    chart.setYAxisLabelDensity({
      labelCount: labelCount ?? null,
      minLabelSpacing: minLabelSpacing ?? null,
      scale,
    });

    return () => {
      chart.setYAxisLabelDensity({ labelCount: null, minLabelSpacing: null, scale });
    };
  }, [chart, labelCount, minLabelSpacing, scale, known]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (container === null) return;

    return mountAxisLabels({ chart, container, axis: 'y', scale });
  }, [chart, scale, hasColumn]);

  if (column === null) return null;

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        [column.position]: 0,
        top: 0,
        bottom: layout.xAxisHeight,
        width: column.width,
        pointerEvents: 'none',
      }}
    />
  );
}

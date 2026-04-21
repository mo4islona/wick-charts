import { useEffect, useLayoutEffect, useRef } from 'react';

import type { PieSeriesOptions, PieSliceData } from '@wick-charts/core';

import { useChartInstance } from './context';

export interface PieSeriesProps {
  data: PieSliceData[];
  options?: Partial<PieSeriesOptions>;
  /** Stable series ID — same value across remounts. */
  id?: string;
}

/** Pie chart series. Set `options.innerRadiusRatio` > 0 for donut. */
export function PieSeries({ data, options, id: idProp }: PieSeriesProps) {
  const chart = useChartInstance();
  const seriesRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    const id = chart.addPieSeries({ ...options, id: idProp });
    seriesRef.current = id;
    return () => {
      chart.removeSeries(id);
      seriesRef.current = null;
    };
  }, [chart, idProp]);

  useEffect(() => {
    if (seriesRef.current && options) {
      chart.updateSeriesOptions(seriesRef.current, options);
    }
  }, [
    chart,
    options?.innerRadiusRatio,
    options?.padAngle,
    options?.stroke?.color,
    options?.stroke?.width,
    options?.colors,
    options?.sliceLabels?.mode,
    options?.sliceLabels?.content,
    options?.sliceLabels?.fontSize,
    options?.sliceLabels?.minSliceAngle,
    options?.sliceLabels?.elbowLen,
    options?.sliceLabels?.legPad,
    options?.sliceLabels?.labelGap,
    options?.sliceLabels?.balanceSides,
  ]);

  useLayoutEffect(() => {
    if (seriesRef.current) {
      chart.setSeriesData(seriesRef.current, data);
    }
  }, [chart, data]);

  return null;
}

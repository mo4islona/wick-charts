import { useEffect, useRef } from 'react';

import type { PieSeriesOptions, PieSliceData } from '@wick-charts/core';
import { useChartInstance } from './context';

export interface PieSeriesProps {
  data: PieSliceData[];
  options?: Partial<PieSeriesOptions>;
  onSeriesId?: (id: string) => void;
}

/** Pie chart series. Set `options.innerRadiusRatio` > 0 for donut. */
export function PieSeries({ data, options, onSeriesId }: PieSeriesProps) {
  const chart = useChartInstance();
  const seriesRef = useRef<string | null>(null);

  useEffect(() => {
    const id = chart.addPieSeries(options);
    seriesRef.current = id;
    onSeriesId?.(id);
    return () => {
      chart.removeSeries(id);
      seriesRef.current = null;
    };
  }, [chart]);

  useEffect(() => {
    if (seriesRef.current && options) {
      chart.updateSeriesOptions(seriesRef.current, options);
    }
  }, [chart, options?.innerRadiusRatio, options?.padAngle, options?.strokeColor, options?.strokeWidth, options?.colors]);

  useEffect(() => {
    if (seriesRef.current && data.length > 0) {
      chart.setPieData(seriesRef.current, data);
    }
  }, [chart, data]);

  return null;
}

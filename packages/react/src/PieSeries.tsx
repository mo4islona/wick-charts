import { useEffect, useLayoutEffect, useRef } from 'react';

import type { PieSeriesOptions, PieSliceData } from '@wick-charts/core';

import { useChartInstance } from './context';

export interface PieSeriesProps {
  data: PieSliceData[];
  options?: Partial<PieSeriesOptions>;
  /** Stable series ID. Prefer this over `onSeriesId` — same value across remounts. */
  id?: string;
  /** @deprecated Use the `id` prop instead. */
  onSeriesId?: (id: string) => void;
}

/** Pie chart series. Set `options.innerRadiusRatio` > 0 for donut. */
export function PieSeries({ data, options, id: idProp, onSeriesId }: PieSeriesProps) {
  const chart = useChartInstance();
  const seriesRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    const id = chart.addPieSeries({ ...options, id: idProp });
    seriesRef.current = id;
    onSeriesId?.(id);
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
    options?.strokeColor,
    options?.strokeWidth,
    options?.colors,
  ]);

  useLayoutEffect(() => {
    if (seriesRef.current) {
      chart.setPieData(seriesRef.current, data);
    }
  }, [chart, data]);

  return null;
}

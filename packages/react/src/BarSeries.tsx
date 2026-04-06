import { useEffect, useLayoutEffect, useRef } from 'react';

import type { BarSeriesOptions, LineData } from '@wick-charts/core';

import { useChartInstance } from './context';

export interface BarSeriesProps {
  /** Array of datasets — one per layer. A single-layer bar chart uses `[data]`. */
  data: LineData[][];
  options?: Partial<BarSeriesOptions>;
  onSeriesId?: (id: string) => void;
}

export function BarSeries({ data, options, onSeriesId }: BarSeriesProps) {
  const chart = useChartInstance();
  const seriesRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    const id = chart.addBarSeries(data.length, options);
    seriesRef.current = id;
    onSeriesId?.(id);
    return () => {
      chart.removeSeries(id);
      seriesRef.current = null;
    };
  }, [chart, data.length]);

  useLayoutEffect(() => {
    const id = seriesRef.current;
    if (!id) return;
    chart.beginUpdate();
    for (let i = 0; i < data.length; i++) {
      chart.setBarLayerData(id, i, data[i]);
    }
    chart.endUpdate();
  }, [chart, data]);

  useEffect(() => {
    if (seriesRef.current && options) {
      chart.updateSeriesOptions(seriesRef.current, options);
    }
  }, [chart, options?.colors?.join(','), options?.barWidthRatio, options?.stacking]);

  return null;
}

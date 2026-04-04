import { useEffect, useRef } from 'react';

import type { LineData, LineSeriesOptions } from '@wick-charts/core';

import { useChartInstance } from './context';

export interface LineSeriesProps {
  /** Array of datasets — one per layer. A single line uses `[data]`. */
  data: LineData[][];
  options?: Partial<LineSeriesOptions>;
  label?: string;
  onSeriesId?: (id: string) => void;
}

export function LineSeries({ data, options, label, onSeriesId }: LineSeriesProps) {
  const chart = useChartInstance();
  const seriesRef = useRef<string | null>(null);

  useEffect(() => {
    const id = chart.addLineSeries(data.length, { ...options, label: label ?? options?.label });
    seriesRef.current = id;
    onSeriesId?.(id);
    return () => {
      chart.removeSeries(id);
      seriesRef.current = null;
    };
  }, [chart, data.length]);

  useEffect(() => {
    const id = seriesRef.current;
    if (!id) return;
    chart.beginUpdate();
    for (let i = 0; i < data.length; i++) {
      chart.setLineLayerData(id, i, data[i]);
    }
    chart.endUpdate();
  }, [chart, data]);

  useEffect(() => {
    if (seriesRef.current && options) {
      chart.updateSeriesOptions(seriesRef.current, options);
    }
  }, [chart, options?.colors?.join(','), options?.lineWidth, options?.areaFill, options?.pulse, options?.stacking]);

  return null;
}

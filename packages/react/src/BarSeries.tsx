import { useEffect, useLayoutEffect, useRef } from 'react';

import type { BarSeriesOptions, TimePoint } from '@wick-charts/core';

import { useChartInstance } from './context';

export interface BarSeriesProps {
  /** Array of datasets — one per layer. A single-layer bar chart uses `[data]`. */
  data: TimePoint[][];
  options?: Partial<BarSeriesOptions>;
  /** Display label shown in the tooltip. */
  label?: string;
  /** Stable series ID. Prefer this over `onSeriesId` — same value across remounts. */
  id?: string;
  /** @deprecated Use the `id` prop instead. */
  onSeriesId?: (id: string) => void;
}

export function BarSeries({ data, options, label, id: idProp, onSeriesId }: BarSeriesProps) {
  const chart = useChartInstance();
  const seriesRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    const id = chart.addBarSeries({ ...options, label: label ?? options?.label, layers: data.length, id: idProp });
    seriesRef.current = id;
    onSeriesId?.(id);
    return () => {
      chart.removeSeries(id);
      seriesRef.current = null;
    };
  }, [chart, data.length, idProp]);

  useLayoutEffect(() => {
    const id = seriesRef.current;
    if (!id) return;
    chart.batch(() => {
      for (let i = 0; i < data.length; i++) {
        chart.setBarLayerData(id, i, data[i]);
      }
    });
  }, [chart, data]);

  useEffect(() => {
    if (seriesRef.current && options) {
      chart.updateSeriesOptions(seriesRef.current, options);
    }
  }, [chart, options?.colors?.join(','), options?.barWidthRatio, options?.stacking]);

  return null;
}

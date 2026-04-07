import { useEffect, useLayoutEffect, useRef } from 'react';

import type { LineSeriesOptions, TimePoint } from '@wick-charts/core';

import { useChartInstance } from './context';

export interface LineSeriesProps {
  /** Array of datasets — one per layer. A single line uses `[data]`. */
  data: TimePoint[][];
  options?: Partial<LineSeriesOptions>;
  label?: string;
  /** Stable series ID. Prefer this over `onSeriesId` — same value across remounts. */
  id?: string;
  /** @deprecated Use the `id` prop instead. */
  onSeriesId?: (id: string) => void;
}

export function LineSeries({ data, options, label, id: idProp, onSeriesId }: LineSeriesProps) {
  const chart = useChartInstance();
  const seriesRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    const id = chart.addLineSeries({ ...options, label: label ?? options?.label, layers: data.length, id: idProp });
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
        chart.setLineLayerData(id, i, data[i]);
      }
    });
  }, [chart, data]);

  useEffect(() => {
    if (seriesRef.current && options) {
      chart.updateSeriesOptions(seriesRef.current, options);
    }
  }, [chart, options?.colors?.join(','), options?.lineWidth, options?.areaFill, options?.pulse, options?.stacking]);

  return null;
}

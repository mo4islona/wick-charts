import { useEffect, useLayoutEffect, useRef } from 'react';

import {
  type BarSeriesOptions,
  EMPTY_SYNC_STATE,
  type SeriesSyncState,
  type TimePoint,
  syncSeriesLayer,
} from '@wick-charts/core';

import { useChartInstance } from './context';

export interface BarSeriesProps {
  /** Array of datasets — one per layer. A single-layer bar chart uses `[data]`. */
  data: TimePoint[][];
  /** Visual options override — colours per layer, bar-width ratio, stacking, entrance animation, smoothing. */
  options?: Partial<BarSeriesOptions>;
  /** Stable series ID — same value across remounts. */
  id?: string;
}

export function BarSeries({ data, options, id: idProp }: BarSeriesProps) {
  const chart = useChartInstance();
  const seriesRef = useRef<string | null>(null);
  const prevSyncRef = useRef<SeriesSyncState[]>([]);

  useLayoutEffect(() => {
    const id = chart.addSeries('bar', { ...options, layers: data.length, id: idProp });
    seriesRef.current = id;
    prevSyncRef.current = new Array(data.length).fill(EMPTY_SYNC_STATE);
    return () => {
      chart.removeSeries(id);
      seriesRef.current = null;
      prevSyncRef.current = [];
    };
  }, [chart, data.length, idProp]);

  useLayoutEffect(() => {
    const id = seriesRef.current;
    if (!id) return;

    chart.batch(() => {
      for (let i = 0; i < data.length; i++) {
        prevSyncRef.current[i] = syncSeriesLayer({
          chart,
          id,
          data: data[i],
          prev: prevSyncRef.current[i] ?? EMPTY_SYNC_STATE,
          layerIndex: i,
        });
      }
    });
  }, [chart, data]);

  useEffect(() => {
    if (seriesRef.current && options) {
      chart.updateSeriesOptions(seriesRef.current, options);
    }
  }, [
    chart,
    options?.colors?.join(','),
    options?.barWidthRatio,
    options?.stacking,
    options?.entryAnimation,
    options?.entryMs,
    options?.smoothMs,
    options?.cornerRadius,
    options?.projectedFrom,
    // A registry-name string diffs by value; a raw painter function diffs by
    // reference (a new inline function re-applies next commit — documented).
    options?.barPainter,
  ]);

  return null;
}

import { useEffect, useLayoutEffect, useRef } from 'react';

import {
  EMPTY_SYNC_STATE,
  type LineSeriesOptions,
  type SeriesSyncState,
  type TimePoint,
  syncSeriesLayer,
} from '@wick-charts/core';

import { useChartInstance } from './context';

export interface LineSeriesProps {
  /** Array of datasets — one per layer. A single line uses `[data]`. */
  data: TimePoint[][];
  /** Visual options override — colours per layer, stroke width, area fill, stacking, entrance animation, smoothing. */
  options?: Partial<LineSeriesOptions>;
  /** Stable series ID — same value across remounts. */
  id?: string;
}

export function LineSeries({ data, options, id: idProp }: LineSeriesProps) {
  const chart = useChartInstance();
  const seriesRef = useRef<string | null>(null);
  const prevSyncRef = useRef<SeriesSyncState[]>([]);

  useLayoutEffect(() => {
    const id = chart.addSeries('line', { ...options, layers: data.length, id: idProp });
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
    options?.strokeWidth,
    options?.area?.visible,
    (options as { areaFill?: boolean } | undefined)?.areaFill,
    options?.pulse,
    options?.stacking,
    options?.entryAnimation,
    options?.entryMs,
    options?.smoothMs,
    options?.curve,
    // A registry-name string diffs by value; a raw painter diffs by reference.
    options?.linePainter,
  ]);

  return null;
}

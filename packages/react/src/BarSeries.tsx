import { useEffect, useLayoutEffect, useRef } from 'react';

import {
  BarSeriesDef,
  type BarSeriesOptions,
  EMPTY_SYNC_STATE,
  type MultiLayerData,
  type SeriesSyncState,
  syncLayers,
  toLayers,
} from '@wick-charts/core';

import { useChartInstance } from './context';

export interface BarSeriesProps {
  /**
   * Series data — omnivorous. A single-layer bar chart passes a flat
   * `TimePoint[]`; a multi-layer one passes `TimePoint[][]`. To name/color a
   * layer, pass `{ label, color?, data }` (or an array of them). Time accepts
   * ms or `Date`.
   */
  data: MultiLayerData;
  /** Visual options override — colours per layer, bar-width ratio, stacking, entrance animation, smoothing. */
  options?: Partial<BarSeriesOptions>;
  /** Stable series ID — same value across remounts. */
  id?: string;
}

export function BarSeries({ data, options, id: idProp }: BarSeriesProps) {
  const chart = useChartInstance();
  const seriesRef = useRef<string | null>(null);
  const prevSyncRef = useRef<SeriesSyncState[]>([]);
  // A flat single-layer `data` has a point-count `length`; normalize first so
  // the series is recreated on layer-count change only, not on every append.
  const layerCount = toLayers(data).length;

  useLayoutEffect(() => {
    const id = chart.addSeries(BarSeriesDef, { ...options, layers: layerCount, id: idProp });
    seriesRef.current = id;
    prevSyncRef.current = new Array(layerCount).fill(EMPTY_SYNC_STATE);
    return () => {
      chart.removeSeries(id);
      seriesRef.current = null;
      prevSyncRef.current = [];
    };
  }, [chart, layerCount, idProp]);

  useLayoutEffect(() => {
    const id = seriesRef.current;
    if (!id) return;

    prevSyncRef.current = syncLayers({ chart, id, data, prev: prevSyncRef.current });
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

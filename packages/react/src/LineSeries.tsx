import { useEffect, useLayoutEffect, useRef } from 'react';

import {
  EMPTY_SYNC_STATE,
  LineSeriesDef,
  type LineSeriesOptions,
  type MultiLayerData,
  type SeriesSyncState,
  syncLayers,
  toLayers,
} from '@wick-charts/core';

import { useChartInstance } from './context';

export interface LineSeriesProps {
  /**
   * Series data — omnivorous. A single line passes a flat `TimePoint[]`; a
   * multi-layer line passes `TimePoint[][]`. To name/color a layer, pass
   * `{ label, color?, data }` (or an array of them). Time accepts ms or `Date`.
   */
  data: MultiLayerData;
  /** Visual options override — colours per layer, stroke width, area fill, stacking, entrance animation, smoothing. */
  options?: Partial<LineSeriesOptions>;
  /** Stable series ID — same value across remounts. */
  id?: string;
}

export function LineSeries({ data, options, id: idProp }: LineSeriesProps) {
  const chart = useChartInstance();
  const seriesRef = useRef<string | null>(null);
  const prevSyncRef = useRef<SeriesSyncState[]>([]);
  // A flat single-series `data` has a point-count `length`; normalize first so
  // the series is recreated on layer-count change only, not on every append.
  const layerCount = toLayers(data).length;

  useLayoutEffect(() => {
    const id = chart.addSeries(LineSeriesDef, { ...options, layers: layerCount, id: idProp });
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

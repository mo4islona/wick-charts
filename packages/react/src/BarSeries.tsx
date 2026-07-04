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
import { useLatestFn } from './use-latest-fn';
import { useStableOptions } from './use-stable-options';

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
  // The core reads the intro fn live, per frame — hand it a stable wrapper so
  // a non-memoized inline fn neither re-fires the option effect nor goes stale.
  const introAnimation = useLatestFn(options?.introAnimation);
  // Diff everything except `introAnimation` — its reference stability is
  // already handled by the latch above, and a fresh inline fn there must not
  // by itself count as a structural change (that's the whole point of the latch).
  const stableOptions = useStableOptions(options ? { ...options, introAnimation: undefined } : options);

  useLayoutEffect(() => {
    const id = chart.addSeries(BarSeriesDef, { ...options, introAnimation, layers: layerCount, id: idProp });
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
    if (seriesRef.current && stableOptions) {
      chart.updateSeriesOptions(seriesRef.current, { ...stableOptions, introAnimation });
    }
    // `stableOptions` only changes identity when its structural content
    // actually differs — a generic diff instead of a hand-maintained field list.
  }, [chart, stableOptions, introAnimation]);

  return null;
}

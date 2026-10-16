import { useEffect, useLayoutEffect, useRef } from 'react';

import {
  type BandData,
  BandSeriesDef,
  type BandSeriesOptions,
  EMPTY_SYNC_STATE,
  type SeriesSyncState,
  syncLayers,
  toLayers,
} from '@wick-charts/core';

import { useChartInstance } from './context';
import { useLatestFn } from './use-latest-fn';
import { useStableOptions } from './use-stable-options';

export interface BandSeriesProps {
  /**
   * Band data — one band per layer. A single band passes a flat
   * `{ time, low, high }[]`; several bands pass `BandPoint[][]`. To name/color
   * a band, pass `{ label, color?, data }` (or an array of them). Time accepts
   * ms or `Date`.
   */
  data: BandData;
  /** Visual options override — fill, edge stroke, curve, entrance / intro / smoothing. */
  options?: Partial<BandSeriesOptions>;
  /** Stable series ID — same value across remounts. */
  id?: string;
  /** Show/hide the series without unmounting it — excludes it from the Y-range fit and tooltip/legend. Default `true`. Live. */
  visible?: boolean;
  /** Named Y scale from the container's `scales` — autoscales on its own, sharing the time axis. Default: the default scale. Live. */
  scale?: string;
}

export function BandSeries({ data, options, id: idProp, visible, scale }: BandSeriesProps) {
  const chart = useChartInstance();
  const seriesRef = useRef<string | null>(null);
  const prevSyncRef = useRef<SeriesSyncState[]>([]);
  // Normalize first: a flat single band has a point-count `length`, so the
  // series is recreated on a band-count change only, not on every append.
  const layerCount = toLayers(data).length;
  // The core reads the intro fn live, per frame — a stable wrapper keeps a
  // non-memoized inline fn from re-firing the option effect or going stale.
  const introAnimation = useLatestFn(options?.introAnimation);
  const stableOptions = useStableOptions(options ? { ...options, introAnimation: undefined } : options);

  useLayoutEffect(() => {
    const id = chart.addSeries(BandSeriesDef, { ...options, scale, introAnimation, layers: layerCount, id: idProp });
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
    const id = seriesRef.current;
    if (!id) return;

    // `scale` rides the same update, so a stacking change is checked against the new scale.
    const update = stableOptions ? { ...stableOptions, introAnimation, scale } : { scale };
    chart.updateSeriesOptions(id, update);
  }, [chart, stableOptions, introAnimation, scale]);

  useEffect(() => {
    const id = seriesRef.current;
    if (!id) return;

    // `idProp` / `layerCount` re-apply the flag to a freshly recreated series,
    // which starts visible.
    chart.setSeriesVisible(id, visible ?? true);
  }, [chart, visible, idProp, layerCount]);

  return null;
}

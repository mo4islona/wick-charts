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
import { useLatestFn } from './use-latest-fn';
import { useStableOptions } from './use-stable-options';

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
  /** Show/hide the series without unmounting it — excludes it from the Y-range fit and tooltip/legend. Default `true`. Live. */
  visible?: boolean;
}

export function LineSeries({ data, options, id: idProp, visible }: LineSeriesProps) {
  const chart = useChartInstance();
  const seriesRef = useRef<string | null>(null);
  const prevSyncRef = useRef<SeriesSyncState[]>([]);
  // A flat single-series `data` has a point-count `length`; normalize first so
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
    const id = chart.addSeries(LineSeriesDef, { ...options, introAnimation, layers: layerCount, id: idProp });
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
    // actually differs, so this generic diff replaces a hand-maintained list
    // of individual option fields — a new option added to `LineSeriesOptions`
    // is covered automatically instead of silently failing to re-apply.
  }, [chart, stableOptions, introAnimation]);

  useEffect(() => {
    const id = seriesRef.current;
    if (!id) return;

    chart.setSeriesVisible(id, visible ?? true);
    // `idProp` and `layerCount` re-apply the flag against the freshly
    // (re)created series — either one remounts the series in the effect above,
    // which resets visibility to its default `true`, so a `visible={false}`
    // series would otherwise reappear when its data shape flips flat↔multi-layer.
  }, [chart, visible, idProp, layerCount]);

  return null;
}

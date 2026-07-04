import { useEffect, useLayoutEffect, useRef } from 'react';

import {
  type CandlestickData,
  CandlestickSeriesDef,
  type CandlestickSeriesOptions,
  EMPTY_SYNC_STATE,
  type OHLCInput,
  type SeriesSyncState,
  syncSeriesLayer,
  toLayers,
} from '@wick-charts/core';

import { useChartInstance } from './context';
import { useLatestFn } from './use-latest-fn';
import { useStableOptions } from './use-stable-options';

export interface CandlestickSeriesProps {
  /**
   * OHLC candles to render — a flat `OHLCInput[]`, or `{ label, data }` to name
   * the stream for the tooltip / info bar. Each candle carries
   * `time/open/high/low/close` and an optional `volume`.
   */
  data: CandlestickData;
  /** Visual options override — colours, body width, entrance animation, smoothing. Merged onto theme defaults. */
  options?: Partial<CandlestickSeriesOptions>;
  /** Stable series ID — same value across remounts. */
  id?: string;
  /** Show/hide the series without unmounting it — excludes it from the Y-range fit and tooltip/legend. Default `true`. Live. */
  visible?: boolean;
}

export function CandlestickSeries({ data, options, id: idProp, visible }: CandlestickSeriesProps) {
  const chart = useChartInstance();
  const seriesRef = useRef<string | null>(null);
  const prevSyncRef = useRef<SeriesSyncState>(EMPTY_SYNC_STATE);
  // Candlestick is single-stream — normalize the optional `{ label, data }`
  // wrapper down to its one layer.
  const layer = toLayers<OHLCInput>(data)[0];
  // The core reads the intro fn live, per frame — hand it a stable wrapper so
  // a non-memoized inline fn neither re-fires the option effect nor goes stale.
  const introAnimation = useLatestFn(options?.introAnimation);
  // Diff everything except `introAnimation` — its reference stability is
  // already handled by the latch above, and a fresh inline fn there must not
  // by itself count as a structural change (that's the whole point of the latch).
  const stableOptions = useStableOptions(options ? { ...options, introAnimation: undefined } : options);

  useLayoutEffect(() => {
    const id = chart.addSeries(CandlestickSeriesDef, { ...options, introAnimation, id: idProp, label: layer.label });
    seriesRef.current = id;
    return () => {
      chart.removeSeries(id);
      seriesRef.current = null;
      prevSyncRef.current = EMPTY_SYNC_STATE;
    };
  }, [chart, idProp]);

  useLayoutEffect(() => {
    const id = seriesRef.current;
    if (!id) return;

    chart.setSeriesLabels(id, [layer.label]);
    prevSyncRef.current = syncSeriesLayer({ chart, id, data: layer.data, prev: prevSyncRef.current });
  }, [chart, data]);

  useEffect(() => {
    if (seriesRef.current && stableOptions) {
      chart.updateSeriesOptions(seriesRef.current, { ...stableOptions, introAnimation });
    }
    // `stableOptions` diffs structurally, so a fresh `up.body` tuple ref (e.g.
    // from `autoGradient()`) with the same values no longer re-fires this —
    // no more manual `join(',')` collapse, and no field list to keep in sync.
  }, [chart, stableOptions, introAnimation]);

  useEffect(() => {
    const id = seriesRef.current;
    if (!id) return;

    chart.setSeriesVisible(id, visible ?? true);
    // `idProp` re-applies the flag against the freshly (re)created series —
    // an id change remounts the series in the effect above, which resets
    // visibility to its default.
  }, [chart, visible, idProp]);

  return null;
}

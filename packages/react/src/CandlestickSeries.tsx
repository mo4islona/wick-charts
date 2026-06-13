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
}

export function CandlestickSeries({ data, options, id: idProp }: CandlestickSeriesProps) {
  const chart = useChartInstance();
  const seriesRef = useRef<string | null>(null);
  const prevSyncRef = useRef<SeriesSyncState>(EMPTY_SYNC_STATE);
  // Candlestick is single-stream — normalize the optional `{ label, data }`
  // wrapper down to its one layer.
  const layer = toLayers<OHLCInput>(data)[0];

  useLayoutEffect(() => {
    const id = chart.addSeries(CandlestickSeriesDef, { ...options, id: idProp, label: layer.label });
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
    if (seriesRef.current && options) {
      chart.updateSeriesOptions(seriesRef.current, options);
    }
  }, [
    chart,
    // Tuple bodies are new array refs on every render (preset `autoGradient()`
    // output, inline literals, etc.) and would misfire `Object.is`. Collapse
    // to a stable string the same way BarSeries/LineSeries handle `colors`.
    Array.isArray(options?.up?.body) ? options.up.body.join(',') : options?.up?.body,
    Array.isArray(options?.down?.body) ? options.down.body.join(',') : options?.down?.body,
    options?.up?.wick,
    options?.down?.wick,
    options?.bodyWidthRatio,
    options?.entryAnimation,
    options?.entryMs,
    options?.smoothMs,
    options?.cornerRadius,
    // A registry-name string diffs by value; a raw painter diffs by reference.
    // Never run through `join` (it would stringify a function to undefined).
    options?.candlePainter,
  ]);

  return null;
}

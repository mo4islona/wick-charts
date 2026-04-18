import { useEffect, useLayoutEffect, useRef } from 'react';

import type { CandlestickSeriesOptions, OHLCInput } from '@wick-charts/core';
import { normalizeTime } from '@wick-charts/core';

import { useChartInstance } from './context';

export interface CandlestickSeriesProps {
  data: OHLCInput[];
  options?: Partial<CandlestickSeriesOptions>;
  /** Stable series ID. Prefer this over `onSeriesId` — same value across remounts. */
  id?: string;
  /** @deprecated Use the `id` prop instead. */
  onSeriesId?: (id: string) => void;
}

export function CandlestickSeries({ data, options, id: idProp, onSeriesId }: CandlestickSeriesProps) {
  const chart = useChartInstance();
  const seriesRef = useRef<string | null>(null);
  const prevLenRef = useRef(0);
  const prevFirstTimeRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    const id = chart.addCandlestickSeries({ ...options, id: idProp });
    seriesRef.current = id;
    onSeriesId?.(id);
    return () => {
      chart.removeSeries(id);
      seriesRef.current = null;
      prevLenRef.current = 0;
      prevFirstTimeRef.current = null;
    };
  }, [chart, idProp]);

  useLayoutEffect(() => {
    const id = seriesRef.current;
    if (!id) return;

    if (data.length === 0) {
      // Explicit clear
      chart.setSeriesData(id, []);
      prevLenRef.current = 0;
      prevFirstTimeRef.current = null;
      return;
    }

    const prevLen = prevLenRef.current;
    const firstTime = normalizeTime(data[0].time);
    // A capped rolling window (e.g. streaming with a maxPoints cap) shifts
    // the whole array by one on each new bar: length stays the same but the
    // first/last timestamps both move forward. Detect that and do a full
    // replace instead of a single in-place update, otherwise the store ends
    // up with stale bars in the middle and a single "future" bar at the tail.
    const shifted = prevFirstTimeRef.current !== null && prevFirstTimeRef.current !== firstTime;

    if (prevLen === 0 || data.length < prevLen || data.length - prevLen > 5 || shifted) {
      // First load, reset, batch, or rolling-window shift — full replace
      chart.setSeriesData(id, data);
    } else if (data.length === prevLen) {
      // Same length, same first timestamp — last candle updated in place
      chart.updateData(id, data[data.length - 1]);
    } else {
      // Small append (1-5 new candles)
      for (let i = prevLen; i < data.length; i++) {
        chart.appendData(id, data[i]);
      }
    }

    prevLenRef.current = data.length;
    prevFirstTimeRef.current = firstTime;
  }, [chart, data]);

  useEffect(() => {
    if (seriesRef.current && options) {
      chart.updateSeriesOptions(seriesRef.current, options);
    }
  }, [
    chart,
    options?.upColor,
    options?.downColor,
    options?.wickUpColor,
    options?.wickDownColor,
    options?.bodyWidthRatio,
    options?.candleGradient,
  ]);

  return null;
}

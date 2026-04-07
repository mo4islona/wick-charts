import { useEffect, useLayoutEffect, useRef } from 'react';

import type { CandlestickSeriesOptions, OHLCData } from '@wick-charts/core';

import { useChartInstance } from './context';

export interface CandlestickSeriesProps {
  data: OHLCData[];
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

  useLayoutEffect(() => {
    const id = chart.addCandlestickSeries({ ...options, id: idProp });
    seriesRef.current = id;
    onSeriesId?.(id);
    return () => {
      chart.removeSeries(id);
      seriesRef.current = null;
      prevLenRef.current = 0;
    };
  }, [chart, idProp]);

  useLayoutEffect(() => {
    const id = seriesRef.current;
    if (!id) return;

    if (data.length === 0) {
      // Explicit clear
      chart.setSeriesData(id, []);
      prevLenRef.current = 0;
      return;
    }

    const prevLen = prevLenRef.current;

    if (prevLen === 0 || data.length < prevLen || data.length - prevLen > 5) {
      // First load, reset, or batch — full replace
      chart.setSeriesData(id, data);
    } else if (data.length === prevLen) {
      // Same length — last candle updated
      chart.updateData(id, data[data.length - 1]);
    } else {
      // Small append (1-5 new candles)
      for (let i = prevLen; i < data.length; i++) {
        chart.appendData(id, data[i]);
      }
    }

    prevLenRef.current = data.length;
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

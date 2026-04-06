import { useEffect, useLayoutEffect, useRef } from 'react';

import type { CandlestickSeriesOptions, OHLCData } from '@wick-charts/core';

import { useChartInstance } from './context';

export interface CandlestickSeriesProps {
  data: OHLCData[];
  options?: Partial<CandlestickSeriesOptions>;
  onSeriesId?: (id: string) => void;
}

export function CandlestickSeries({ data, options, onSeriesId }: CandlestickSeriesProps) {
  const chart = useChartInstance();
  const seriesRef = useRef<string | null>(null);
  const prevLenRef = useRef(0);

  useLayoutEffect(() => {
    const id = chart.addCandlestickSeries(options);
    seriesRef.current = id;
    onSeriesId?.(id);
    return () => {
      chart.removeSeries(id);
      seriesRef.current = null;
      prevLenRef.current = 0;
    };
  }, [chart]);

  useLayoutEffect(() => {
    const id = seriesRef.current;
    if (!id || data.length === 0) return;

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

  return null;
}

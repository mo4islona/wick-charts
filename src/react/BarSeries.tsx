import { useEffect, useRef } from "react";
import type { BarSeriesOptions, LineData } from "../core/types";
import { useChartInstance } from "./context";

export interface BarSeriesProps {
  data: LineData[];
  options?: Partial<BarSeriesOptions>;
  onSeriesId?: (id: string) => void;
}

export function BarSeries({ data, options, onSeriesId }: BarSeriesProps) {
  const chart = useChartInstance();
  const seriesRef = useRef<string | null>(null);
  const prevLenRef = useRef(0);

  useEffect(() => {
    const id = chart.addBarSeries(options);
    seriesRef.current = id;
    onSeriesId?.(id);
    return () => {
      chart.removeSeries(id);
      seriesRef.current = null;
      prevLenRef.current = 0;
    };
  }, [chart]);

  useEffect(() => {
    if (seriesRef.current && options) {
      chart.updateSeriesOptions(seriesRef.current, options);
    }
  }, [chart, options?.positiveColor, options?.negativeColor, options?.barWidthRatio]);

  useEffect(() => {
    const id = seriesRef.current;
    if (!id || data.length === 0) return;

    const prevLen = prevLenRef.current;

    if (prevLen === 0 || data.length < prevLen || data.length - prevLen > 5) {
      chart.setSeriesData(id, data);
    } else if (data.length === prevLen) {
      chart.updateData(id, data[data.length - 1]);
    } else {
      for (let i = prevLen; i < data.length; i++) {
        chart.appendData(id, data[i]);
      }
    }

    prevLenRef.current = data.length;
  }, [chart, data]);

  return null;
}

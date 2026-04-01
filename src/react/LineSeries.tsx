import { useEffect, useRef } from "react";
import type { LineData, LineSeriesOptions } from "../core/types";
import { useChartInstance } from "./context";

export interface LineSeriesProps {
  data: LineData[];
  options?: Partial<LineSeriesOptions>;
  onSeriesId?: (id: string) => void;
}

export function LineSeries({ data, options, onSeriesId }: LineSeriesProps) {
  const chart = useChartInstance();
  const seriesRef = useRef<string | null>(null);
  const prevLenRef = useRef(0);

  useEffect(() => {
    const id = chart.addLineSeries(options);
    seriesRef.current = id;
    onSeriesId?.(id);
    return () => {
      chart.removeSeries(id);
      seriesRef.current = null;
      prevLenRef.current = 0;
    };
  }, [chart]);

  // Update options (color, lineWidth, etc.) when they change
  useEffect(() => {
    if (seriesRef.current && options) {
      chart.updateSeriesOptions(seriesRef.current, options);
    }
  }, [chart, options?.color, options?.lineWidth, options?.areaFill, options?.areaTopColor, options?.areaBottomColor]);

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

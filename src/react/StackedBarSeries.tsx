import { useEffect, useRef } from "react";
import type { LineData, StackedBarSeriesOptions } from "../core/types";
import { useChartInstance } from "./context";

export interface StackedBarSeriesProps {
  /** Array of datasets, one per layer */
  data: LineData[][];
  options?: Partial<StackedBarSeriesOptions>;
  onSeriesId?: (id: string) => void;
}

export function StackedBarSeries({ data, options, onSeriesId }: StackedBarSeriesProps) {
  const chart = useChartInstance();
  const seriesRef = useRef<string | null>(null);

  useEffect(() => {
    const id = chart.addStackedBarSeries(data.length, options);
    seriesRef.current = id;
    onSeriesId?.(id);
    return () => {
      chart.removeSeries(id);
      seriesRef.current = null;
    };
  }, [chart, data.length]);

  useEffect(() => {
    const id = seriesRef.current;
    if (!id) return;
    for (let i = 0; i < data.length; i++) {
      chart.setStackedBarData(id, i, data[i]);
    }
  }, [chart, data]);

  useEffect(() => {
    if (seriesRef.current && options) {
      chart.updateSeriesOptions(seriesRef.current, options);
    }
  }, [chart, options?.colors?.join(","), options?.barWidthRatio]);

  return null;
}

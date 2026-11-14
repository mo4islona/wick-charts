import { useEffect, useLayoutEffect, useRef } from 'react';

import {
  type HistogramData,
  HistogramSeriesDef,
  type HistogramSeriesOptions,
  type HistogramSyncState,
  syncHistogramLayers,
  toHistogramLayers,
} from '@wick-charts/core';

import { useChartInstance } from './context';
import { useStableOptions } from './use-stable-options';

export interface HistogramSeriesProps {
  /**
   * Series data — raw samples (`number[]`), binned by the series, or bins counted
   * already (`{ x0, x1, count }[]`). Several distributions overlay on the same bins:
   * pass an array of them, or `{ label, color?, data }` layers to name and color
   * them for the legend and tooltip. Needs `axis={{ x: { type: 'numeric' } }}`.
   */
  data: HistogramData;
  /** Binning, `normalize`, quantile lines, gap, opacity and animation timings. */
  options?: Partial<HistogramSeriesOptions>;
  /** Stable series ID — same value across remounts. */
  id?: string;
  /** Show/hide the series without unmounting it. Default `true`. Live. */
  visible?: boolean;
  /** Named Y scale from the container's `scales`. Default: the default scale. Live. */
  scale?: string;
}

export function HistogramSeries({ data, options, id: idProp, visible, scale }: HistogramSeriesProps) {
  const chart = useChartInstance();
  const seriesRef = useRef<string | null>(null);
  const prevSyncRef = useRef<HistogramSyncState[]>([]);
  // A flat sample list has a sample-count `length`; count layers, so the series is recreated on a layer change only.
  const layerCount = toHistogramLayers(data).length;
  const stableOptions = useStableOptions(options);

  useLayoutEffect(() => {
    const id = chart.addSeries(HistogramSeriesDef, { ...options, scale, layers: layerCount, id: idProp });
    seriesRef.current = id;
    prevSyncRef.current = [];

    return () => {
      chart.removeSeries(id);
      seriesRef.current = null;
      prevSyncRef.current = [];
    };
  }, [chart, layerCount, idProp]);

  useLayoutEffect(() => {
    const id = seriesRef.current;
    if (!id) return;

    prevSyncRef.current = syncHistogramLayers({ chart, id, data, prev: prevSyncRef.current });
    // A new `idProp` or layer count re-creates the series empty, so the data goes in again.
  }, [chart, data, idProp, layerCount]);

  useEffect(() => {
    const id = seriesRef.current;
    if (!id) return;

    chart.updateSeriesOptions(id, stableOptions ? { ...stableOptions, scale } : { scale });
  }, [chart, stableOptions, scale]);

  useEffect(() => {
    const id = seriesRef.current;
    if (!id) return;

    chart.setSeriesVisible(id, visible ?? true);
    // A remount (new `idProp` or layer count) resets visibility, so re-apply it.
  }, [chart, visible, idProp, layerCount]);

  return null;
}

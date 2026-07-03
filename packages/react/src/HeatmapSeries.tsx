import { useEffect, useLayoutEffect, useRef } from 'react';

import type { HeatmapCellData, HeatmapSeriesOptions } from '@wick-charts/core';
import { HeatmapSeriesDef } from '@wick-charts/core';

import { useChartInstance } from './context';

export interface HeatmapSeriesProps {
  /** Cells to render. A flat array of `{ x, y, value, color? }` entries. */
  data: HeatmapCellData[];
  /** Visual options override — ramp colors, gaps, labels, animation durations. */
  options?: Partial<HeatmapSeriesOptions>;
  /** Stable series ID — same value across remounts. */
  id?: string;
}

/**
 * Matrix heatmap series. Cells map `(x, y)` category keys onto a sequential
 * color ramp derived from the theme (override via `options.colors`).
 */
export function HeatmapSeries({ data, options, id: idProp }: HeatmapSeriesProps) {
  const chart = useChartInstance();
  const seriesRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    const id = chart.addSeries(HeatmapSeriesDef, { ...options, id: idProp });
    seriesRef.current = id;
    return () => {
      chart.removeSeries(id);
      seriesRef.current = null;
    };
  }, [chart, idProp]);

  // Array/object options are often rebuilt inline on every host render — key
  // the effect on their contents (joined keys / scalar subfields), not
  // identity, so unrelated parent re-renders don't force a chart repaint.
  const cellLabels = options?.cellLabels;
  const cellLabelsObj = typeof cellLabels === 'object' ? cellLabels : null;

  useEffect(() => {
    if (seriesRef.current && options) {
      chart.updateSeriesOptions(seriesRef.current, options);
    }
  }, [
    chart,
    options?.colors?.join('\u0000'),
    options?.min,
    options?.max,
    options?.gap,
    options?.cornerRadius,
    options?.axisLabels,
    cellLabelsObj ? true : cellLabels,
    cellLabelsObj?.fontSize,
    cellLabelsObj?.format,
    options?.columns?.join('\u0000'),
    options?.rows?.join('\u0000'),
    options?.entryMs,
    options?.updateMs,
  ]);

  // `idProp` is a dependency because an id change remounts the series in the
  // effect above — the fresh renderer starts empty and needs the data
  // re-applied even though the `data` reference didn't change.
  useLayoutEffect(() => {
    if (seriesRef.current) {
      chart.setSeriesData(seriesRef.current, data);
    }
  }, [chart, idProp, data]);

  return null;
}

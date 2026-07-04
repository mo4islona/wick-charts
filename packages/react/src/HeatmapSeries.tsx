import { useEffect, useLayoutEffect, useRef } from 'react';

import type { HeatmapCellData, HeatmapSeriesOptions } from '@wick-charts/core';
import { HeatmapSeriesDef } from '@wick-charts/core';

import { useChartInstance } from './context';
import { useStableOptions } from './use-stable-options';

export interface HeatmapSeriesProps {
  /** Cells to render. A flat array of `{ x, y, value, color? }` entries. */
  data: HeatmapCellData[];
  /** Visual options override — ramp colors, gaps, labels, animation durations. */
  options?: Partial<HeatmapSeriesOptions>;
  /** Stable series ID — same value across remounts. */
  id?: string;
  /** Show/hide the series without unmounting it — excludes it from the Y-range fit and tooltip/legend. Default `true`. Live. */
  visible?: boolean;
}

/**
 * Matrix heatmap series. Cells map `(x, y)` category keys onto a sequential
 * color ramp derived from the theme (override via `options.colors`).
 */
export function HeatmapSeries({ data, options, id: idProp, visible }: HeatmapSeriesProps) {
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

  const stableOptions = useStableOptions(options);

  useEffect(() => {
    if (seriesRef.current && stableOptions) {
      chart.updateSeriesOptions(seriesRef.current, stableOptions);
    }
    // `stableOptions` diffs structurally — a fresh `colors`/`columns`/`rows`
    // array ref with the same values no longer re-applies every render.
  }, [chart, stableOptions]);

  // `idProp` is a dependency because an id change remounts the series in the
  // effect above — the fresh renderer starts empty and needs the data
  // re-applied even though the `data` reference didn't change.
  useLayoutEffect(() => {
    if (seriesRef.current) {
      chart.setSeriesData(seriesRef.current, data);
    }
  }, [chart, idProp, data]);

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

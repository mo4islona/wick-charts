import { useEffect, useLayoutEffect, useRef } from 'react';

import type { PieSeriesOptions, PieSliceData } from '@wick-charts/core';
import { PieSeriesDef } from '@wick-charts/core';

import { useChartInstance } from './context';
import { useStableOptions } from './use-stable-options';

export interface PieSeriesProps {
  /** Slices to render. A flat array of `{ label, value, color? }` entries. */
  data: PieSliceData[];
  /** Visual options override — palette, donut hole, slice gap, label rendering, hover/entrance animations. */
  options?: Partial<PieSeriesOptions>;
  /** Stable series ID — same value across remounts. */
  id?: string;
}

/** Pie chart series. Set `options.innerRadiusRatio` > 0 for donut. */
export function PieSeries({ data, options, id: idProp }: PieSeriesProps) {
  const chart = useChartInstance();
  const seriesRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    const id = chart.addSeries(PieSeriesDef, { ...options, id: idProp });
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
    // `stableOptions` diffs structurally — a fresh `sliceLabels`/`colors`
    // object or array ref with the same values no longer re-applies every render.
  }, [chart, stableOptions]);

  useLayoutEffect(() => {
    if (seriesRef.current) {
      chart.setSeriesData(seriesRef.current, data);
    }
  }, [chart, data]);

  return null;
}

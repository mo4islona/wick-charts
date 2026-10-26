import { useEffect, useLayoutEffect, useRef } from 'react';

import type { PieSliceInput, RadialProgressSeriesOptions } from '@wick-charts/core';
import { RadialProgressSeriesDef } from '@wick-charts/core';

import { useChartInstance } from './context';
import { useStableOptions } from './use-stable-options';

export interface RadialProgressSeriesProps {
  /** One ring per entry, outermost first: `{ label, value, color? }`. `<PieLegend>` lists them. */
  data: PieSliceInput[];
  /** Visual options override — the value of a full ring, ring colors, track color, entry / update durations. */
  options?: Partial<RadialProgressSeriesOptions>;
  /** Stable series ID — same value across remounts. */
  id?: string;
  /** Show/hide the series without unmounting it — also hides it from `<PieLegend>`. Default `true`. Live. */
  visible?: boolean;
}

/**
 * Radial progress: concentric rings, each filled to its value's share of
 * `max`. New values glide from the ones on screen.
 */
export function RadialProgressSeries({ data, options, id: idProp, visible }: RadialProgressSeriesProps) {
  const chart = useChartInstance();
  const seriesRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    const id = chart.addSeries(RadialProgressSeriesDef, { ...options, id: idProp });
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
  }, [chart, stableOptions]);

  // `idProp` re-applies the rings to the series an id change re-created.
  useLayoutEffect(() => {
    if (seriesRef.current) {
      chart.setSeriesData(seriesRef.current, data);
    }
  }, [chart, idProp, data]);

  useEffect(() => {
    const id = seriesRef.current;
    if (!id) return;

    chart.setSeriesVisible(id, visible ?? true);
  }, [chart, visible, idProp]);

  return null;
}

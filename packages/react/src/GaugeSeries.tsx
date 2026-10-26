import { useEffect, useLayoutEffect, useRef } from 'react';

import type { GaugeSeriesOptions } from '@wick-charts/core';
import { GaugeSeriesDef } from '@wick-charts/core';

import { useChartInstance } from './context';
import { useStableOptions } from './use-stable-options';

export interface GaugeSeriesProps {
  /** The value to show. A value outside `min`…`max` clamps on the arc; the center label shows it as is. */
  value: number;
  /** Visual options override — range, angles, zones, arc or needle style, caption, value format, colors, entry / update durations. */
  options?: Partial<GaugeSeriesOptions>;
  /** Stable series ID — same value across remounts. */
  id?: string;
  /** Show/hide the series without unmounting it. Default `true`. Live. */
  visible?: boolean;
}

/**
 * Gauge: one value on an arc between `min` and `max`, with optional zones and
 * a center label. A new `value` glides from the one on screen.
 */
export function GaugeSeries({ value, options, id: idProp, visible }: GaugeSeriesProps) {
  const chart = useChartInstance();
  const seriesRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    const id = chart.addSeries(GaugeSeriesDef, { ...options, id: idProp });
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

  // `idProp` re-applies the value to the series an id change re-created.
  useLayoutEffect(() => {
    if (seriesRef.current) {
      chart.setSeriesData(seriesRef.current, value);
    }
  }, [chart, idProp, value]);

  useEffect(() => {
    const id = seriesRef.current;
    if (!id) return;

    chart.setSeriesVisible(id, visible ?? true);
  }, [chart, visible, idProp]);

  return null;
}

import { useEffect, useLayoutEffect, useRef } from 'react';

import type { RadarLayer, RadarSeriesOptions } from '@wick-charts/core';
import { RadarSeriesDef } from '@wick-charts/core';

import { useChartInstance } from './context';
import { useStableOptions } from './use-stable-options';

export interface RadarSeriesProps {
  /** Axis names, clockwise from `options.startAngle`. */
  axes: string[];
  /** One polygon per compared series: `{ label, data, color? }`, a value per axis. A kept `label` morphs to its new values. */
  data: RadarLayer[];
  /** Visual options override — scale, rings, grid shape, fill, dots, labels, hover, colors, entry / update durations. */
  options?: Partial<RadarSeriesOptions>;
  /** Stable series ID — same value across remounts. */
  id?: string;
  /** Show/hide the series without unmounting it. Default `true`. Live. */
  visible?: boolean;
}

/**
 * Radar: several series compared across the same axes on a shared scale, one
 * filled polygon each. `<Legend>` toggles the polygons, `<RadarTooltip>` lists
 * every axis value of the hovered one.
 */
export function RadarSeries({ axes, data, options, id: idProp, visible }: RadarSeriesProps) {
  const chart = useChartInstance();
  const seriesRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    const id = chart.addSeries(RadarSeriesDef, { ...options, id: idProp });
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

  // `idProp` re-applies the data to the series an id change re-created.
  useLayoutEffect(() => {
    if (seriesRef.current) {
      chart.setSeriesData(seriesRef.current, { axes, series: data });
    }
  }, [chart, idProp, axes, data]);

  useEffect(() => {
    const id = seriesRef.current;
    if (!id) return;

    chart.setSeriesVisible(id, visible ?? true);
  }, [chart, visible, idProp]);

  return null;
}

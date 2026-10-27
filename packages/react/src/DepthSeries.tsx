import { useEffect, useLayoutEffect, useRef } from 'react';

import type { DepthLevel, DepthSeriesOptions } from '@wick-charts/core';
import { DepthSeriesDef } from '@wick-charts/core';

import { useChartInstance } from './context';
import { useStableOptions } from './use-stable-options';

export interface DepthSeriesProps {
  /** Bid levels as `[price, size]`, in any order. Cumulative depth is computed from them. */
  bids: readonly DepthLevel[];
  /** Ask levels as `[price, size]`, in any order. Cumulative depth is computed from them. */
  asks: readonly DepthLevel[];
  /** Visual options override — `span` of the default view, side colors, stroke width, mid marker, fill fade, intro / update durations. */
  options?: Partial<DepthSeriesOptions>;
  /** Stable series ID — same value across remounts. */
  id?: string;
  /** Show/hide the series without unmounting it — excludes it from the Y-range fit and tooltip/legend. Default `true`. Live. */
  visible?: boolean;
}

/**
 * Order book chart: cumulative bid and ask size stepping away from the
 * mid price. Plots on a numeric X axis — set `axis={{ x: { type: 'numeric' } }}`
 * on the container. A new `bids` / `asks` array morphs the book on screen.
 */
export function DepthSeries({ bids, asks, options, id: idProp, visible }: DepthSeriesProps) {
  const chart = useChartInstance();
  const seriesRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    const id = chart.addSeries(DepthSeriesDef, { ...options, id: idProp });
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

  // `idProp` re-applies the book to the series an id change re-created.
  useLayoutEffect(() => {
    if (seriesRef.current) {
      chart.setSeriesData(seriesRef.current, { bids, asks });
    }
  }, [chart, idProp, bids, asks]);

  useEffect(() => {
    const id = seriesRef.current;
    if (!id) return;

    chart.setSeriesVisible(id, visible ?? true);
  }, [chart, visible, idProp]);

  return null;
}

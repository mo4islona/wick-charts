import { useEffect, useLayoutEffect, useRef } from 'react';

import type { SankeyLink, SankeyNode, SankeySeriesOptions } from '@wick-charts/core';
import { SankeySeriesDef } from '@wick-charts/core';

import { useChartInstance } from './context';
import { useStableOptions } from './use-stable-options';

export interface SankeySeriesProps {
  /** Stages of the flow. A node no link reaches is not drawn. */
  nodes: readonly SankeyNode[];
  /** Flows between nodes by `id`. Links must not form a cycle: on one the chart logs the error and keeps the previous graph. */
  links: readonly SankeyLink[];
  /** Visual options override — node colors, node width and gap, link opacity, labels, entry / update durations. */
  options?: Partial<SankeySeriesOptions>;
  /** Stable series ID — same value across remounts. */
  id?: string;
  /** Show/hide the series without unmounting it — excludes it from the tooltip. Default `true`. Live. */
  visible?: boolean;
}

/**
 * Sankey diagram: flows between stages drawn as bands whose width follows
 * the volume. A new `nodes` / `links` pair morphs the diagram on screen.
 */
export function SankeySeries({ nodes, links, options, id: idProp, visible }: SankeySeriesProps) {
  const chart = useChartInstance();
  const seriesRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    const id = chart.addSeries(SankeySeriesDef, { ...options, id: idProp });
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

  // `idProp` re-applies the graph to the series an id change re-created.
  useLayoutEffect(() => {
    if (!seriesRef.current) return;

    try {
      chart.setSeriesData(seriesRef.current, { nodes, links });
    } catch (error) {
      // A cycle: the core keeps the previous graph. Thrown from an effect, it would unmount the whole root.
      console.error(error);
    }
  }, [chart, idProp, nodes, links]);

  useEffect(() => {
    const id = seriesRef.current;
    if (!id) return;

    chart.setSeriesVisible(id, visible ?? true);
  }, [chart, visible, idProp]);

  return null;
}

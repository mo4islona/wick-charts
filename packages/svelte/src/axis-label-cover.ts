import type { ChartInstance } from '@wick-charts/core';

export interface AxisLabelCoverParams {
  chart: ChartInstance;
  /** Anything that changes when the element moves. */
  at: unknown;
}

/** `use:axisLabelCover={{ chart, at }}`: the axis tick labels under the element hide while it shows. */
export function axisLabelCover(node: HTMLElement, params: AxisLabelCoverParams): { update(): void; destroy(): void } {
  const cover = params.chart.coverAxisLabels(node);

  return { update: () => cover.update(), destroy: () => cover.remove() };
}

import { useCallback, useLayoutEffect, useRef } from 'react';

import type { AxisLabelCover, AxisLabelCoverOptions, ChartInstance } from '@wick-charts/core';

/** A callback ref that hides the axis tick labels under its element (`chart.coverAxisLabels`). */
export function useAxisLabelCover(
  chart: ChartInstance,
  options?: AxisLabelCoverOptions,
): (el: HTMLElement | null) => void {
  const cover = useRef<AxisLabelCover | null>(null);
  const fitColumn = options?.fitColumn === true;

  // No deps: a render can move the element and keep the same node.
  useLayoutEffect(() => {
    cover.current?.update();
  });

  return useCallback(
    (el: HTMLElement | null) => {
      cover.current?.remove();
      cover.current = el === null ? null : chart.coverAxisLabels(el, { fitColumn });
    },
    [chart, fitColumn],
  );
}

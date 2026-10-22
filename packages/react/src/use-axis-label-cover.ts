import { useCallback, useLayoutEffect, useRef } from 'react';

import type { AxisLabelCover, ChartInstance } from '@wick-charts/core';

/** A callback ref that hides the axis tick labels under its element (`chart.coverAxisLabels`). */
export function useAxisLabelCover(chart: ChartInstance): (el: HTMLElement | null) => void {
  const cover = useRef<AxisLabelCover | null>(null);

  // No deps: a render can move the element and keep the same node.
  useLayoutEffect(() => {
    cover.current?.update();
  });

  return useCallback(
    (el: HTMLElement | null) => {
      cover.current?.remove();
      cover.current = el === null ? null : chart.coverAxisLabels(el);
    },
    [chart],
  );
}

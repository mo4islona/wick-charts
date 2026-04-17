import { createContext, useContext } from 'react';

import type { ChartInstance } from '@wick-charts/core';

export const ChartContext = createContext<ChartInstance | null>(null);

export function useChartInstance(): ChartInstance {
  const chart = useContext(ChartContext);
  if (!chart) {
    throw new Error('useChartInstance must be used within <ChartContainer>');
  }
  return chart;
}

/**
 * True when a `<TooltipLegend>` sibling is mounted above the canvas. Read by
 * `<Tooltip>` so it can suppress its legacy absolute-positioned legend block
 * (the compact info bar lives in `<TooltipLegend>` then).
 */
export const TooltipLegendPresenceContext = createContext<boolean>(false);

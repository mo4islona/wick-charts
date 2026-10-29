import type { ChartInstance } from './chart';
import { formatLabelNumber } from './utils/format';

/**
 * Shared logic for the framework SankeyTooltip components (react / vue /
 * svelte), and the default value format the sankey node labels share.
 */

/** Tooltip box footprint used for edge-aware positioning. */
export const SANKEY_TOOLTIP_WIDTH = 190;
export const SANKEY_TOOLTIP_HEIGHT = 64;

/** Four significant digits, K / M / B / T from a thousand up: `16.8`, `4.212K`. */
export function defaultSankeyFormat(value: number): string {
  return formatLabelNumber(value);
}

/**
 * Resolve the series a SankeyTooltip binds to: the explicit id when given,
 * else the first visible sankey series, else `null`.
 */
export function resolveSankeySeriesId(chart: ChartInstance, explicit: string | undefined): string | null {
  if (explicit !== undefined) return explicit;

  const sankeys = chart.getSeriesIdsByType('sankey', { visibleOnly: true });

  return sankeys.length > 0 ? sankeys[0] : null;
}

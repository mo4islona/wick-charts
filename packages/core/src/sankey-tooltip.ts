import type { ChartInstance } from './chart';
import { formatCompact } from './utils/format';

/**
 * Shared logic for the framework SankeyTooltip components (react / vue /
 * svelte), and the default value format the sankey node labels share.
 */

/** Tooltip box footprint used for edge-aware positioning. */
export const SANKEY_TOOLTIP_WIDTH = 190;
export const SANKEY_TOOLTIP_HEIGHT = 64;

/** Flows are mostly counts: whole numbers print plain ("1240"), others compact ("0.45", "1.2K"). */
export function defaultSankeyFormat(value: number): string {
  return Number.isInteger(value) ? value.toString() : formatCompact(value);
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

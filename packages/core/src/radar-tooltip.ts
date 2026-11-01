import type { ChartInstance } from './chart';
import { formatLabelNumber } from './utils/format';

/** Shared logic for the framework RadarTooltip components (react / vue / svelte). */

/** Tooltip box footprint used for edge-aware positioning; the height grows with the axes. */
export const RADAR_TOOLTIP_WIDTH = 200;
export const RADAR_TOOLTIP_ROW_HEIGHT = 20;
export const RADAR_TOOLTIP_HEADER_HEIGHT = 44;

/** Four significant digits, K / M / B / T from a thousand up — the format of the ring values. */
export function defaultRadarFormat(value: number): string {
  return formatLabelNumber(value);
}

/** Height of a tooltip listing `rows` axes. */
export function radarTooltipHeight(rows: number): number {
  return RADAR_TOOLTIP_HEADER_HEIGHT + rows * RADAR_TOOLTIP_ROW_HEIGHT;
}

/**
 * Resolve the series a RadarTooltip binds to: the explicit id when given,
 * else the first visible radar series, else `null`.
 */
export function resolveRadarSeriesId(chart: ChartInstance, explicit: string | undefined): string | null {
  if (explicit !== undefined) return explicit;

  const radars = chart.getSeriesIdsByType('radar', { visibleOnly: true });

  return radars.length > 0 ? radars[0] : null;
}

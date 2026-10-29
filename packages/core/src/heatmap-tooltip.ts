import type { ChartInstance } from './chart';
import { formatLabelNumber } from './utils/format';

/**
 * Shared logic for the framework HeatmapTooltip components (react / vue /
 * svelte). One home instead of three copies — a formatting or resolution
 * tweak must not silently diverge across wrappers.
 */

/** Tooltip box footprint used for edge-aware positioning. */
export const HEATMAP_TOOLTIP_WIDTH = 170;
export const HEATMAP_TOOLTIP_HEIGHT = 78;

/**
 * Default cell-value formatter: four significant digits with no padded zeros
 * ("8", "0.45", "1.2K"). Heatmap cells are typically counts, so the
 * price-style "8.00" default reads wrong.
 */
export function defaultHeatmapFormat(value: number): string {
  return formatLabelNumber(value);
}

/**
 * Resolve the series a HeatmapTooltip binds to: the explicit id when given,
 * else the first visible heatmap series, else `null`.
 */
export function resolveHeatmapSeriesId(chart: ChartInstance, explicit: string | undefined): string | null {
  if (explicit !== undefined) return explicit;

  const heatmaps = chart.getSeriesIdsByType('heatmap', { visibleOnly: true });

  return heatmaps.length > 0 ? heatmaps[0] : null;
}

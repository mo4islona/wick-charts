<script lang="ts">
import type { CrosshairPosition, HoverInfo, ValueFormatter } from '@wick-charts/core';
import {
  HEATMAP_TOOLTIP_HEIGHT,
  HEATMAP_TOOLTIP_WIDTH,
  computeTooltipPosition,
  defaultHeatmapFormat,
  resolveHeatmapSeriesId,
} from '@wick-charts/core';
import { onDestroy } from 'svelte';

import { getChartContext } from '../context';
import { createCrosshairPosition } from '../stores';

/**
 * Owning series id. **Optional** — when omitted, the first visible heatmap
 * series is picked.
 */
export let seriesId: string | undefined = undefined;
/** Custom formatter for the cell value. Default: plain integers, compact decimals. */
export let format: ValueFormatter = defaultHeatmapFormat;

const chartStore = getChartContext();
let crosshair: CrosshairPosition | null = null;
let crosshairUnsub: (() => void) | null = null;

let bump = 0;
let overlayUnsub: (() => void) | null = null;

$: {
  const c = $chartStore;
  if (c && !crosshairUnsub) {
    const posStore = createCrosshairPosition(c);
    crosshairUnsub = posStore.subscribe((v) => {
      crosshair = v;
    });
  }
  if (c && !overlayUnsub) {
    const handler = () => {
      bump++;
    };
    c.on('overlayChange', handler);
    overlayUnsub = () => c.off('overlayChange', handler);
  }
}

onDestroy(() => {
  crosshairUnsub?.();
  overlayUnsub?.();
});

$: chart = $chartStore;
// `setTheme` fires `overlayChange`; reading `bump` keeps `theme` live across
// runtime theme swaps instead of freezing on the first-render snapshot.
$: theme = chart && bump >= 0 ? chart.getTheme() : null;
$: resolvedId = chart && bump >= 0 ? resolveHeatmapSeriesId(chart, seriesId) : null;

// Hover-index changes don't emit `overlayChange` — depend on `crosshair` so
// the info re-reads as the pointer moves between cells (mirrors the Vue
// tooltip's `void crosshair.value`).
let info: HoverInfo | null = null;
$: {
  void crosshair;
  info = chart && resolvedId !== null && bump >= 0 ? chart.getHoverInfo(resolvedId) : null;
}
$: mediaSize = chart?.getMediaSize();
$: meterWidth = info ? Math.max(2, Math.min(100, info.percent)) : 0;

$: tooltipPos =
  crosshair && mediaSize
    ? computeTooltipPosition({
        x: crosshair.mediaX,
        y: crosshair.mediaY,
        chartWidth: mediaSize.width,
        chartHeight: mediaSize.height,
        tooltipWidth: HEATMAP_TOOLTIP_WIDTH,
        tooltipHeight: HEATMAP_TOOLTIP_HEIGHT,
        offsetX: 16,
        offsetY: 16,
      })
    : { left: 0, top: 0 };
</script>

{#if info && crosshair && theme && mediaSize}
  <div
    style="position:absolute;left:{tooltipPos.left}px;top:{tooltipPos.top}px;pointer-events:none;background:{theme
      .tooltip
      .background};backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:1px solid {theme.tooltip
      .borderColor};border-radius:8px;padding:10px 14px;box-shadow:0 4px 16px rgba(0,0,0,0.1), 0 1px 4px rgba(0,0,0,0.06);font-size:{theme
      .typography.fontSize}px;font-family:{theme.typography.fontFamily};color:{theme.tooltip
      .textColor};z-index:10;display:flex;flex-direction:column;gap:6px;min-width:120px;"
  >
    <div style="display:flex;align-items:center;gap:8px;">
      <span style="width:10px;height:10px;border-radius:3px;background:{info.color};flex-shrink:0;" />
      <span style="font-weight:600;">{info.label}</span>
      <span style="margin-left:auto;font-weight:600;">{format(info.value)}</span>
    </div>
    <div style="position:relative;height:4px;border-radius:2px;background:{theme.tooltip.borderColor};overflow:hidden;">
      <div style="position:absolute;inset:0;width:{meterWidth}%;border-radius:2px;background:{info.color};" />
    </div>
  </div>
{/if}

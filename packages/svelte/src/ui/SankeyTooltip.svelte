<script lang="ts">
import type { CrosshairPosition, HoverInfo, ValueFormatter } from '@wick-charts/core';
import {
  SANKEY_TOOLTIP_HEIGHT,
  SANKEY_TOOLTIP_WIDTH,
  computeTooltipPosition,
  defaultSankeyFormat,
  resolveSankeySeriesId,
} from '@wick-charts/core';
import { onDestroy } from 'svelte';

import { getChartContext } from '../context.js';
import { createCrosshairPosition } from '../stores.js';

/**
 * Owning series id. **Optional** — when omitted, the first visible sankey
 * series is picked.
 */
export let seriesId: string | undefined = undefined;
/** Custom formatter for the flow value. Default: plain integers, compact decimals. */
export let format: ValueFormatter = defaultSankeyFormat;

// biome-ignore lint/correctness/noUnusedVariables: svelte2tsx reads it; the slot renders only while a node or link is hovered, so `info` is never null there
interface $$Slots {
  default: { info: HoverInfo; format: ValueFormatter };
}

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
$: resolvedId = chart && bump >= 0 ? resolveSankeySeriesId(chart, seriesId) : null;

// `crosshair` sits in the condition: the TS preprocessor drops a bare `void crosshair;`, and the dependency with it.
let info: HoverInfo | null = null;
$: info = chart && crosshair && resolvedId !== null && bump >= 0 ? chart.getHoverInfo(resolvedId) : null;
// A stale size would clamp the tooltip to the wrong side after a container resize.
let mediaSize: { width: number; height: number } | undefined;
$: mediaSize = chart && crosshair && bump >= 0 ? chart.getMediaSize() : undefined;

// Slot content has unknown dimensions: observe the container, then position it once measured.
let measuredSize: { width: number; height: number } | null = null;

function measureOnResize(node: HTMLDivElement) {
  if (typeof ResizeObserver === 'undefined') return { destroy() {} };

  const ro = new ResizeObserver(() => {
    // `contentRect` leaves out the padding and border, so read the border box from the node.
    const box = { width: node.offsetWidth, height: node.offsetHeight };
    if (box.width === 0) return;
    if (!measuredSize || measuredSize.width !== box.width || measuredSize.height !== box.height) {
      measuredSize = { width: box.width, height: box.height };
    }
  });
  ro.observe(node);

  return {
    destroy() {
      ro.disconnect();
      // The next hover starts hidden until measured rather than reusing this size for a frame.
      measuredSize = null;
    },
  };
}

$: tooltipPos = (() => {
  if (!crosshair || !mediaSize) return { left: 0, top: 0 };

  let size = { width: SANKEY_TOOLTIP_WIDTH, height: SANKEY_TOOLTIP_HEIGHT };
  if ($$slots.default) {
    if (!measuredSize) return { left: 0, top: 0 };

    size = measuredSize;
  }

  return computeTooltipPosition({
    x: crosshair.mediaX,
    y: crosshair.mediaY,
    chartWidth: mediaSize.width,
    chartHeight: mediaSize.height,
    tooltipWidth: size.width,
    tooltipHeight: size.height,
    offsetX: 16,
    offsetY: 16,
  });
})();
</script>

{#if info && crosshair && theme && mediaSize}
  {#if $$slots.default}
    <div
      use:measureOnResize
      data-measured={measuredSize ? 'true' : 'false'}
      style="position:absolute;left:{tooltipPos.left}px;top:{tooltipPos.top}px;pointer-events:none;background:{theme.tooltip.background};backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:1px solid {theme.tooltip.borderColor};border-radius:8px;padding:10px 14px;box-shadow:0 4px 16px rgba(0,0,0,0.1), 0 1px 4px rgba(0,0,0,0.06);font-family:{theme.typography.fontFamily};font-size:{theme.typography.fontSize}px;color:{theme.tooltip.textColor};z-index:10;width:max-content;max-width:{mediaSize.width}px;box-sizing:border-box;visibility:{measuredSize
        ? 'visible'
        : 'hidden'};"
    >
      <slot {info} {format} />
    </div>
  {:else}
    <div
      style="position:absolute;left:{tooltipPos.left}px;top:{tooltipPos.top}px;pointer-events:none;background:{theme.tooltip.background};backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:1px solid {theme.tooltip.borderColor};border-radius:8px;padding:10px 14px;box-shadow:0 4px 16px rgba(0,0,0,0.1), 0 1px 4px rgba(0,0,0,0.06);font-size:{theme.typography.fontSize}px;font-family:{theme.typography.fontFamily};color:{theme.tooltip.textColor};z-index:10;display:flex;flex-direction:column;gap:6px;min-width:120px;"
    >
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="width:10px;height:10px;border-radius:3px;background:{info.color};flex-shrink:0;"></span>
        <span style="font-weight:600;">{info.label}</span>
      </div>
      <div style="display:flex;justify-content:space-between;gap:16px;">
        <span style="font-weight:600;">{format(info.value)}</span>
        <span style="opacity:0.6;">{info.percent.toFixed(1)}%</span>
      </div>
    </div>
  {/if}
{/if}

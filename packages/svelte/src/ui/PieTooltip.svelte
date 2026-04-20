<script lang="ts">
import type { ChartInstance, CrosshairPosition, HoverInfo, ValueFormatter } from '@wick-charts/core';
import { computeTooltipPosition, formatCompact } from '@wick-charts/core';
import { onDestroy } from 'svelte';

import { getChartContext } from '../context';
import { createCrosshairPosition } from '../stores';

const DEFAULT_TOOLTIP_WIDTH = 160;
const DEFAULT_TOOLTIP_HEIGHT = 70;

/**
 * Owning series id. **Optional** — when omitted, the first visible pie
 * series is picked.
 */
export let seriesId: string | undefined = undefined;
/** Custom formatter for the slice value. Default: shared `formatCompact`. */
export let format: ValueFormatter = formatCompact;

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

function resolvePieSeriesId(c: ChartInstance, explicit: string | undefined): string | null {
  if (explicit !== undefined) return explicit;

  const pies = c.getSeriesIdsByType('pie', { visibleOnly: true });

  return pies.length > 0 ? pies[0] : null;
}

$: chart = $chartStore;
// `setTheme` fires `overlayChange`; reading `bump` keeps `theme` live across
// runtime theme swaps instead of freezing on the first-render snapshot.
$: theme = chart && bump >= 0 ? chart.getTheme() : null;
$: resolvedId = chart && bump >= 0 ? resolvePieSeriesId(chart, seriesId) : null;
$: info = chart && resolvedId !== null && bump >= 0 ? chart.getHoverInfo(resolvedId) : (null as HoverInfo | null);
$: mediaSize = chart?.getMediaSize();

// Custom-slot measurement — unknown content dimensions mean we can't
// pre-compute `tooltipWidth/Height`. Observe the container, then recompute
// the position once measured so user-rendered tooltips flip/clamp correctly
// instead of overflowing with the hardcoded 160×70 defaults.
let measuredSize: { width: number; height: number } | null = null;

function measureOnResize(node: HTMLDivElement) {
  if (typeof ResizeObserver === 'undefined') return { destroy() {} };

  const ro = new ResizeObserver((entries) => {
    const box = entries[0]?.contentRect;
    if (!box) return;
    if (!measuredSize || measuredSize.width !== box.width || measuredSize.height !== box.height) {
      measuredSize = { width: box.width, height: box.height };
    }
  });
  ro.observe(node);

  return {
    destroy() {
      ro.disconnect();
      // Reset so the next hover starts hidden-until-measured rather than
      // reusing the previous size for one frame.
      measuredSize = null;
    },
  };
}

$: tooltipPos = (() => {
  if (!crosshair || !mediaSize) return { left: 0, top: 0 };

  // Slot path: wait for the first ResizeObserver callback before computing
  // the real position. Render at (0,0) hidden until measured.
  if ($$slots.default) {
    if (!measuredSize) return { left: 0, top: 0 };

    return computeTooltipPosition({
      x: crosshair.mediaX,
      y: crosshair.mediaY,
      chartWidth: mediaSize.width,
      chartHeight: mediaSize.height,
      tooltipWidth: measuredSize.width,
      tooltipHeight: measuredSize.height,
      offsetX: 16,
      offsetY: 16,
    });
  }

  return computeTooltipPosition({
    x: crosshair.mediaX,
    y: crosshair.mediaY,
    chartWidth: mediaSize.width,
    chartHeight: mediaSize.height,
    tooltipWidth: DEFAULT_TOOLTIP_WIDTH,
    tooltipHeight: DEFAULT_TOOLTIP_HEIGHT,
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
      style="position:absolute;left:{tooltipPos.left}px;top:{tooltipPos.top}px;pointer-events:none;z-index:10;width:max-content;max-width:{mediaSize.width}px;box-sizing:border-box;visibility:{measuredSize
        ? 'visible'
        : 'hidden'};"
    >
      <slot {info} {format} />
    </div>
  {:else}
    <div
      style="position:absolute;left:{tooltipPos.left}px;top:{tooltipPos.top}px;pointer-events:none;background:{theme.tooltip.background};backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:1px solid {theme.tooltip.borderColor};border-radius:8px;padding:10px 14px;box-shadow:0 4px 16px rgba(0,0,0,0.1), 0 1px 4px rgba(0,0,0,0.06);font-size:{theme.typography.fontSize}px;font-family:{theme.typography.fontFamily};color:{theme.tooltip.textColor};z-index:10;display:flex;flex-direction:column;gap:6px;"
    >
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="width:10px;height:10px;border-radius:50%;background:{info.color};flex-shrink:0;" />
        <span style="font-weight:600;">{info.label}</span>
      </div>
      <div style="display:flex;justify-content:space-between;gap:16px;">
        <span style="opacity:0.6;">{format(info.value)}</span>
        <span style="font-weight:600;">{info.percent.toFixed(1)}%</span>
      </div>
    </div>
  {/if}
{/if}

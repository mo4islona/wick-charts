<script lang="ts">
import type { ChartInstance, CrosshairPosition } from '@wick-charts/core';
import { onDestroy } from 'svelte';

import { getChartContext } from '../context';
import { createCrosshairPosition } from '../stores';

const chartStore = getChartContext();
let position: CrosshairPosition | null = null;
let unsubscribe: (() => void) | null = null;

// `setTheme` fires `overlayChange`; reading `bump` in the theme reactive
// keeps label colors live across runtime theme swaps instead of freezing on
// the first-render snapshot (matches Tooltip/PieTooltip).
let bump = 0;
let overlayUnsub: (() => void) | null = null;

// `_position` is referenced only so the `$:` statement re-runs on crosshair
// move (a wheel-zoom re-emits it), re-reading the live data interval + range.
function resolveTickInterval(c: ChartInstance | null, _position: CrosshairPosition | null): number {
  if (!c) return 86400;

  const di = c.getDataInterval();

  return c.timeScale.niceTickValues(di).tickInterval || di;
}

$: {
  const chart = $chartStore;
  if (chart && !unsubscribe) {
    const posStore = createCrosshairPosition(chart);
    unsubscribe = posStore.subscribe((v) => {
      position = v;
    });
  }
  if (chart && !overlayUnsub) {
    const handler = () => {
      bump++;
    };
    chart.on('overlayChange', handler);
    overlayUnsub = () => chart.off('overlayChange', handler);
  }
}

onDestroy(() => {
  unsubscribe?.();
  overlayUnsub?.();
});

$: chart = $chartStore;
$: theme = chart && bump >= 0 ? chart.getTheme() : null;
// Format the time pill at the axis's *resolved* tick granularity, not the raw
// data interval — otherwise a time-of-day badge floats among date labels when
// zoomed out. Resolve fresh on each crosshair move: the raw data interval
// isn't known until data loads (the chart ref doesn't change then, so an eager
// `$:` would freeze the pre-data default), and `niceTickValues` reads the live
// visible range (which a wheel-zoom re-emits the crosshair for) — matching
// React, which recomputes this on every render.
$: tickInterval = resolveTickInterval(chart, position);

// `zIndex:2` sits above axis ticks (z:0) but below the YLabel badge
// (z:3), so the live last-value stays visible when the crosshair crosses
// its row. `color-mix(...80%, transparent)` blends the solid theme color
// with 20% transparency so the axis grid shows through.
$: labelStyle = theme
  ? `background:color-mix(in srgb, ${theme.crosshair.labelBackground} 80%, transparent);color:${theme.crosshair.labelTextColor};font-size:${theme.axis.fontSize}px;font-family:${theme.typography.fontFamily};font-variant-numeric:tabular-nums;padding:2px 6px;border-radius:2px;white-space:nowrap;pointer-events:none;z-index:2;`
  : '';
</script>

{#if position && chart && theme}
  <!-- Y label on right axis -->
  <div style="position:absolute;right:0;top:{position.mediaY}px;transform:translateY(-50%);{labelStyle}">
    {chart.yScale.formatY(position.y)}
  </div>
  <!-- Time label on bottom axis -->
  <div style="position:absolute;bottom:0;left:{position.mediaX}px;transform:translateX(-50%);{labelStyle}">
    {chart.timeScale.formatX(position.time, tickInterval)}
  </div>
{/if}

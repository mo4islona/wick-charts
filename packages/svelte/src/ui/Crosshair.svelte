<script lang="ts">
  import type { CrosshairPosition } from '@wick-charts/core';
  import { formatTime } from '@wick-charts/core';
  import { onDestroy } from 'svelte';

  import { getChartContext } from '../context';
  import { createCrosshairPosition } from '../stores';

  const chartStore = getChartContext();
  let position: CrosshairPosition | null = null;
  let unsubscribe: (() => void) | null = null;

  $: {
    const chart = $chartStore;
    if (chart && !unsubscribe) {
      const posStore = createCrosshairPosition(chart);
      unsubscribe = posStore.subscribe((v) => {
        position = v;
      });
    }
  }

  onDestroy(() => {
    unsubscribe?.();
  });

  $: chart = $chartStore;
  $: theme = chart?.getTheme();
  $: dataInterval = chart?.getDataInterval() ?? 86400;

  // `zIndex:2` sits above axis ticks (z:0) but below the YLabel badge
  // (z:3), so the live last-value stays visible when the crosshair crosses
  // its row. `color-mix(...80%, transparent)` blends the solid theme color
  // with 20% transparency so the axis grid shows through.
  $: labelStyle = theme
    ? `background:color-mix(in srgb, ${theme.crosshair.labelBackground} 80%, transparent);color:${theme.crosshair.labelTextColor};font-size:${theme.typography.axisFontSize}px;font-family:${theme.typography.fontFamily};font-variant-numeric:tabular-nums;padding:2px 6px;border-radius:2px;white-space:nowrap;pointer-events:none;z-index:2;`
    : '';
</script>

{#if position && chart && theme}
  <!-- Y label on right axis -->
  <div style="position:absolute;right:0;top:{position.mediaY}px;transform:translateY(-50%);{labelStyle}">
    {chart.yScale.formatY(position.y)}
  </div>
  <!-- Time label on bottom axis -->
  <div style="position:absolute;bottom:0;left:{position.mediaX}px;transform:translateX(-50%);{labelStyle}">
    {formatTime(position.time, dataInterval)}
  </div>
{/if}

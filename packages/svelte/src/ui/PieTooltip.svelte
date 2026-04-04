<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { ChartInstance, CrosshairPosition } from '@wick-charts/core';
  import { getChartContext } from '../context';
  import { createCrosshairPosition } from '../stores';

  export let seriesId: string;

  const chartStore = getChartContext();
  let crosshair: CrosshairPosition | null = null;
  let crosshairUnsub: (() => void) | null = null;

  $: {
    const chart = $chartStore;
    if (chart && !crosshairUnsub) {
      const posStore = createCrosshairPosition(chart);
      crosshairUnsub = posStore.subscribe((v) => {
        crosshair = v;
      });
    }
  }

  onDestroy(() => {
    crosshairUnsub?.();
  });

  $: chart = $chartStore;
  $: theme = chart?.getTheme();
  $: info = chart ? chart.getPieHoverInfo(seriesId) : null;
  $: mediaSize = chart?.getMediaSize();

  $: tooltipPos = (() => {
    if (!crosshair || !mediaSize) return { left: 0, top: 0 };
    const tooltipWidth = 160;
    const tooltipHeight = 70;
    const offsetX = 16;
    const offsetY = 16;

    const left =
      crosshair.mediaX + offsetX + tooltipWidth > mediaSize.width
        ? crosshair.mediaX - offsetX - tooltipWidth
        : crosshair.mediaX + offsetX;
    const top =
      crosshair.mediaY + offsetY + tooltipHeight > mediaSize.height
        ? crosshair.mediaY - offsetY - tooltipHeight
        : crosshair.mediaY + offsetY;

    return { left, top };
  })();
</script>

{#if info && crosshair && theme}
  <div
    style="position:absolute;left:{tooltipPos.left}px;top:{tooltipPos.top}px;pointer-events:none;background:{theme.tooltip.background};backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:1px solid {theme.tooltip.borderColor};border-radius:8px;padding:10px 14px;box-shadow:0 4px 16px rgba(0,0,0,0.1), 0 1px 4px rgba(0,0,0,0.06);font-size:{theme.typography.fontSize}px;font-family:{theme.typography.fontFamily};color:{theme.tooltip.textColor};z-index:10;display:flex;flex-direction:column;gap:6px;"
  >
    <!-- Label row -->
    <div style="display:flex;align-items:center;gap:8px;">
      <span
        style="width:10px;height:10px;border-radius:50%;background:{info.color};flex-shrink:0;"
      />
      <span style="font-weight:600;">{info.label}</span>
    </div>
    <!-- Value + percent -->
    <div style="display:flex;justify-content:space-between;gap:16px;">
      <span style="opacity:0.6;">{info.value.toLocaleString()}</span>
      <span style="font-weight:600;">{info.percent.toFixed(1)}%</span>
    </div>
  </div>
{/if}

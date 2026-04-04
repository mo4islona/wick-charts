<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { ChartInstance } from '@wick-charts/core';
  import { getChartContext } from '../context';
  import { createYRange } from '../stores';

  interface TrackedTick {
    opacity: number;
    addedAt: number;
  }

  const chartStore = getChartContext();
  const tickMap = new Map<number, TrackedTick>();

  let yRangeUnsub: (() => void) | null = null;
  let allTicks: [number, TrackedTick][] = [];

  $: {
    const chart = $chartStore;
    if (chart && !yRangeUnsub) {
      const yRangeStore = createYRange(chart);
      yRangeUnsub = yRangeStore.subscribe(() => {
        updateTicks(chart);
      });
    }
  }

  function updateTicks(chart: ChartInstance) {
    const currentTicks = chart.yScale.niceTickValues();
    const currentSet = new Set(currentTicks);
    const now = performance.now();

    for (const p of currentTicks) {
      if (!tickMap.has(p)) {
        tickMap.set(p, { opacity: 1, addedAt: now });
      } else {
        tickMap.get(p)!.opacity = 1;
      }
    }

    for (const [p, entry] of tickMap) {
      if (!currentSet.has(p)) {
        entry.opacity = 0;
      }
    }

    for (const [p, entry] of tickMap) {
      if (entry.opacity === 0 && now - entry.addedAt > 5000) {
        tickMap.delete(p);
      }
    }

    allTicks = Array.from(tickMap.entries());
  }

  onDestroy(() => {
    yRangeUnsub?.();
  });

  $: chart = $chartStore;
  $: theme = chart?.getTheme();
</script>

{#if chart && theme}
  <div
    style="position:absolute;right:0;top:0;bottom:{chart.xAxisHeight}px;width:{chart.yAxisWidth}px;pointer-events:none;"
  >
    {#each allTicks as [price, entry] (price)}
      <span
        style="position:absolute;right:8px;top:{chart.yScale.valueToY(price)}px;transform:translateY(-50%);color:{theme.axis.textColor};font-size:{theme.typography.axisFontSize}px;font-family:{theme.typography.fontFamily};font-variant-numeric:tabular-nums;user-select:none;opacity:{entry.opacity};transition:opacity 0.3s ease;will-change:opacity;"
      >
        {chart.yScale.formatY(price)}
      </span>
    {/each}
  </div>
{/if}

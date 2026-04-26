<script lang="ts">
import type { ChartInstance } from '@wick-charts/core';
import { formatTime, resolveAxisFontSize, resolveAxisTextColor } from '@wick-charts/core';
import { onDestroy } from 'svelte';

import { getChartContext } from '../context';
import { createVisibleRange } from '../stores';

interface TrackedTick {
  opacity: number;
  addedAt: number;
}

const chartStore = getChartContext();
const tickMap = new Map<number, TrackedTick>();

let visibleRangeUnsub: (() => void) | null = null;
let allTicks: [number, TrackedTick][] = [];
let tickInterval: number = 86400;

$: {
  const chart = $chartStore;
  if (chart && !visibleRangeUnsub) {
    const visibleRangeStore = createVisibleRange(chart);
    visibleRangeUnsub = visibleRangeStore.subscribe(() => {
      updateTicks(chart);
    });
  }
}

function updateTicks(chart: ChartInstance) {
  const dataInterval = chart.getDataInterval();
  const result = chart.timeScale.niceTickValues(dataInterval);
  const currentTicks = result.ticks;
  tickInterval = result.tickInterval;
  const currentSet = new Set(currentTicks);
  const now = performance.now();

  for (const t of currentTicks) {
    if (!tickMap.has(t)) {
      tickMap.set(t, { opacity: 1, addedAt: now });
    } else {
      tickMap.get(t)!.opacity = 1;
    }
  }

  for (const [t, entry] of tickMap) {
    if (!currentSet.has(t)) {
      entry.opacity = 0;
    }
  }

  for (const [t, entry] of tickMap) {
    if (entry.opacity === 0 && now - entry.addedAt > 5000) {
      tickMap.delete(t);
    }
  }

  allTicks = Array.from(tickMap.entries());
}

onDestroy(() => {
  visibleRangeUnsub?.();
});

$: chart = $chartStore;
$: theme = chart?.getTheme();
</script>

{#if chart && theme}
  <div
    style="position:absolute;left:0;bottom:0;right:{chart.yAxisWidth}px;height:{chart.xAxisHeight}px;pointer-events:none;display:flex;align-items:center;"
  >
    {#each allTicks as [time, entry] (time)}
      <span
        style="position:absolute;left:0;top:0;transform:translate3d({chart.timeScale.timeToX(time)}px, 0, 0) translateX(-50%);color:{resolveAxisTextColor(theme, 'x')};font-size:{resolveAxisFontSize(theme, 'x')}px;font-family:{theme.typography.fontFamily};user-select:none;white-space:nowrap;opacity:{entry.opacity};transition:opacity 0.3s ease;will-change:transform, opacity;"
      >
        {formatTime(time, tickInterval)}
      </span>
    {/each}
  </div>
{/if}

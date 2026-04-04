<script lang="ts">
import type { ChartInstance } from '@wick-charts/core';
import { onDestroy, onMount } from 'svelte';
import { get } from 'svelte/store';

import { getChartContext } from '../context';
import { createLastYValue, createPreviousClose } from '../stores';
import NumberFlow from './NumberFlow.svelte';

export let seriesId: string;
export let color: string | undefined = undefined;

const chartStore = getChartContext();
let lastY: { value: number; isLive: boolean } | null = null;
let previousClose: number | null = null;
let lastYUnsub: (() => void) | null = null;
let previousCloseUnsub: (() => void) | null = null;

$: {
  const chart = $chartStore;
  if (chart && !lastYUnsub) {
    const lpStore = createLastYValue(chart, seriesId);
    lastYUnsub = lpStore.subscribe((v) => {
      lastY = v;
    });
    const pcStore = createPreviousClose(chart, seriesId);
    previousCloseUnsub = pcStore.subscribe((v) => {
      previousClose = v;
    });
  }
}

onMount(() => {
  const chart = get(chartStore);
  if (chart) chart.setYLabel(true);
});

onDestroy(() => {
  const chart = get(chartStore);
  if (chart) chart.setYLabel(false);
  lastYUnsub?.();
  previousCloseUnsub?.();
});

$: chart = $chartStore;
$: theme = chart?.getTheme();
$: y = chart && lastY !== null ? chart.yScale.valueToY(lastY.value) : 0;

$: bgColor = (() => {
  if (!theme || lastY === null) return '#888';
  if (color) return color;
  const direction =
    previousClose === null
      ? 'neutral'
      : lastY.value > previousClose
        ? 'up'
        : lastY.value < previousClose
          ? 'down'
          : 'neutral';
  return direction === 'up'
    ? theme.yLabel.upBackground
    : direction === 'down'
      ? theme.yLabel.downBackground
      : theme.yLabel.neutralBackground;
})();

$: fractionDigits = (() => {
  if (!chart) return 2;
  const yRange = chart.yScale.getRange();
  const range = yRange.max - yRange.min;
  if (range < 0.1) return 6;
  if (range < 10) return 4;
  if (range < 1000) return 2;
  return 0;
})();
</script>

{#if lastY !== null && chart && theme}
  <!-- Horizontal dashed line -->
  <div
    style="position:absolute;left:0;right:{chart.yAxisWidth}px;top:{y}px;height:0;border-top:1px dashed {bgColor};opacity:0.5;pointer-events:none;z-index:2;"
  />
  <!-- Value badge -->
  <div
    style="position:absolute;right:4px;top:{y}px;transform:translateY(-50%);pointer-events:auto;z-index:3;background:{bgColor};color:{theme.yLabel.textColor};font-size:{theme.typography.yFontSize}px;font-family:{theme.typography.fontFamily};padding:3px 8px;border-radius:3px;white-space:nowrap;transition:background-color 0.3s ease;"
  >
    <NumberFlow
      value={lastY.value}
      format={{ minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits, useGrouping: false }}
      spinDuration={350}
    />
  </div>
{/if}

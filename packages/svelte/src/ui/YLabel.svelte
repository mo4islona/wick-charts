<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { get } from 'svelte/store';
  import type { ChartInstance } from '@wick-charts/core';
  import { getChartContext } from '../context';
  import { createLastPrice, createPreviousClose } from '../stores';
  import NumberFlow from './NumberFlow.svelte';

  export let seriesId: string;
  export let color: string | undefined = undefined;

  const chartStore = getChartContext();
  let lastPrice: number | null = null;
  let previousClose: number | null = null;
  let lastPriceUnsub: (() => void) | null = null;
  let previousCloseUnsub: (() => void) | null = null;

  $: {
    const chart = $chartStore;
    if (chart && !lastPriceUnsub) {
      const lpStore = createLastPrice(chart, seriesId);
      lastPriceUnsub = lpStore.subscribe((v) => {
        lastPrice = v;
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
    lastPriceUnsub?.();
    previousCloseUnsub?.();
  });

  $: chart = $chartStore;
  $: theme = chart?.getTheme();
  $: y = chart && lastPrice !== null ? chart.yScale.valueToY(lastPrice) : 0;

  $: bgColor = (() => {
    if (!theme || lastPrice === null) return '#888';
    if (color) return color;
    const direction =
      previousClose === null
        ? 'neutral'
        : lastPrice > previousClose
          ? 'up'
          : lastPrice < previousClose
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

{#if lastPrice !== null && chart && theme}
  <!-- Horizontal dashed line -->
  <div
    style="position:absolute;left:0;right:{chart.yAxisWidth}px;top:{y}px;height:0;border-top:1px dashed {bgColor};opacity:0.5;pointer-events:none;z-index:2;"
  />
  <!-- Value badge -->
  <div
    style="position:absolute;right:4px;top:{y}px;transform:translateY(-50%);pointer-events:auto;z-index:3;background:{bgColor};color:{theme.yLabel.textColor};font-size:{theme.typography.yFontSize}px;font-family:{theme.typography.fontFamily};padding:3px 8px;border-radius:3px;white-space:nowrap;transition:background-color 0.3s ease;"
  >
    <NumberFlow
      value={lastPrice}
      format={{ minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits, useGrouping: false }}
      spinDuration={350}
    />
  </div>
{/if}

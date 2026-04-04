<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { get } from 'svelte/store';
  import type { OHLCData, CandlestickSeriesOptions } from '@wick-charts/core';
  import { syncSeriesData } from '@wick-charts/core';
  import { getChartContext } from './context';

  export let data: OHLCData[] = [];
  export let options: Partial<CandlestickSeriesOptions> | undefined = undefined;
  export let onSeriesId: ((id: string) => void) | undefined = undefined;

  const chartStore = getChartContext();
  let seriesId: string | null = null;
  let prevLen = 0;

  onMount(() => {
    const chart = get(chartStore);
    if (!chart) return;
    seriesId = chart.addCandlestickSeries(options);
    onSeriesId?.(seriesId);
  });

  onDestroy(() => {
    const chart = get(chartStore);
    if (seriesId && chart) chart.removeSeries(seriesId);
    seriesId = null;
    prevLen = 0;
  });

  $: {
    const chart = $chartStore;
    if (seriesId && chart && data.length > 0) {
      prevLen = syncSeriesData(chart, seriesId, data, prevLen);
    }
  }

  $: {
    const chart = $chartStore;
    if (seriesId && chart && options) {
      chart.updateSeriesOptions(seriesId, options);
    }
  }
</script>

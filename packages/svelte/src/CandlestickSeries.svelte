<script lang="ts">
import type { CandlestickSeriesOptions, OHLCData } from '@wick-charts/core';
import { onDestroy, onMount } from 'svelte';
import { get } from 'svelte/store';

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
  const id = seriesId;
  if (id && chart) {
    if (data.length === 0) {
      chart.setSeriesData(id, []);
      prevLen = 0;
    } else if (prevLen === 0 || data.length < prevLen || data.length - prevLen > 5) {
      chart.setSeriesData(id, data);
      prevLen = data.length;
    } else if (data.length === prevLen) {
      chart.updateData(id, data[data.length - 1]);
    } else {
      for (let i = prevLen; i < data.length; i++) {
        chart.appendData(id, data[i]);
      }
      prevLen = data.length;
    }
  }
}

$: {
  const chart = $chartStore;
  if (seriesId && chart && options) {
    chart.updateSeriesOptions(seriesId, options);
  }
}
</script>

<script lang="ts">
import type { BarSeriesOptions, LineData } from '@wick-charts/core';
import { onDestroy, onMount } from 'svelte';
import { get } from 'svelte/store';

import { getChartContext } from './context';

export let data: LineData[][] = [];
export let options: Partial<BarSeriesOptions> | undefined = undefined;
export let onSeriesId: ((id: string) => void) | undefined = undefined;

const chartStore = getChartContext();
let seriesId: string | null = null;

onMount(() => {
  const chart = get(chartStore);
  if (!chart) return;
  seriesId = chart.addBarSeries(data.length, options);
  onSeriesId?.(seriesId);
});

onDestroy(() => {
  const chart = get(chartStore);
  if (seriesId && chart) chart.removeSeries(seriesId);
  seriesId = null;
});

$: {
  const chart = $chartStore;
  if (seriesId && chart && data.length > 0) {
    chart.beginUpdate();
    for (let i = 0; i < data.length; i++) {
      chart.setBarLayerData(seriesId, i, data[i]);
    }
    chart.endUpdate();
  }
}

$: {
  const chart = $chartStore;
  if (seriesId && chart && options) {
    chart.updateSeriesOptions(seriesId, options);
  }
}
</script>

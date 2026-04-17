<script lang="ts">
import type { BarSeriesOptions, TimePoint } from '@wick-charts/core';
import { onDestroy, onMount } from 'svelte';
import { get } from 'svelte/store';

import { getChartContext } from './context';

export let data: TimePoint[][] = [];
export let options: Partial<BarSeriesOptions> | undefined = undefined;
export let label: string | undefined = undefined;
export let onSeriesId: ((id: string) => void) | undefined = undefined;

const chartStore = getChartContext();
let seriesId: string | null = null;

onMount(() => {
  const chart = get(chartStore);
  if (!chart) return;
  seriesId = chart.addBarSeries({ ...options, label: label ?? options?.label, layers: data.length });
  onSeriesId?.(seriesId);
});

onDestroy(() => {
  const chart = get(chartStore);
  if (seriesId && chart) chart.removeSeries(seriesId);
  seriesId = null;
});

$: {
  const chart = $chartStore;
  if (seriesId && chart) {
    chart.batch(() => {
      for (let i = 0; i < data.length; i++) {
        chart.setSeriesData(seriesId!, data[i], i);
      }
    });
  }
}

$: {
  const chart = $chartStore;
  if (seriesId && chart && options) {
    chart.updateSeriesOptions(seriesId, options);
  }
}
</script>

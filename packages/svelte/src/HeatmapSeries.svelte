<script lang="ts">
import type { HeatmapCellData, HeatmapSeriesOptions } from '@wick-charts/core';
import { HeatmapSeriesDef } from '@wick-charts/core';
import { onDestroy, onMount } from 'svelte';
import { get } from 'svelte/store';

import { getChartContext } from './context';

export let data: HeatmapCellData[];
export let options: Partial<HeatmapSeriesOptions> | undefined = undefined;
/** Stable series ID — same value across remounts. */
export let id: string | undefined = undefined;
/** Show/hide the series without unmounting it — excludes it from the Y-range fit and tooltip/legend. Default `true`. Live. */
export let visible: boolean = true;

const chartStore = getChartContext();
let seriesId: string | null = null;

onMount(() => {
  const chart = get(chartStore);
  if (!chart) return;
  seriesId = chart.addSeries(HeatmapSeriesDef, { ...options, id });
  chart.setSeriesVisible(seriesId, visible);
});

onDestroy(() => {
  const chart = get(chartStore);
  if (seriesId && chart) chart.removeSeries(seriesId);
  seriesId = null;
});

$: {
  const chart = $chartStore;
  // No length guard: an empty array is a legitimate update (filter yields
  // no rows) and must clear the previous cells, matching the React wrapper.
  if (seriesId && chart) {
    chart.setSeriesData(seriesId, data);
  }
}

$: {
  const chart = $chartStore;
  if (seriesId && chart && options) {
    chart.updateSeriesOptions(seriesId, options);
  }
}

$: {
  const chart = $chartStore;
  if (seriesId && chart) {
    chart.setSeriesVisible(seriesId, visible);
  }
}
</script>

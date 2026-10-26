<script lang="ts">
import type { PieSliceInput, RadialProgressSeriesOptions } from '@wick-charts/core';
import { RadialProgressSeriesDef } from '@wick-charts/core';
import { onDestroy, onMount } from 'svelte';
import { get } from 'svelte/store';

import { getChartContext } from './context.js';

/** One ring per entry, outermost first: `{ label, value, color? }`. `<PieLegend>` lists them. */
export let data: PieSliceInput[];
/** Visual options override — the value of a full ring, ring colors, track color, entry / update durations. */
export let options: Partial<RadialProgressSeriesOptions> | undefined = undefined;
/** Stable series ID — same value across remounts. */
export let id: string | undefined = undefined;
/** Show/hide the series without unmounting it — also hides it from `<PieLegend>`. Default `true`. Live. */
export let visible: boolean = true;

const chartStore = getChartContext();
let seriesId: string | null = null;

onMount(() => {
  const chart = get(chartStore);
  if (!chart) return;
  seriesId = chart.addSeries(RadialProgressSeriesDef, { ...options, id });
  chart.setSeriesVisible(seriesId, visible);
});

onDestroy(() => {
  const chart = get(chartStore);
  if (seriesId && chart) chart.removeSeries(seriesId);
  seriesId = null;
});

$: {
  const chart = $chartStore;
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

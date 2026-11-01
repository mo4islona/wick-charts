<script lang="ts">
import type { RadarLayer, RadarSeriesOptions } from '@wick-charts/core';
import { RadarSeriesDef } from '@wick-charts/core';
import { onDestroy, onMount } from 'svelte';
import { get } from 'svelte/store';

import { getChartContext } from './context.js';

/** Axis names, clockwise from `options.startAngle`. */
export let axes: string[];
/** One polygon per compared series: `{ label, data, color? }`, a value per axis. A kept `label` morphs to its new values. */
export let data: RadarLayer[];
/** Visual options override — scale, rings, grid shape, fill, dots, labels, hover, colors, entry / update durations. */
export let options: Partial<RadarSeriesOptions> | undefined = undefined;
/** Stable series ID — same value across remounts. */
export let id: string | undefined = undefined;
/** Show/hide the series without unmounting it. Default `true`. Live. */
export let visible: boolean = true;

const chartStore = getChartContext();
let seriesId: string | null = null;

onMount(() => {
  const chart = get(chartStore);
  if (!chart) return;
  seriesId = chart.addSeries(RadarSeriesDef, { ...options, id });
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
    chart.setSeriesData(seriesId, { axes, series: data });
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

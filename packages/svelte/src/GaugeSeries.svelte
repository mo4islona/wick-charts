<script lang="ts">
import type { GaugeSeriesOptions } from '@wick-charts/core';
import { GaugeSeriesDef } from '@wick-charts/core';
import { onDestroy, onMount } from 'svelte';
import { get } from 'svelte/store';

import { getChartContext } from './context.js';

/** The value to show. A value outside `min`…`max` clamps on the arc; the center label shows it as is. */
export let value: number;
/** Visual options override — range, angles, zones, arc or needle style, caption, value format, colors, entry / update durations. */
export let options: Partial<GaugeSeriesOptions> | undefined = undefined;
/** Stable series ID — same value across remounts. */
export let id: string | undefined = undefined;
/** Show/hide the series without unmounting it. Default `true`. Live. */
export let visible: boolean = true;

const chartStore = getChartContext();
let seriesId: string | null = null;

onMount(() => {
  const chart = get(chartStore);
  if (!chart) return;
  seriesId = chart.addSeries(GaugeSeriesDef, { ...options, id });
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
    chart.setSeriesData(seriesId, value);
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

<script lang="ts">
import type { SankeyLink, SankeyNode, SankeySeriesOptions } from '@wick-charts/core';
import { SankeySeriesDef } from '@wick-charts/core';
import { onDestroy, onMount } from 'svelte';
import { get } from 'svelte/store';

import { getChartContext } from './context.js';

/** Stages of the flow. A node no link reaches is not drawn. */
export let nodes: readonly SankeyNode[];
/** Flows between nodes by `id`. Links must not form a cycle: on one the chart logs the error and keeps the previous graph. */
export let links: readonly SankeyLink[];
/** Visual options override — node colors, node width and gap, link opacity, labels, entry / update durations. */
export let options: Partial<SankeySeriesOptions> | undefined = undefined;
/** Stable series ID — same value across remounts. */
export let id: string | undefined = undefined;
/** Show/hide the series without unmounting it — excludes it from the tooltip. Default `true`. Live. */
export let visible: boolean = true;

const chartStore = getChartContext();
let seriesId: string | null = null;

onMount(() => {
  const chart = get(chartStore);
  if (!chart) return;
  seriesId = chart.addSeries(SankeySeriesDef, { ...options, id });
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
    try {
      chart.setSeriesData(seriesId, { nodes, links });
    } catch (error) {
      // A cycle: the core keeps the previous graph. Uncaught, it stops this block for good.
      console.error(error);
    }
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

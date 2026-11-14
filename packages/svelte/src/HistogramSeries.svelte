<script lang="ts">
import type { ChartInstance, HistogramData, HistogramSeriesOptions, HistogramSyncState } from '@wick-charts/core';
import { HistogramSeriesDef, syncHistogramLayers, toHistogramLayers } from '@wick-charts/core';
import { onDestroy, onMount } from 'svelte';
import { get } from 'svelte/store';

import { getChartContext } from './context.js';

/**
 * Raw samples (`number[]`), bins counted already (`{ x0, x1, count }[]`), several of
 * them overlaid, or named `{ label, color?, data }` layers. Needs a numeric X axis.
 */
export let data: HistogramData;
/** Binning, `normalize`, quantile lines, gap, opacity and animation timings. */
export let options: Partial<HistogramSeriesOptions> | undefined = undefined;
/** Stable series ID — same value across remounts. */
export let id: string | undefined = undefined;
/** Show/hide the series without unmounting it. Default `true`. Live. */
export let visible: boolean = true;
/** Named Y scale from the container's `scales`. Default: the default scale. Live. */
export let scale: string | undefined = undefined;

const chartStore = getChartContext();
let seriesId: string | null = null;
// A non-reactive container keeps the data block free of a self-dependency cycle.
const sync: { state: HistogramSyncState[]; layers: number } = { state: [], layers: 0 };

function createSeries(chart: ChartInstance, layers: number): string {
  const sid = chart.addSeries(HistogramSeriesDef, { ...options, scale, layers, id });
  chart.setSeriesVisible(sid, visible);
  seriesId = sid;
  sync.state = [];
  sync.layers = layers;

  return sid;
}

function applyData(chart: ChartInstance, current: string, next: HistogramData): void {
  let sid = current;

  // The layer count is fixed when a series is created; a new count re-creates it, as in React.
  const layers = toHistogramLayers(next).length;
  if (layers !== sync.layers) {
    chart.removeSeries(sid);
    sid = createSeries(chart, layers);
  }

  sync.state = syncHistogramLayers({ chart, id: sid, data: next, prev: sync.state });
}

onMount(() => {
  const chart = get(chartStore);
  if (!chart) return;

  createSeries(chart, toHistogramLayers(data).length);
});

onDestroy(() => {
  const chart = get(chartStore);
  if (seriesId && chart) chart.removeSeries(seriesId);
  seriesId = null;
});

$: {
  const chart = $chartStore;
  const sid = seriesId;
  if (sid && chart) {
    applyData(chart, sid, data);
  }
}

$: {
  const chart = $chartStore;
  if (seriesId && chart) {
    chart.updateSeriesOptions(seriesId, options ? { ...options, scale } : { scale });
  }
}

$: {
  const chart = $chartStore;
  if (seriesId && chart) {
    chart.setSeriesVisible(seriesId, visible);
  }
}
</script>

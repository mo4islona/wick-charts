<script lang="ts">
import type { ChartInstance, LineSeriesOptions, MultiLayerData, SeriesSyncState } from '@wick-charts/core';
import { LineSeriesDef, syncLayers, toLayers } from '@wick-charts/core';
import { onDestroy, onMount } from 'svelte';
import { get } from 'svelte/store';

import { getChartContext } from './context.js';

/**
 * Flat `TimePoint[]`, `TimePoint[][]`, or named `{ label, color?, data }` layers. Time accepts ms or `Date`.
 * On a numeric or category X axis (`axis.x.type`) points carry `x` in place of `time`.
 */
export let data: MultiLayerData;
export let options: Partial<LineSeriesOptions> | undefined = undefined;
/** Stable series ID — same value across remounts. */
export let id: string | undefined = undefined;
/** Show/hide the series without unmounting it — excludes it from the Y-range fit and tooltip/legend. Default `true`. Live. */
export let visible: boolean = true;
/** Named Y scale from the container's `scales` — autoscales on its own, sharing the time axis. Default: the default scale. Live. */
export let scale: string | undefined = undefined;

const chartStore = getChartContext();
let seriesId: string | null = null;
// Per-layer sync state in a non-reactive container: mutating a `const` object's
// property keeps the reactive block free of a self-dependency cycle while still
// driving the shared append/keepLast/update/replace reconciliation (no per-tick
// Y snap).
const sync: { state: SeriesSyncState[]; layers: number } = { state: [], layers: 0 };

function createSeries(chart: ChartInstance, layers: number): string {
  const sid = chart.addSeries(LineSeriesDef, { ...options, scale, layers, id });
  chart.setSeriesVisible(sid, visible);
  seriesId = sid;
  sync.state = [];
  sync.layers = layers;

  return sid;
}

function applyData(chart: ChartInstance, current: string, next: MultiLayerData): void {
  let sid = current;

  // The layer count is fixed when a series is created; a new count re-creates it, as in React.
  const layers = toLayers(next).length;
  if (layers !== sync.layers) {
    chart.removeSeries(sid);
    sid = createSeries(chart, layers);
  }

  sync.state = syncLayers({ chart, id: sid, data: next, prev: sync.state });
}

onMount(() => {
  const chart = get(chartStore);
  if (!chart) return;

  createSeries(chart, toLayers(data).length);
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

// `scale` rides the same update, so a stacking change is checked against the new scale.
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

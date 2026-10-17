<script lang="ts">
import type { BandData, BandSeriesOptions, SeriesSyncState } from '@wick-charts/core';
import { BandSeriesDef, syncLayers, toLayers } from '@wick-charts/core';
import { onDestroy, onMount } from 'svelte';
import { get } from 'svelte/store';

import { getChartContext } from './context.js';

/**
 * Band data — one band per layer. A single band passes a flat
 * `{ time, low, high }[]`; several bands pass `BandPoint[][]`. To name/color
 * a band, pass `{ label, color?, data }` (or an array of them). Time accepts
 * ms or `Date`. On a numeric or category X axis (`axis.x.type`) samples
 * carry `x` in place of `time`: `{ x: 'EU', low, high }`.
 */
export let data: BandData;
/** Visual options override — fill, edge stroke, curve, entrance / intro / smoothing. */
export let options: Partial<BandSeriesOptions> | undefined = undefined;
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
const sync: { state: SeriesSyncState[] } = { state: [] };

onMount(() => {
  const chart = get(chartStore);
  if (!chart) return;

  seriesId = chart.addSeries(BandSeriesDef, { ...options, scale, layers: toLayers(data).length, id });
  chart.setSeriesVisible(seriesId, visible);
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
    sync.state = syncLayers({ chart, id: sid, data, prev: sync.state });
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

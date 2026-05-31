<script lang="ts">
import type { LineSeriesOptions, SeriesSyncState, TimePoint } from '@wick-charts/core';
import { EMPTY_SYNC_STATE, syncSeriesLayer } from '@wick-charts/core';
import { onDestroy, onMount } from 'svelte';
import { get } from 'svelte/store';

import { getChartContext } from './context';

export let data: TimePoint[][];
export let options: Partial<LineSeriesOptions> | undefined = undefined;
/** Stable series ID — same value across remounts. */
export let id: string | undefined = undefined;

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
  seriesId = chart.addSeries('line', { ...options, layers: data.length, id });
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
    chart.batch(() => {
      for (let i = 0; i < data.length; i++) {
        sync.state[i] = syncSeriesLayer({
          chart,
          id: sid,
          data: data[i],
          prev: sync.state[i] ?? EMPTY_SYNC_STATE,
          layerIndex: i,
        });
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

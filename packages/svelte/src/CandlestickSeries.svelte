<script lang="ts">
import type { CandlestickSeriesOptions, OHLCInput, SeriesSyncState } from '@wick-charts/core';
import { CandlestickSeriesDef, EMPTY_SYNC_STATE, syncSeriesLayer } from '@wick-charts/core';
import { onDestroy, onMount } from 'svelte';
import { get } from 'svelte/store';

import { getChartContext } from './context';

export let data: OHLCInput[];
export let options: Partial<CandlestickSeriesOptions> | undefined = undefined;
/** Stable series ID — same value across remounts. */
export let id: string | undefined = undefined;

const chartStore = getChartContext();
let seriesId: string | null = null;
// Sync state in a non-reactive container — mutating the `const` object's
// property keeps the reactive block free of a self-dependency cycle while still
// driving the shared append/keepLast/update/replace reconciliation (rolling
// windows ease instead of snapping; 6–20 candle bursts take the append path).
const sync: { state: SeriesSyncState } = { state: EMPTY_SYNC_STATE };

onMount(() => {
  const chart = get(chartStore);
  if (!chart) return;
  seriesId = chart.addSeries(CandlestickSeriesDef, { ...options, id });
});

onDestroy(() => {
  const chart = get(chartStore);
  if (seriesId && chart) chart.removeSeries(seriesId);
  seriesId = null;
  sync.state = EMPTY_SYNC_STATE;
});

$: {
  const chart = $chartStore;
  const sid = seriesId;
  if (sid && chart) {
    sync.state = syncSeriesLayer({ chart, id: sid, data, prev: sync.state });
  }
}

$: {
  const chart = $chartStore;
  if (seriesId && chart && options) {
    chart.updateSeriesOptions(seriesId, options);
  }
}
</script>

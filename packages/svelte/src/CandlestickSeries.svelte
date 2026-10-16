<script lang="ts">
import type { CandlestickData, CandlestickSeriesOptions, OHLCInput, SeriesSyncState } from '@wick-charts/core';
import { CandlestickSeriesDef, EMPTY_SYNC_STATE, syncSeriesLayer, toLayers } from '@wick-charts/core';
import { onDestroy, onMount } from 'svelte';
import { get } from 'svelte/store';

import { getChartContext } from './context';

/** Flat `OHLCInput[]`, or `{ label, data }` to name the stream. */
export let data: CandlestickData;
export let options: Partial<CandlestickSeriesOptions> | undefined = undefined;
/** Stable series ID — same value across remounts. */
export let id: string | undefined = undefined;
/** Show/hide the series without unmounting it — excludes it from the Y-range fit and tooltip/legend. Default `true`. Live. */
export let visible: boolean = true;
/** Named Y scale from the container's `scales` — autoscales on its own, sharing the time axis. Default: the default scale. Live. */
export let scale: string | undefined = undefined;

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
  seriesId = chart.addSeries(CandlestickSeriesDef, {
    ...options,
    scale,
    id,
    label: toLayers<OHLCInput>(data)[0].label,
  });
  chart.setSeriesVisible(seriesId, visible);
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
    const layer = toLayers<OHLCInput>(data)[0];
    chart.setSeriesLabels(sid, [layer.label]);
    sync.state = syncSeriesLayer({ chart, id: sid, data: layer.data, prev: sync.state });
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

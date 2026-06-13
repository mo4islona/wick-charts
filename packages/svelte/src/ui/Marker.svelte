<script lang="ts">
import type { MarkerShape, TimeValue } from '@wick-charts/core';
import { onDestroy, onMount } from 'svelte';
import { get } from 'svelte/store';

import { getChartContext } from '../context';

/** X anchor — epoch ms or a `Date`. */
export let time: TimeValue;
/** Y anchor as a data value. Omit and set `seriesId` to snap to that series' value at `time`. */
export let value: number | undefined = undefined;
/** Snap Y to this series' value at `time` when `value` is omitted. Also the default color source. */
export let seriesId: string | undefined = undefined;
/** Glyph at the anchor. Default: `'dot'`. Arrows point their tip at the anchor. */
export let shape: MarkerShape | undefined = undefined;
/** Reuse the line pulse halo around the anchor. Default: `false`. */
export let pulse: boolean | undefined = undefined;
/** Optional text label drawn in a pill next to the anchor. */
export let label: string | undefined = undefined;
/** Color override. Falls back to the series color (when `seriesId` is set), then the theme line color. */
export let color: string | undefined = undefined;

const chartStore = getChartContext();
let markerId: string | null = null;

onMount(() => {
  const chart = get(chartStore);
  if (!chart) return;

  markerId = chart.addMarker({ time, value, seriesId, shape, pulse, label, color });
});

onDestroy(() => {
  const chart = get(chartStore);
  if (markerId !== null && chart) chart.removeMarker(markerId);
  markerId = null;
});

// Push prop changes through to the live marker (the first pass runs before
// onMount sets markerId, so it's a guarded no-op).
$: {
  const chart = $chartStore;
  if (markerId !== null && chart) {
    chart.updateMarker(markerId, { time, value, seriesId, shape, pulse, label, color });
  }
}
</script>

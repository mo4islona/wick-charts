<script lang="ts">
import type { TimeRegionEnd, TimeValue } from '@wick-charts/core';
import { onDestroy, onMount } from 'svelte';
import { get } from 'svelte/store';

import { getChartContext } from '../context';

/** Left edge — epoch ms or a `Date`. */
export let from: TimeValue;
/** Right edge — epoch ms or a `Date`. Omit (or pass `'now'`) for an open-ended band to the right edge. */
export let to: TimeRegionEnd | undefined = undefined;
/** Band fill — any CSS color, typically translucent. Default: a faint tint of `color`. */
export let fill: string | undefined = undefined;
/** Optional text label drawn in an annotation chip at the top of the band. */
export let label: string | undefined = undefined;
/** Edge-line and label-chip accent. Default: the theme's muted axis text color. */
export let color: string | undefined = undefined;

const chartStore = getChartContext();
let regionId: string | null = null;

onMount(() => {
  const chart = get(chartStore);
  if (!chart) return;

  regionId = chart.addRegion({ from, to, fill, label, color });
});

onDestroy(() => {
  const chart = get(chartStore);
  if (regionId !== null && chart) chart.removeRegion(regionId);
  regionId = null;
});

// Push prop changes through to the live region (the first pass runs before
// onMount sets regionId, so it's a guarded no-op).
$: {
  const chart = $chartStore;
  if (regionId !== null && chart) {
    chart.updateRegion(regionId, { from, to, fill, label, color });
  }
}
</script>

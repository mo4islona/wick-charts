<script lang="ts">
import type { ReferenceLineStyle, TimeValue } from '@wick-charts/core';
import { onDestroy, onMount } from 'svelte';
import { get } from 'svelte/store';

import { getChartContext } from '../context';

/** Horizontal line at this Y data value. Mutually exclusive with `time`. */
export let value: number | undefined = undefined;
/** Vertical line at this `time` (epoch ms or `Date`). Mutually exclusive with `value`. */
export let time: TimeValue | undefined = undefined;
/** Line and label-pill color. Default: the theme line color. */
export let color: string | undefined = undefined;
/** Optional text label drawn in a pill at the line's near end. */
export let label: string | undefined = undefined;
/** Dash style. Default: `'dashed'`. */
export let style: ReferenceLineStyle | undefined = undefined;
/** Stroke width in CSS pixels. Default: `1`. */
export let width: number | undefined = undefined;

const chartStore = getChartContext();
let lineId: string | null = null;

onMount(() => {
  const chart = get(chartStore);
  if (!chart) return;

  lineId = chart.addLine({ value, time, color, label, style, width });
});

onDestroy(() => {
  const chart = get(chartStore);
  if (lineId !== null && chart) chart.removeLine(lineId);
  lineId = null;
});

// Push prop changes through to the live line (the first pass runs before
// onMount sets lineId, so it's a guarded no-op).
$: {
  const chart = $chartStore;
  if (lineId !== null && chart) {
    chart.updateLine(lineId, { value, time, color, label, style, width });
  }
}
</script>

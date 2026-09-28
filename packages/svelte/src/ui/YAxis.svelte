<script lang="ts">
import { type ChartInstance, type ValueFormatter, mountAxisLabels } from '@wick-charts/core';
import { onDestroy, onMount } from 'svelte';
import { get } from 'svelte/store';

import { getChartContext } from '../context';
import { createAxisLayout } from '../stores';

/** Custom tick-label formatter. Overrides the built-in range-adaptive default. */
export let format: ValueFormatter | undefined = undefined;
/**
 * Desired number of labels (≥ 2). Overrides any chart-level `axis.y.labelCount`.
 * Realized count may differ ±1 after the 1-2-5 snap.
 */
export let labelCount: number | undefined = undefined;
/** Minimum pixel gap between adjacent labels (hard floor). Overrides chart-level. */
export let minLabelSpacing: number | undefined = undefined;

const chart = get(getChartContext());
const layout = chart !== null ? createAxisLayout(chart) : null;

let container: HTMLDivElement | null = null;
let cleanup: (() => void) | null = null;

// Route the formatter through yScale so Crosshair / YLabel fallback use
// the same function as the axis labels.
$: if (chart !== null) {
  chart.yScale.setFormat(format ?? null);
}

$: if (chart !== null) {
  chart.setYAxisLabelDensity({
    labelCount: labelCount ?? null,
    minLabelSpacing: minLabelSpacing ?? null,
  });
}

onMount(() => {
  if (chart === null || container === null) return;
  cleanup = mountAxisLabels({ chart: chart as ChartInstance, container, axis: 'y' });
});

onDestroy(() => {
  cleanup?.();
  cleanup = null;
  if (chart !== null) {
    chart.yScale.setFormat(null);
    chart.setYAxisLabelDensity({ labelCount: null, minLabelSpacing: null });
  }
});
</script>

{#if chart !== null && $layout}
  <div
    bind:this={container}
    style="position:absolute;{$layout.yAxisPosition}:0;top:0;bottom:{$layout.xAxisHeight}px;width:{$layout.yAxisWidth}px;pointer-events:none;"
  />
{/if}

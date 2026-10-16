<script lang="ts">
import { type ChartInstance, type XAxisFormatter, mountAxisLabels } from '@wick-charts/core';
import { onDestroy, onMount } from 'svelte';
import { get } from 'svelte/store';

import { getChartContext } from '../context';
import { createAxisLayout } from '../stores';

/** Desired number of labels (≥ 2). Overrides chart-level `axis.x.labelCount`. */
export let labelCount: number | undefined = undefined;
/** Minimum pixel gap between adjacent labels (hard floor). Overrides chart-level. */
export let minLabelSpacing: number | undefined = undefined;
/**
 * Custom label formatter. `x` is epoch ms on a time axis, the number on a
 * numeric axis, the category name on a category axis; `step` is the tick
 * spacing. Also formats the crosshair label and the tooltip / info-bar headers.
 */
export let format: XAxisFormatter | undefined = undefined;

const chart = get(getChartContext());
const layout = chart !== null ? createAxisLayout(chart) : null;

let container: HTMLDivElement | null = null;
let cleanup: (() => void) | null = null;

$: if (chart !== null) {
  chart.setTimeAxisLabelDensity({
    labelCount: labelCount ?? null,
    minLabelSpacing: minLabelSpacing ?? null,
  });
}

$: if (chart !== null) chart.setXAxisFormat(format ?? null);

onMount(() => {
  if (chart === null || container === null) return;
  cleanup = mountAxisLabels({ chart: chart as ChartInstance, container, axis: 'x' });
});

onDestroy(() => {
  cleanup?.();
  cleanup = null;
  if (chart !== null) {
    chart.setTimeAxisLabelDensity({ labelCount: null, minLabelSpacing: null });
    chart.setXAxisFormat(null);
  }
});
</script>

{#if chart !== null && $layout}
  <div
    bind:this={container}
    style="position:absolute;left:{$layout.leftAxisWidth}px;bottom:0;right:{$layout.rightAxisWidth}px;height:{$layout.xAxisHeight}px;pointer-events:none;display:flex;align-items:center;"
  />
{/if}

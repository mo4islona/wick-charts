<script lang="ts">
import { type ChartInstance, type ValueFormatter, mountAxisLabels } from '@wick-charts/core';
import { onDestroy } from 'svelte';
import { get } from 'svelte/store';

import { getChartContext } from '../context.js';
import { type AxisLayout, createAxisLayout, createYRange } from '../stores.js';

/** Custom tick-label formatter. Overrides the built-in range-adaptive default. */
export let format: ValueFormatter | undefined = undefined;
/**
 * Desired number of labels (≥ 2). Overrides any chart-level `axis.y.labelCount`.
 * Realized count may differ ±1 after the 1-2-5 snap.
 */
export let labelCount: number | undefined = undefined;
/** Minimum pixel gap between adjacent labels (hard floor). Overrides chart-level. */
export let minLabelSpacing: number | undefined = undefined;
/**
 * Named Y scale (`ChartContainer` `scales`) this axis labels. Default: the
 * default scale. An overlay scale has no column, so only `format` and the
 * label density apply.
 */
export let scale: string | undefined = undefined;

const chart = get(getChartContext());
const layout = chart !== null ? createAxisLayout(chart) : null;
// `setScales` emits `viewportChange`, which this store follows.
const yRange = chart !== null ? createYRange(chart) : null;

let container: HTMLDivElement | null = null;
let cleanup: (() => void) | null = null;

// An id `scales` doesn't define (yet) must not fall through to the default scale.
function isKnown(id: string | undefined, _range: unknown): boolean {
  if (chart === null) return false;

  return id === undefined || chart.getYScaleIds().includes(id);
}

function resolveColumn(id: string | undefined, axisLayout: AxisLayout | undefined, idKnown: boolean) {
  if (chart === null || axisLayout === undefined) return null;
  if (id === undefined) return { position: axisLayout.yAxisPosition, width: axisLayout.yAxisWidth };

  return idKnown ? chart.getYScaleColumn(id) : null;
}

$: known = isKnown(scale, $yRange);
$: column = resolveColumn(scale, $layout, known);

// Route the formatter through yScale so Crosshair / YLabel fallback use
// the same function as the axis labels.
// The scale whose formatter this axis set, so a scale switch and destroy clear that one.
let formatApplied: { scale: string | undefined } | null = null;
function clearFormat(): void {
  if (chart === null || formatApplied === null) return;

  chart.setYAxisFormat({ format: null, scale: formatApplied.scale });
  formatApplied = null;
}
function syncFormat(id: string | undefined, fmt: ValueFormatter | undefined, idKnown: boolean): void {
  clearFormat();
  if (chart === null || !idKnown) return;

  chart.setYAxisFormat({ format: fmt ?? null, scale: id });
  formatApplied = { scale: id };
}
$: syncFormat(scale, format, known);

// The scale whose density this axis set, so a scale switch and destroy reset that one.
let densityApplied: { scale: string | undefined } | null = null;
function resetDensity(): void {
  if (chart === null || densityApplied === null) return;

  chart.setYAxisLabelDensity({ labelCount: null, minLabelSpacing: null, scale: densityApplied.scale });
  densityApplied = null;
}
function applyDensity(args: {
  id: string | undefined;
  count: number | undefined;
  spacing: number | undefined;
  idKnown: boolean;
}): void {
  const { id, count, spacing, idKnown } = args;
  if (densityApplied !== null && densityApplied.scale !== id) resetDensity();
  if (chart === null || !idKnown) return;

  chart.setYAxisLabelDensity({ labelCount: count ?? null, minLabelSpacing: spacing ?? null, scale: id });
  densityApplied = { scale: id };
}
$: applyDensity({ id: scale, count: labelCount, spacing: minLabelSpacing, idKnown: known });

function mountLabels(el: HTMLDivElement | null, id: string | undefined): void {
  cleanup?.();
  cleanup = null;
  if (chart === null || el === null) return;

  cleanup = mountAxisLabels({ chart: chart as ChartInstance, container: el, axis: 'y', scale: id });
}
$: mountLabels(container, scale);

onDestroy(() => {
  cleanup?.();
  cleanup = null;
  clearFormat();
  resetDensity();
});
</script>

{#if chart !== null && $layout && column}
  <div
    bind:this={container}
    style="position:absolute;{column.position}:0;top:0;bottom:{$layout.xAxisHeight}px;width:{column.width}px;pointer-events:none;"
  ></div>
{/if}

<script setup lang="ts">
import { type ValueFormatter, mountAxisLabels } from '@wick-charts/core';
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';

import { useAxisLayout, useYRange } from '../composables';
import { useChartInstance } from '../context';

const props = defineProps<{
  /** Custom tick-label formatter. Overrides the built-in range-adaptive default. */
  format?: ValueFormatter;
  /**
   * Desired number of labels (≥ 2). Overrides any chart-level `axis.y.labelCount`.
   * Realized count may differ ±1 after the 1-2-5 snap.
   */
  labelCount?: number;
  /** Minimum pixel gap between adjacent labels (hard floor). Overrides chart-level. */
  minLabelSpacing?: number;
  /**
   * Named Y scale (`ChartContainer` `scales`) this axis labels. Default: the
   * default scale. An overlay scale has no column, so only `format` and the
   * label density apply.
   */
  scale?: string;
}>();

const chart = useChartInstance();
const layout = useAxisLayout(chart);
// `setScales` emits `viewportChange`, which this ref follows.
const yRange = useYRange(chart);
const containerRef = ref<HTMLDivElement | null>(null);

// An id `scales` doesn't define (yet) must not fall through to the default scale.
const known = computed(() => {
  void yRange.value;

  return props.scale === undefined || chart.getYScaleIds().includes(props.scale);
});
const column = computed(() => {
  const { yAxisPosition, yAxisWidth } = layout.value;
  if (props.scale === undefined) return { position: yAxisPosition, width: yAxisWidth };

  return known.value ? chart.getYScaleColumn(props.scale) : null;
});

// Route the formatter through yScale so Crosshair / YLabel fallback use
// the same function as the axis labels.
// The scale whose formatter this axis set, so a scale switch and unmount clear that one.
let formatApplied: { scale: string | undefined } | null = null;
const clearFormat = () => {
  if (formatApplied === null) return;

  chart.setYAxisFormat({ format: null, scale: formatApplied.scale });
  formatApplied = null;
};
const syncFormat = () => {
  clearFormat();
  if (!known.value) return;

  chart.setYAxisFormat({ format: props.format ?? null, scale: props.scale });
  formatApplied = { scale: props.scale };
};
onMounted(syncFormat);
watch(() => [props.format, props.scale, known.value], syncFormat);
onUnmounted(clearFormat);

// The scale whose density this axis set, so a scale switch and unmount reset that one.
let densityApplied: { scale: string | undefined } | null = null;
const resetDensity = () => {
  if (densityApplied === null) return;

  chart.setYAxisLabelDensity({ labelCount: null, minLabelSpacing: null, scale: densityApplied.scale });
  densityApplied = null;
};
const applyDensity = () => {
  if (densityApplied !== null && densityApplied.scale !== props.scale) resetDensity();
  if (!known.value) return;

  chart.setYAxisLabelDensity({
    labelCount: props.labelCount ?? null,
    minLabelSpacing: props.minLabelSpacing ?? null,
    scale: props.scale,
  });
  densityApplied = { scale: props.scale };
};
applyDensity();
watch(() => [props.labelCount, props.minLabelSpacing, props.scale, known.value], applyDensity);
onUnmounted(resetDensity);

let cleanup: (() => void) | null = null;
const mountLabels = () => {
  cleanup?.();
  cleanup = null;
  if (containerRef.value === null) return;

  cleanup = mountAxisLabels({ chart, container: containerRef.value, axis: 'y', scale: props.scale });
};
onMounted(mountLabels);
watch([containerRef, () => props.scale], mountLabels, { flush: 'post' });
onUnmounted(() => {
  cleanup?.();
  cleanup = null;
});
</script>

<template>
  <div
    v-if="column"
    ref="containerRef"
    :style="{
      position: 'absolute',
      [column.position]: '0',
      top: '0',
      bottom: layout.xAxisHeight + 'px',
      width: column.width + 'px',
      pointerEvents: 'none',
    }"
  />
</template>

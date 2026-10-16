<script setup lang="ts">
import { mountAxisLabels } from '@wick-charts/core';
import { onMounted, onUnmounted, ref, watch } from 'vue';

import { useAxisLayout } from '../composables';
import { useChartInstance } from '../context';

const props = defineProps<{
  /** Desired number of labels (≥ 2). Overrides chart-level `axis.x.labelCount`. */
  labelCount?: number;
  /** Minimum pixel gap between adjacent labels (hard floor). Overrides chart-level. */
  minLabelSpacing?: number;
}>();

const chart = useChartInstance();
const layout = useAxisLayout(chart);
const containerRef = ref<HTMLDivElement | null>(null);

const applyDensity = () => {
  chart.setTimeAxisLabelDensity({
    labelCount: props.labelCount ?? null,
    minLabelSpacing: props.minLabelSpacing ?? null,
  });
};
applyDensity();
watch(() => [props.labelCount, props.minLabelSpacing], applyDensity);
onUnmounted(() => {
  chart.setTimeAxisLabelDensity({ labelCount: null, minLabelSpacing: null });
});

let cleanup: (() => void) | null = null;
onMounted(() => {
  if (containerRef.value === null) return;
  cleanup = mountAxisLabels({ chart, container: containerRef.value, axis: 'x' });
});
onUnmounted(() => {
  cleanup?.();
  cleanup = null;
});
</script>

<template>
  <div
    ref="containerRef"
    :style="{
      position: 'absolute',
      left: layout.leftAxisWidth + 'px',
      bottom: '0',
      right: layout.rightAxisWidth + 'px',
      height: layout.xAxisHeight + 'px',
      pointerEvents: 'none',
      display: 'flex',
      alignItems: 'center',
    }"
  />
</template>

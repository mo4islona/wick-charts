<script setup lang="ts">
import { GaugeSeriesDef } from '@wick-charts/core';
import { onMounted, onUnmounted, ref, watch } from 'vue';

import { useChartInstance } from './context';
import type { GaugeSeriesProps } from './props';

const props = withDefaults(
  defineProps<GaugeSeriesProps>(),
  // Vue's type-based `defineProps` casts an absent Boolean-typed prop to
  // `false` (not `undefined`) without an explicit default.
  { visible: true },
);

const chart = useChartInstance();
const seriesId = ref<string | null>(null);

onMounted(() => {
  const id = chart.addSeries(GaugeSeriesDef, { ...props.options, id: props.id });
  seriesId.value = id;
  // Lazy watcher — apply the initial value here so a static gauge renders on mount.
  chart.setSeriesData(id, props.value);
  chart.setSeriesVisible(id, props.visible);
});

onUnmounted(() => {
  if (seriesId.value) chart.removeSeries(seriesId.value);
});

watch(
  () => props.value,
  (value) => {
    if (seriesId.value) chart.setSeriesData(seriesId.value, value);
  },
);

watch(
  () => props.options,
  (options) => {
    if (seriesId.value && options) {
      chart.updateSeriesOptions(seriesId.value, options);
    }
  },
  { deep: true },
);

watch(
  () => props.visible,
  (visible) => {
    if (seriesId.value) chart.setSeriesVisible(seriesId.value, visible);
  },
);
</script>

<template><span v-if="false" /></template>

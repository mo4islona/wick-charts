<script setup lang="ts">
import type { PieSeriesOptions, PieSliceData } from '@wick-charts/core';
import { onMounted, onUnmounted, ref, watch } from 'vue';

import { useChartInstance } from './context';

const props = defineProps<{
  data: PieSliceData[];
  options?: Partial<PieSeriesOptions>;
  /** Stable series ID — same value across remounts. */
  id?: string;
}>();

const chart = useChartInstance();
const seriesId = ref<string | null>(null);

onMounted(() => {
  const id = chart.addPieSeries({ ...props.options, id: props.id });
  seriesId.value = id;
  // Lazy watcher — apply initial data here so static-data mounts render without a no-op first frame.
  if (props.data.length > 0) {
    chart.setSeriesData(id, props.data);
  }
});

onUnmounted(() => {
  if (seriesId.value) chart.removeSeries(seriesId.value);
});

watch(
  () => props.data,
  (data) => {
    if (seriesId.value && data.length > 0) {
      chart.setSeriesData(seriesId.value, data);
    }
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
</script>

<template><span v-if="false" /></template>

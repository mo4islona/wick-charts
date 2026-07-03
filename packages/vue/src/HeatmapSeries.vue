<script setup lang="ts">
import type { HeatmapCellData, HeatmapSeriesOptions } from '@wick-charts/core';
import { HeatmapSeriesDef } from '@wick-charts/core';
import { onMounted, onUnmounted, ref, watch } from 'vue';

import { useChartInstance } from './context';

const props = defineProps<{
  data: HeatmapCellData[];
  options?: Partial<HeatmapSeriesOptions>;
  /** Stable series ID — same value across remounts. */
  id?: string;
}>();

const chart = useChartInstance();
const seriesId = ref<string | null>(null);

onMounted(() => {
  const id = chart.addSeries(HeatmapSeriesDef, { ...props.options, id: props.id });
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
    // No length guard: an empty array is a legitimate update (filter yields
    // no rows) and must clear the previous cells, matching the React wrapper.
    if (seriesId.value) {
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

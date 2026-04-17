<script setup lang="ts">
import type { PieSeriesOptions, PieSliceData } from '@wick-charts/core';
import { onMounted, onUnmounted, ref, watch } from 'vue';

import { useChartInstance } from './context';

const props = defineProps<{
  data: PieSliceData[];
  options?: Partial<PieSeriesOptions>;
}>();

const emit = defineEmits<{ seriesId: [id: string] }>();

const chart = useChartInstance();
const seriesId = ref<string | null>(null);

onMounted(() => {
  const id = chart.addPieSeries(props.options);
  seriesId.value = id;
  emit('seriesId', id);
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

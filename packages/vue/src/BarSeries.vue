<script setup lang="ts">
import type { BarSeriesOptions, TimePoint } from '@wick-charts/core';
import { onMounted, onUnmounted, ref, watch } from 'vue';

import { useChartInstance } from './context';

const props = defineProps<{
  data: TimePoint[][];
  options?: Partial<BarSeriesOptions>;
  label?: string;
}>();

const emit = defineEmits<{ seriesId: [id: string] }>();

const chart = useChartInstance();
const seriesId = ref<string | null>(null);

onMounted(() => {
  const id = chart.addBarSeries({ ...props.options, label: props.label ?? props.options?.label, layers: props.data.length });
  seriesId.value = id;
  emit('seriesId', id);
});

onUnmounted(() => {
  if (seriesId.value) chart.removeSeries(seriesId.value);
});

watch(
  () => props.data,
  (data) => {
    if (!seriesId.value) return;
    chart.batch(() => {
      for (let i = 0; i < data.length; i++) {
        chart.setBarLayerData(seriesId.value!, i, data[i]);
      }
    });
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

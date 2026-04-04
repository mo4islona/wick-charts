<script setup lang="ts">
import type { LineData, LineSeriesOptions } from '@wick-charts/core';
import { onMounted, onUnmounted, ref, watch } from 'vue';

import { useChartInstance } from './context';

const props = defineProps<{
  data: LineData[][];
  options?: Partial<LineSeriesOptions>;
  label?: string;
}>();

const emit = defineEmits<{ seriesId: [id: string] }>();

const chart = useChartInstance();
const seriesId = ref<string | null>(null);

onMounted(() => {
  const id = chart.addLineSeries(props.data.length, { ...props.options, label: props.label ?? props.options?.label });
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
    chart.beginUpdate();
    for (let i = 0; i < data.length; i++) {
      chart.setLineLayerData(seriesId.value, i, data[i]);
    }
    chart.endUpdate();
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

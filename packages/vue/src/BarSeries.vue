<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import type { LineData, BarSeriesOptions } from '@wick-charts/core';
import { useChartInstance } from './context';

const props = defineProps<{
  data: LineData[][];
  options?: Partial<BarSeriesOptions>;
}>();

const emit = defineEmits<{ seriesId: [id: string] }>();

const chart = useChartInstance();
const seriesId = ref<string | null>(null);

onMounted(() => {
  const id = chart.addBarSeries(props.data.length, props.options);
  seriesId.value = id;
  emit('seriesId', id);
});

onUnmounted(() => {
  if (seriesId.value) chart.removeSeries(seriesId.value);
});

watch(() => props.data, (data) => {
  if (!seriesId.value) return;
  for (let i = 0; i < data.length; i++) {
    chart.setBarLayerData(seriesId.value, i, data[i]);
  }
});

watch(() => props.options, (options) => {
  if (seriesId.value && options) {
    chart.updateSeriesOptions(seriesId.value, options);
  }
}, { deep: true });
</script>

<template><span v-if="false" /></template>

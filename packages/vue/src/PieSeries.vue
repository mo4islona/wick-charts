<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import type { PieSliceData, PieSeriesOptions } from '@wick-charts/core';
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

watch(() => props.data, (data) => {
  if (seriesId.value && data.length > 0) {
    chart.setPieData(seriesId.value, data);
  }
});

watch(() => props.options, (options) => {
  if (seriesId.value && options) {
    chart.updateSeriesOptions(seriesId.value, options);
  }
}, { deep: true });
</script>

<template><span v-if="false" /></template>

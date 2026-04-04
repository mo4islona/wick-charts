<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import type { OHLCData, CandlestickSeriesOptions } from '@wick-charts/core';
import { syncSeriesData } from '@wick-charts/core';
import { useChartInstance } from './context';

const props = defineProps<{
  data: OHLCData[];
  options?: Partial<CandlestickSeriesOptions>;
}>();

const emit = defineEmits<{ seriesId: [id: string] }>();

const chart = useChartInstance();
const seriesId = ref<string | null>(null);
let prevLen = 0;

onMounted(() => {
  const id = chart.addCandlestickSeries(props.options);
  seriesId.value = id;
  emit('seriesId', id);
});

onUnmounted(() => {
  if (seriesId.value) chart.removeSeries(seriesId.value);
});

watch(() => props.data, (data) => {
  if (!seriesId.value || data.length === 0) return;
  prevLen = syncSeriesData(chart, seriesId.value, data, prevLen);
});

watch(() => props.options, (options) => {
  if (seriesId.value && options) {
    chart.updateSeriesOptions(seriesId.value, options);
  }
}, { deep: true });
</script>

<template><span v-if="false" /></template>

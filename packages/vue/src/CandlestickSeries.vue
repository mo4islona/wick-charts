<script setup lang="ts">
import type { CandlestickSeriesOptions, OHLCInput } from '@wick-charts/core';
import { onMounted, onUnmounted, ref, watch } from 'vue';

import { useChartInstance } from './context';

const props = defineProps<{
  data: OHLCInput[];
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

watch(
  () => props.data,
  (data) => {
    const id = seriesId.value;
    if (!id) return;

    if (data.length === 0) {
      chart.setSeriesData(id, []);
      prevLen = 0;
      return;
    }

    if (prevLen === 0 || data.length < prevLen || data.length - prevLen > 5) {
      chart.setSeriesData(id, data);
    } else if (data.length === prevLen) {
      chart.updateData(id, data[data.length - 1]);
    } else {
      for (let i = prevLen; i < data.length; i++) {
        chart.appendData(id, data[i]);
      }
    }

    prevLen = data.length;
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

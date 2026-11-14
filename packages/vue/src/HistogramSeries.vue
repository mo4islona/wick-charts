<script setup lang="ts">
import type { HistogramData, HistogramSyncState } from '@wick-charts/core';
import { HistogramSeriesDef, syncHistogramLayers, toHistogramLayers } from '@wick-charts/core';
import { onMounted, onUnmounted, ref, watch } from 'vue';

import { rawSeriesData, seriesDataSource } from './composables';
import { useChartInstance } from './context';
import type { HistogramSeriesProps } from './props';

const props = withDefaults(defineProps<HistogramSeriesProps>(), { visible: true });

const chart = useChartInstance();
const seriesId = ref<string | null>(null);
let prevSync: HistogramSyncState[] = [];
let layerCount = 0;

function applyData(id: string, data: HistogramData): void {
  prevSync = syncHistogramLayers({ chart, id, data, prev: prevSync });
}

function createSeries(data: HistogramData): void {
  layerCount = toHistogramLayers(data).length;
  const id = chart.addSeries(HistogramSeriesDef, {
    ...props.options,
    scale: props.scale,
    layers: layerCount,
    id: props.id,
  });
  seriesId.value = id;
  prevSync = [];
  applyData(id, data);
  chart.setSeriesVisible(id, props.visible);
}

onMounted(() => {
  createSeries(rawSeriesData(props.data));
});

onUnmounted(() => {
  if (seriesId.value) chart.removeSeries(seriesId.value);
});

watch(
  seriesDataSource(() => props.data),
  () => {
    const data = rawSeriesData(props.data);
    const id = seriesId.value;
    if (!id) return;

    // The layer count is fixed when a series is created; a new count re-creates it, as in React.
    if (toHistogramLayers(data).length !== layerCount) {
      chart.removeSeries(id);
      createSeries(data);

      return;
    }

    applyData(id, data);
  },
);

watch(
  () => [props.options, props.scale] as const,
  ([options, scale]) => {
    if (!seriesId.value) return;

    chart.updateSeriesOptions(seriesId.value, options ? { ...options, scale } : { scale });
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

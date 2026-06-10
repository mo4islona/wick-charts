<script setup lang="ts">
import type { BarSeriesOptions, SeriesSyncState, TimePoint } from '@wick-charts/core';
import { BarSeriesDef, EMPTY_SYNC_STATE, syncSeriesLayer } from '@wick-charts/core';
import { onMounted, onUnmounted, ref, watch } from 'vue';

import { useChartInstance } from './context';

const props = defineProps<{
  data: TimePoint[][];
  options?: Partial<BarSeriesOptions>;
  /** Stable series ID — same value across remounts. */
  id?: string;
}>();

const chart = useChartInstance();
const seriesId = ref<string | null>(null);
// Per-layer sync state — drives the shared append/keepLast/update/replace
// reconciliation so streaming eases instead of snapping Y every tick.
let prevSync: SeriesSyncState[] = [];

function applyData(id: string, data: TimePoint[][]): void {
  chart.batch(() => {
    for (let i = 0; i < data.length; i++) {
      prevSync[i] = syncSeriesLayer({ chart, id, data: data[i], prev: prevSync[i] ?? EMPTY_SYNC_STATE, layerIndex: i });
    }
  });
}

onMounted(() => {
  const id = chart.addSeries(BarSeriesDef, {
    ...props.options,
    layers: props.data.length,
    id: props.id,
  });
  seriesId.value = id;
  prevSync = props.data.map(() => EMPTY_SYNC_STATE);
  // Lazy watcher — apply initial data here so static-data mounts render without a no-op first frame.
  applyData(id, props.data);
});

onUnmounted(() => {
  if (seriesId.value) chart.removeSeries(seriesId.value);
});

watch(
  () => props.data,
  (data) => {
    const id = seriesId.value;
    if (!id) return;

    applyData(id, data);
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

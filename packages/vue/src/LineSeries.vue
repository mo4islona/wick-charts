<script setup lang="ts">
import type { LineSeriesOptions, MultiLayerData, SeriesSyncState } from '@wick-charts/core';
import { EMPTY_SYNC_STATE, LineSeriesDef, syncLayers, toLayers } from '@wick-charts/core';
import { onMounted, onUnmounted, ref, watch } from 'vue';

import { useChartInstance } from './context';

const props = defineProps<{
  /** Flat `TimePoint[]`, `TimePoint[][]`, or named `{ label, color?, data }` layers. Time accepts ms or `Date`. */
  data: MultiLayerData;
  options?: Partial<LineSeriesOptions>;
  /** Stable series ID — same value across remounts. */
  id?: string;
}>();

const chart = useChartInstance();
const seriesId = ref<string | null>(null);
// Per-layer sync state — drives the shared append/keepLast/update/replace
// reconciliation (plus per-layer labels/colors) so streaming eases instead of
// snapping Y every tick.
let prevSync: SeriesSyncState[] = [];

function applyData(id: string, data: MultiLayerData): void {
  prevSync = syncLayers({ chart, id, data, prev: prevSync });
}

onMounted(() => {
  const layerCount = toLayers(props.data).length;
  const id = chart.addSeries(LineSeriesDef, {
    ...props.options,
    layers: layerCount,
    id: props.id,
  });
  seriesId.value = id;
  prevSync = new Array(layerCount).fill(EMPTY_SYNC_STATE);
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

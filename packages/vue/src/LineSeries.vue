<script setup lang="ts">
import type { MultiLayerData, SeriesSyncState } from '@wick-charts/core';
import { EMPTY_SYNC_STATE, LineSeriesDef, syncLayers, toLayers } from '@wick-charts/core';
import { onMounted, onUnmounted, ref, watch } from 'vue';

import { rawSeriesData, seriesDataSource } from './composables';
import { useChartInstance } from './context';
import type { LineSeriesProps } from './props';

const props = withDefaults(
  defineProps<LineSeriesProps>(),
  // Vue's type-based `defineProps` casts an absent Boolean-typed prop to
  // `false` (not `undefined`) without an explicit default — see the
  // `interactive` fix in ChartContainer.vue for the full explanation.
  { visible: true },
);

const chart = useChartInstance();
const seriesId = ref<string | null>(null);
// Per-layer sync state — drives the shared append/keepLast/update/replace
// reconciliation (plus per-layer labels/colors) so streaming eases instead of
// snapping Y every tick.
let prevSync: SeriesSyncState[] = [];
let layerCount = 0;

function applyData(id: string, data: MultiLayerData): void {
  prevSync = syncLayers({ chart, id, data, prev: prevSync });
}

function createSeries(data: MultiLayerData): void {
  layerCount = toLayers(data).length;
  const id = chart.addSeries(LineSeriesDef, {
    ...props.options,
    scale: props.scale,
    layers: layerCount,
    id: props.id,
  });
  seriesId.value = id;
  prevSync = new Array(layerCount).fill(EMPTY_SYNC_STATE);
  // Lazy watcher — apply initial data here so static-data mounts render without a no-op first frame.
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
    if (toLayers(data).length !== layerCount) {
      chart.removeSeries(id);
      createSeries(data);

      return;
    }

    applyData(id, data);
  },
);

// `scale` rides the same update, so a stacking change is checked against the new scale.
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

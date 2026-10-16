<script setup lang="ts">
import type { LineSeriesOptions, MultiLayerData, SeriesSyncState } from '@wick-charts/core';
import { EMPTY_SYNC_STATE, LineSeriesDef, syncLayers, toLayers } from '@wick-charts/core';
import { onMounted, onUnmounted, ref, watch } from 'vue';

import { useChartInstance } from './context';

const props = withDefaults(
  defineProps<{
    /** Flat `TimePoint[]`, `TimePoint[][]`, or named `{ label, color?, data }` layers. Time accepts ms or `Date`. */
    data: MultiLayerData;
    options?: Partial<LineSeriesOptions>;
    /** Stable series ID — same value across remounts. */
    id?: string;
    /** Show/hide the series without unmounting it — excludes it from the Y-range fit and tooltip/legend. Default `true`. Live. */
    visible?: boolean;
    /** Named Y scale from the container's `scales` — autoscales on its own, sharing the time axis. Default: the default scale. Live. */
    scale?: string;
  }>(),
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

function applyData(id: string, data: MultiLayerData): void {
  prevSync = syncLayers({ chart, id, data, prev: prevSync });
}

onMounted(() => {
  const layerCount = toLayers(props.data).length;
  const id = chart.addSeries(LineSeriesDef, {
    ...props.options,
    scale: props.scale,
    layers: layerCount,
    id: props.id,
  });
  seriesId.value = id;
  prevSync = new Array(layerCount).fill(EMPTY_SYNC_STATE);
  // Lazy watcher — apply initial data here so static-data mounts render without a no-op first frame.
  applyData(id, props.data);
  chart.setSeriesVisible(id, props.visible);
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

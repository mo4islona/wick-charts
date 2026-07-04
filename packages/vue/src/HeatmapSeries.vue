<script setup lang="ts">
import type { HeatmapCellData, HeatmapSeriesOptions } from '@wick-charts/core';
import { HeatmapSeriesDef } from '@wick-charts/core';
import { onMounted, onUnmounted, ref, watch } from 'vue';

import { useChartInstance } from './context';

const props = withDefaults(
  defineProps<{
    data: HeatmapCellData[];
    options?: Partial<HeatmapSeriesOptions>;
    /** Stable series ID — same value across remounts. */
    id?: string;
    /** Show/hide the series without unmounting it — excludes it from the Y-range fit and tooltip/legend. Default `true`. Live. */
    visible?: boolean;
  }>(),
  // Vue's type-based `defineProps` casts an absent Boolean-typed prop to
  // `false` (not `undefined`) without an explicit default — see the
  // `interactive` fix in ChartContainer.vue for the full explanation.
  { visible: true },
);

const chart = useChartInstance();
const seriesId = ref<string | null>(null);

onMounted(() => {
  const id = chart.addSeries(HeatmapSeriesDef, { ...props.options, id: props.id });
  seriesId.value = id;
  // Lazy watcher — apply initial data here so static-data mounts render without a no-op first frame.
  if (props.data.length > 0) {
    chart.setSeriesData(id, props.data);
  }
  chart.setSeriesVisible(id, props.visible);
});

onUnmounted(() => {
  if (seriesId.value) chart.removeSeries(seriesId.value);
});

watch(
  () => props.data,
  (data) => {
    // No length guard: an empty array is a legitimate update (filter yields
    // no rows) and must clear the previous cells, matching the React wrapper.
    if (seriesId.value) {
      chart.setSeriesData(seriesId.value, data);
    }
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

watch(
  () => props.visible,
  (visible) => {
    if (seriesId.value) chart.setSeriesVisible(seriesId.value, visible);
  },
);
</script>

<template><span v-if="false" /></template>

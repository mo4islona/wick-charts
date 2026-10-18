<script setup lang="ts">
import type { DepthLevel, DepthSeriesOptions } from '@wick-charts/core';
import { DepthSeriesDef } from '@wick-charts/core';
import { onMounted, onUnmounted, ref, toRaw, watch } from 'vue';

import { useChartInstance } from './context';

const props = withDefaults(
  defineProps<{
    /** Bid levels as `[price, size]`, in any order. Cumulative depth is computed from them. */
    bids: readonly DepthLevel[];
    /** Ask levels as `[price, size]`, in any order. Cumulative depth is computed from them. */
    asks: readonly DepthLevel[];
    /** Visual options override — `span` of the default view, side colors, stroke width, intro / update durations. */
    options?: Partial<DepthSeriesOptions>;
    /** Stable series ID — same value across remounts. */
    id?: string;
    /** Show/hide the series without unmounting it — excludes it from the Y-range fit and tooltip/legend. Default `true`. Live. */
    visible?: boolean;
  }>(),
  // Vue's type-based `defineProps` casts an absent Boolean-typed prop to
  // `false` (not `undefined`) without an explicit default.
  { visible: true },
);

const chart = useChartInstance();
const seriesId = ref<string | null>(null);

/** The book with Vue's reactive Proxies taken off, so the chart reads plain arrays. */
function rawBook() {
  return { bids: toRaw(props.bids), asks: toRaw(props.asks) };
}

onMounted(() => {
  const id = chart.addSeries(DepthSeriesDef, { ...props.options, id: props.id });
  seriesId.value = id;
  // Lazy watcher — apply the initial book here so a static book renders on mount.
  chart.setSeriesData(id, rawBook());
  chart.setSeriesVisible(id, props.visible);
});

onUnmounted(() => {
  if (seriesId.value) chart.removeSeries(seriesId.value);
});

watch(
  () => [props.bids, props.asks],
  () => {
    if (seriesId.value) chart.setSeriesData(seriesId.value, rawBook());
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

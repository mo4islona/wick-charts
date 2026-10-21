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

/**
 * Watch source for the book. Besides a new array, it re-fires on an in-place
 * `push` / `splice` or a replaced or edited level of a reactive book: a book
 * is small, so it reads every level through the Proxy.
 */
function bookSource(): unknown[] {
  const deps: unknown[] = [];
  for (const side of [props.bids, props.asks]) {
    deps.push(side, side.length);
    for (const level of side) {
      deps.push(level, level[0], level[1]);
    }
  }

  return deps;
}

// The core skips a book with the same levels, so a re-fire without a real change is cheap.
watch(bookSource, () => {
  if (seriesId.value) chart.setSeriesData(seriesId.value, rawBook());
});

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

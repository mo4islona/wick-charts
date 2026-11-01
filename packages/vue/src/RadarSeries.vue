<script setup lang="ts">
import { RadarSeriesDef } from '@wick-charts/core';
import { onMounted, onUnmounted, ref, toRaw, watch } from 'vue';

import { rawSeriesData } from './composables';
import { useChartInstance } from './context';
import type { RadarSeriesProps } from './props';

const props = withDefaults(
  defineProps<RadarSeriesProps>(),
  // Vue's type-based `defineProps` casts an absent Boolean-typed prop to
  // `false` (not `undefined`) without an explicit default.
  { visible: true },
);

const chart = useChartInstance();
const seriesId = ref<string | null>(null);

function applyData(id: string): void {
  chart.setSeriesData(id, { axes: toRaw(props.axes), series: rawSeriesData(props.data) });
}

onMounted(() => {
  const id = chart.addSeries(RadarSeriesDef, { ...props.options, id: props.id });
  seriesId.value = id;
  // Lazy watcher — apply the initial data here so a static radar renders on mount.
  applyData(id);
  chart.setSeriesVisible(id, props.visible);
});

onUnmounted(() => {
  if (seriesId.value) chart.removeSeries(seriesId.value);
});

/**
 * Watch source for the axes and the layers. Besides new arrays, it re-fires on an
 * in-place edit of a reactive prop: a radar is small, so it reads every value through the Proxy.
 */
function radarSource(): unknown[] {
  const deps: unknown[] = [props.axes, ...props.axes, props.data, props.data.length];
  for (const layer of props.data) {
    deps.push(layer, layer.label, layer.color, layer.data, ...layer.data);
  }

  return deps;
}

watch(radarSource, () => {
  if (seriesId.value) applyData(seriesId.value);
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

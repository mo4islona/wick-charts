<script setup lang="ts">
import { SankeySeriesDef } from '@wick-charts/core';
import { onMounted, onUnmounted, ref, toRaw, watch } from 'vue';

import { useChartInstance } from './context';
import type { SankeySeriesProps } from './props';

const props = withDefaults(
  defineProps<SankeySeriesProps>(),
  // Vue's type-based `defineProps` casts an absent Boolean-typed prop to
  // `false` (not `undefined`) without an explicit default.
  { visible: true },
);

const chart = useChartInstance();
const seriesId = ref<string | null>(null);

/** The graph with Vue's reactive Proxies taken off, so the chart reads plain arrays. */
function rawGraph() {
  return { nodes: toRaw(props.nodes), links: toRaw(props.links) };
}

function applyGraph(id: string): void {
  try {
    chart.setSeriesData(id, rawGraph());
  } catch (error) {
    // A cycle: the core keeps the previous graph. Uncaught, it breaks the next update of the component.
    console.error(error);
  }
}

onMounted(() => {
  const id = chart.addSeries(SankeySeriesDef, { ...props.options, id: props.id });
  seriesId.value = id;
  // Lazy watcher — apply the initial graph here so a static graph renders on mount.
  applyGraph(id);
  chart.setSeriesVisible(id, props.visible);
});

onUnmounted(() => {
  if (seriesId.value) chart.removeSeries(seriesId.value);
});

/**
 * Watch source for the graph. Besides new arrays, it re-fires on an in-place
 * `push` / `splice` or an edited node or link of a reactive graph: a graph is
 * small, so it reads every field the series draws through the Proxy.
 */
function graphSource(): unknown[] {
  const deps: unknown[] = [props.nodes, props.nodes.length, props.links, props.links.length];
  for (const node of props.nodes) {
    deps.push(node, node.id, node.label, node.color);
  }
  for (const link of props.links) {
    deps.push(link, link.source, link.target, link.value, link.color);
  }

  return deps;
}

// The core skips a graph with the same fields, so a re-fire without a real change is cheap.
watch(graphSource, () => {
  if (seriesId.value) applyGraph(seriesId.value);
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

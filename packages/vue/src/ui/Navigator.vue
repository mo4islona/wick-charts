<script setup lang="ts">
import { NavigatorController, type NavigatorData } from '@wick-charts/core';
import { computed, inject, onBeforeUnmount, ref, shallowRef, watch } from 'vue';

import { ChartKey, NavigatorAnchorKey, ThemeKey } from '../context';

const props = withDefaults(
  defineProps<{
    data: NavigatorData;
    /** Strip height in CSS pixels. Defaults to `theme.navigator.height` (60). */
    height?: number;
  }>(),
  {},
);

const anchor = inject(NavigatorAnchorKey);
const chartRef = inject(ChartKey);
const themeRef = inject(ThemeKey);

if (!anchor || !chartRef || !themeRef) {
  throw new Error('<Navigator> must be used within <ChartContainer>.');
}

const stripRef = ref<HTMLDivElement | null>(null);
const controller = shallowRef<NavigatorController | null>(null);

const resolvedHeight = computed(() => props.height ?? themeRef.value.navigator.height);

// Mount the controller once the strip div exists and the chart is available.
// Watch both — either may arrive after the other across Teleport boundaries.
watch(
  [stripRef, () => chartRef.value],
  ([strip, chart]) => {
    if (!strip || !chart || controller.value) return;
    controller.value = new NavigatorController({
      container: strip,
      chart,
      data: props.data,
      options: props.height !== undefined ? { height: props.height } : undefined,
    });
  },
  { flush: 'post', immediate: true },
);

watch(
  () => props.data,
  (next) => {
    controller.value?.setData(next);
  },
);

watch(
  () => props.height,
  (next) => {
    controller.value?.setOptions(next !== undefined ? { height: next } : {});
  },
);

onBeforeUnmount(() => {
  controller.value?.destroy();
  controller.value = null;
});
</script>

<template>
  <Teleport v-if="anchor" :to="anchor">
    <div
      ref="stripRef"
      data-chart-navigator=""
      :style="{
        position: 'relative',
        width: '100%',
        height: resolvedHeight + 'px',
        flexShrink: 0,
      }"
    />
  </Teleport>
</template>

<script setup lang="ts">
import { type AxisConfig, ChartInstance, type ChartTheme, darkTheme } from '@wick-charts/core';
import { computed, onMounted, onUnmounted, provide, ref, shallowRef, watch } from 'vue';

import { ChartKey, ThemeKey } from './context';

const props = withDefaults(
  defineProps<{
    theme?: ChartTheme;
    axis?: AxisConfig;
  }>(),
  {
    theme: () => darkTheme,
  },
);

const containerRef = ref<HTMLDivElement>();
const chart = shallowRef<ChartInstance | null>(null);
const themeRef = shallowRef<ChartTheme>(props.theme);

provide(ChartKey, chart);
provide(ThemeKey, themeRef);

onMounted(() => {
  if (!containerRef.value) return;
  const options: any = {};
  if (props.axis) options.axis = props.axis;
  if (props.theme) options.theme = props.theme;
  chart.value = new ChartInstance(containerRef.value, options);
});

onUnmounted(() => {
  chart.value?.destroy();
  chart.value = null;
});

watch(
  () => props.theme,
  (newTheme) => {
    if (chart.value && newTheme) {
      chart.value.setTheme(newTheme);
      themeRef.value = newTheme;
    }
  },
);

watch(
  () => props.axis,
  (newAxis) => {
    if (chart.value && newAxis) chart.value.setAxis(newAxis);
  },
  { deep: true },
);

const gradientStyle = computed(() => {
  const t = themeRef.value;
  const [gtop, gbot] = t?.chartGradient ?? ['transparent', 'transparent'];
  const bg = t?.background ?? 'transparent';
  return `position: relative; width: 100%; height: 100%; overflow: hidden; background: linear-gradient(to bottom, ${gtop} 0%, ${bg} 70%, ${gbot} 100%)`;
});
</script>

<template>
  <div
    ref="containerRef"
    :style="gradientStyle"
  >
    <div
      v-if="chart"
      style="position: absolute; inset: 0; pointer-events: none; z-index: 2"
    >
      <slot />
    </div>
  </div>
</template>

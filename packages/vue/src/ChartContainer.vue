<script setup lang="ts">
import { type AxisConfig, ChartInstance, type ChartTheme, darkTheme } from '@wick-charts/core';
import { computed, nextTick, onMounted, onUnmounted, provide, ref, shallowRef, watch } from 'vue';

import { ChartKey, LegendAnchorKey, LegendRightAnchorKey, ThemeKey, TitleAnchorKey, TooltipLegendAnchorKey } from './context';

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

// Anchors for hoisted overlays. Title / TooltipLegend teleport into a top
// overlay anchor that is positioned *absolute* at the top of the canvas
// block, so the canvas (and its grid) spans the full container height. The
// combined anchor height is measured and fed into `chart.setPadding({ top })`
// so data stays below the header.
const topOverlayRef = ref<HTMLElement | null>(null);
const titleAnchor = ref<HTMLElement | null>(null);
const tooltipLegendAnchor = ref<HTMLElement | null>(null);
const legendAnchor = ref<HTMLElement | null>(null);
const legendRightAnchor = ref<HTMLElement | null>(null);

provide(ChartKey, chart);
provide(ThemeKey, themeRef);
provide(TitleAnchorKey, titleAnchor);
provide(TooltipLegendAnchorKey, tooltipLegendAnchor);
provide(LegendAnchorKey, legendAnchor);
provide(LegendRightAnchorKey, legendRightAnchor);

let resizeObserver: ResizeObserver | null = null;
let topOverlayHeight = 0;

function applyPadding() {
  if (!chart.value) return;
  chart.value.setPadding({ top: 20 + topOverlayHeight });
}

onMounted(async () => {
  if (!containerRef.value) return;
  const options: any = {};
  if (props.axis) options.axis = props.axis;
  if (props.theme) options.theme = props.theme;
  chart.value = new ChartInstance(containerRef.value, options);

  await nextTick();
  if (!topOverlayRef.value) return;
  const measure = () => {
    topOverlayHeight = topOverlayRef.value?.getBoundingClientRect().height ?? 0;
    applyPadding();
  };
  measure();
  resizeObserver = new ResizeObserver(measure);
  resizeObserver.observe(topOverlayRef.value);
});

onUnmounted(() => {
  resizeObserver?.disconnect();
  resizeObserver = null;
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

const rootStyle = computed(() => {
  const t = themeRef.value;
  const [gtop, gbot] = t?.chartGradient ?? ['transparent', 'transparent'];
  const bg = t?.background ?? 'transparent';
  return (
    'position: relative; display: flex; flex-direction: column; width: 100%; height: 100%; overflow: hidden; ' +
    `background: linear-gradient(to bottom, ${gtop} 0%, ${bg} 70%, ${gbot} 100%)`
  );
});
</script>

<template>
  <div :style="rootStyle">
    <div style="display: flex; flex-direction: row; flex: 1; min-height: 0">
      <div
        ref="containerRef"
        style="position: relative; flex: 1; min-width: 0; min-height: 0; overflow: hidden"
      >
        <!-- Top overlay (Title + TooltipLegend) — stacked absolute inside the
             canvas block so the grid extends full-height behind them. -->
        <div
          ref="topOverlayRef"
          data-chart-top-overlay=""
          style="position: absolute; top: 0; left: 0; right: 0; z-index: 2; pointer-events: none; display: flex; flex-direction: column"
        >
          <div ref="titleAnchor" data-chart-title-anchor="" />
          <div ref="tooltipLegendAnchor" data-tooltip-legend-anchor="" />
        </div>
        <div
          v-if="chart"
          data-chart-series-overlay=""
          style="position: absolute; inset: 0; pointer-events: none; z-index: 3"
        >
          <slot />
        </div>
      </div>
      <div ref="legendRightAnchor" data-legend-right-anchor="" style="flex: 0 0 auto" />
    </div>
    <div ref="legendAnchor" data-legend-anchor="" style="flex: 0 0 auto" />
  </div>
</template>


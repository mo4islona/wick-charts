<script setup lang="ts">
import {
  type ChartInstance,
  type HoverInfo,
  type ValueFormatter,
  formatCompact,
  pieCenterBox,
  pieCenterText,
  pieCenterValueFontSize,
  pieTotal,
} from '@wick-charts/core';
import { computed, onMounted, onUnmounted, ref, useSlots } from 'vue';

import { useChartInstance } from '../context';
import type { PieCenterProps, PieCenterRenderContext } from './props';

const props = withDefaults(defineProps<PieCenterProps>(), { followHover: true });

defineSlots<{
  default?(ctx: PieCenterRenderContext): unknown;
}>();

const chart = useChartInstance();
const slots = useSlots();
const hasCustomSlot = computed(() => typeof slots.default === 'function');
const effectiveFormat = computed<ValueFormatter>(() => props.format ?? formatCompact);

const bump = ref(0);
const handler = () => {
  bump.value++;
};
onMounted(() => {
  chart.on('overlayChange', handler);
  chart.on('seriesHover', handler);
  // A sibling series registers in its own onMounted, after this component's first render.
  if (chart.getSeriesIds().length > 0) bump.value++;
});
onUnmounted(() => {
  chart.off('overlayChange', handler);
  chart.off('seriesHover', handler);
});

function resolvePieSeriesId(c: ChartInstance, explicit: string | undefined): string | null {
  if (explicit !== undefined) return explicit;

  const pies = c.getSeriesIdsByType('pie', { visibleOnly: true });

  return pies.length > 0 ? pies[0] : null;
}

const state = computed(() => {
  void bump.value;

  const id = resolvePieSeriesId(chart, props.seriesId);
  const hole = id !== null ? chart.getPieHole(id) : null;
  const slices = id !== null ? chart.getSliceInfo(id) : null;
  if (id === null || !hole || !slices || slices.length === 0) return null;

  const theme = chart.getTheme();
  const box = pieCenterBox(hole, theme);
  if (!box) return null;

  const hovered: HoverInfo | null = props.followHover ? chart.getHoverInfo(id) : null;

  return { hole, slices, theme, box, hovered };
});

const slotContext = computed<PieCenterRenderContext | null>(() => {
  const s = state.value;
  if (!s) return null;

  return {
    total: pieTotal(s.slices),
    slices: s.slices,
    hovered: s.hovered,
    format: effectiveFormat.value,
    hole: s.hole,
  };
});

const text = computed(() => {
  const s = state.value;
  if (!s) return null;

  return pieCenterText({ slices: s.slices, hovered: s.hovered, format: effectiveFormat.value, label: props.label });
});

const boxStyle = computed(() => {
  const s = state.value;
  if (!s) return {};

  return {
    position: 'absolute' as const,
    left: `${s.box.left}px`,
    top: `${s.box.top}px`,
    width: `${s.box.size}px`,
    height: `${s.box.size}px`,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center' as const,
    overflow: 'hidden',
    pointerEvents: 'none' as const,
    fontFamily: s.theme.typography.fontFamily,
    fontSize: `${s.theme.typography.fontSize}px`,
    color: s.theme.tooltip.textColor,
  };
});
</script>

<template>
  <div v-if="state" data-chart-pie-center="" :style="boxStyle">
    <slot v-if="hasCustomSlot && slotContext" v-bind="slotContext" />
    <template v-else-if="text">
      <div
        :style="{
          fontSize: `${pieCenterValueFontSize(state.box, text.value)}px`,
          fontWeight: 600,
          lineHeight: 1.1,
          whiteSpace: 'nowrap',
        }"
      >
        {{ text.value }}
      </div>
      <div
        v-if="text.caption"
        :style="{ fontSize: `${state.box.captionFontSize}px`, opacity: 0.6, marginTop: '2px', lineHeight: 1.2 }"
      >
        {{ text.caption }}
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import {
  type HoverInfo,
  SANKEY_TOOLTIP_HEIGHT,
  SANKEY_TOOLTIP_WIDTH,
  type ValueFormatter,
  computeTooltipPosition,
  defaultSankeyFormat,
  resolveSankeySeriesId,
} from '@wick-charts/core';
import { computed, onMounted, onUnmounted, ref, useSlots, watchEffect } from 'vue';

import { useCrosshairPosition } from '../composables';
import { useChartInstance } from '../context';
import type { SankeyTooltipProps } from './props';

const props = defineProps<SankeyTooltipProps>();

defineSlots<{
  default?(ctx: { info: HoverInfo; format: ValueFormatter }): unknown;
}>();

const effectiveFormat = computed<ValueFormatter>(() => props.format ?? defaultSankeyFormat);

const chart = useChartInstance();
const crosshair = useCrosshairPosition(chart);
const slots = useSlots();
const hasCustomSlot = computed(() => typeof slots.default === 'function');

const bump = ref(0);
const handler = () => {
  bump.value++;
};
onMounted(() => {
  chart.on('overlayChange', handler);
  // A sibling series registers in its own onMounted, after this tooltip's first render cached no id.
  if (chart.getSeriesIds().length > 0) bump.value++;
});
onUnmounted(() => {
  chart.off('overlayChange', handler);
});

const theme = computed(() => {
  // `setTheme` fires `overlayChange`; read `bump` so this computed picks up
  // runtime theme swaps instead of freezing on the first-render snapshot.
  void bump.value;

  return chart.getTheme();
});
const resolvedId = computed<string | null>(() => {
  void bump.value;

  return resolveSankeySeriesId(chart, props.seriesId);
});

const info = computed<HoverInfo | null>(() => {
  void crosshair.value;
  void bump.value;
  if (resolvedId.value === null) return null;

  return chart.getHoverInfo(resolvedId.value);
});

// Slot content has unknown dimensions: observe the container, then position it once measured.
const containerRef = ref<HTMLDivElement | null>(null);
const measuredSize = ref<{ width: number; height: number } | null>(null);

watchEffect((onCleanup) => {
  if (!hasCustomSlot.value) return;
  const node = containerRef.value;
  if (!node || typeof ResizeObserver === 'undefined') return;

  const observer = new ResizeObserver(() => {
    // `contentRect` leaves out the padding and border, so read the border box from the node.
    const box = { width: node.offsetWidth, height: node.offsetHeight };
    if (box.width === 0) return;
    const prev = measuredSize.value;
    if (!prev || prev.width !== box.width || prev.height !== box.height) {
      measuredSize.value = { width: box.width, height: box.height };
    }
  });
  observer.observe(node);

  onCleanup(() => {
    observer.disconnect();
  });
});

const tooltipPos = computed(() => {
  if (!crosshair.value || !info.value) return null;
  const mediaSize = chart.getMediaSize();

  let size = { width: SANKEY_TOOLTIP_WIDTH, height: SANKEY_TOOLTIP_HEIGHT };
  if (hasCustomSlot.value) {
    if (!measuredSize.value) return { left: 0, top: 0 };

    size = measuredSize.value;
  }

  return computeTooltipPosition({
    x: crosshair.value.mediaX,
    y: crosshair.value.mediaY,
    chartWidth: mediaSize.width,
    chartHeight: mediaSize.height,
    tooltipWidth: size.width,
    tooltipHeight: size.height,
    offsetX: 16,
    offsetY: 16,
  });
});
</script>

<template>
  <div
    v-if="info && crosshair && tooltipPos && !hasCustomSlot"
    :style="{
      position: 'absolute',
      left: tooltipPos.left + 'px',
      top: tooltipPos.top + 'px',
      pointerEvents: 'none',
      background: theme.tooltip.background,
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      border: '1px solid ' + theme.tooltip.borderColor,
      borderRadius: '8px',
      padding: '10px 14px',
      boxShadow: '0 4px 16px rgba(0,0,0,0.1), 0 1px 4px rgba(0,0,0,0.06)',
      fontSize: theme.typography.fontSize + 'px',
      fontFamily: theme.typography.fontFamily,
      color: theme.tooltip.textColor,
      zIndex: 10,
      display: 'flex',
      flexDirection: 'column',
      gap: '6px',
      minWidth: '120px',
    }"
  >
    <div :style="{ display: 'flex', alignItems: 'center', gap: '8px' }">
      <span
        :style="{
          width: '10px',
          height: '10px',
          borderRadius: '3px',
          background: info.color,
          flexShrink: 0,
        }"
      />
      <span :style="{ fontWeight: 600 }">{{ info.label }}</span>
    </div>
    <div :style="{ display: 'flex', justifyContent: 'space-between', gap: '16px' }">
      <span :style="{ fontWeight: 600 }">{{ effectiveFormat(info.value) }}</span>
      <span :style="{ opacity: 0.6 }">{{ info.percent.toFixed(1) }}%</span>
    </div>
  </div>

  <div
    v-if="info && crosshair && tooltipPos && hasCustomSlot"
    ref="containerRef"
    :data-measured="measuredSize !== null ? 'true' : 'false'"
    :style="{
      position: 'absolute',
      left: tooltipPos.left + 'px',
      top: tooltipPos.top + 'px',
      pointerEvents: 'none',
      background: theme.tooltip.background,
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      border: '1px solid ' + theme.tooltip.borderColor,
      borderRadius: '8px',
      padding: '10px 14px',
      boxShadow: '0 4px 16px rgba(0,0,0,0.1), 0 1px 4px rgba(0,0,0,0.06)',
      fontFamily: theme.typography.fontFamily,
      fontSize: theme.typography.fontSize + 'px',
      color: theme.tooltip.textColor,
      zIndex: 10,
      width: 'max-content',
      maxWidth: chart.getMediaSize().width + 'px',
      boxSizing: 'border-box',
      visibility: measuredSize !== null ? 'visible' : 'hidden',
    }"
  >
    <slot :info="info" :format="effectiveFormat" />
  </div>
</template>

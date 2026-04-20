<script setup lang="ts">
import {
  type ChartInstance,
  type HoverInfo,
  type ValueFormatter,
  computeTooltipPosition,
  formatCompact,
} from '@wick-charts/core';
import { computed, onMounted, onUnmounted, ref, useSlots, watchEffect } from 'vue';

import { useCrosshairPosition } from '../composables';
import { useChartInstance } from '../context';

const DEFAULT_TOOLTIP_WIDTH = 160;
const DEFAULT_TOOLTIP_HEIGHT = 70;

const props = defineProps<{
  /**
   * Owning series id. **Optional** — when omitted, the first visible pie
   * series is picked.
   */
  seriesId?: string;
  /** Custom formatter for the slice value. Default: shared `formatCompact`. */
  format?: ValueFormatter;
}>();

defineSlots<{
  default?(ctx: { info: HoverInfo; format: ValueFormatter }): unknown;
}>();

const effectiveFormat = computed<ValueFormatter>(() => props.format ?? formatCompact);

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
});
onUnmounted(() => {
  chart.off('overlayChange', handler);
});

function resolvePieSeriesId(c: ChartInstance, explicit: string | undefined): string | null {
  if (explicit !== undefined) return explicit;

  const pies = c.getSeriesIdsByType('pie', { visibleOnly: true });

  return pies.length > 0 ? pies[0] : null;
}

const theme = computed(() => {
  // `setTheme` fires `overlayChange`; read `bump` so this computed picks up
  // runtime theme swaps instead of freezing on the first-render snapshot.
  void bump.value;

  return chart.getTheme();
});
const resolvedId = computed<string | null>(() => {
  void bump.value;

  return resolvePieSeriesId(chart, props.seriesId);
});

const info = computed<HoverInfo | null>(() => {
  void crosshair.value;
  void bump.value;
  if (resolvedId.value === null) return null;

  return chart.getHoverInfo(resolvedId.value);
});

// Custom-slot measurement — unknown content dimensions mean we can't
// pre-compute `tooltipWidth/Height`. Observe the container, then recompute
// the position once measured so user-rendered tooltips flip/clamp correctly
// instead of overflowing with the hardcoded 160×70 defaults.
const containerRef = ref<HTMLDivElement | null>(null);
const measuredSize = ref<{ width: number; height: number } | null>(null);
let observer: ResizeObserver | null = null;

watchEffect((onCleanup) => {
  if (!hasCustomSlot.value) return;
  const node = containerRef.value;
  if (!node || typeof ResizeObserver === 'undefined') return;

  observer = new ResizeObserver((entries) => {
    const box = entries[0]?.contentRect;
    if (!box) return;
    const prev = measuredSize.value;
    if (!prev || prev.width !== box.width || prev.height !== box.height) {
      measuredSize.value = { width: box.width, height: box.height };
    }
  });
  observer.observe(node);

  onCleanup(() => {
    observer?.disconnect();
    observer = null;
  });
});

const tooltipPos = computed(() => {
  if (!crosshair.value || !info.value) return null;
  const mediaSize = chart.getMediaSize();

  if (hasCustomSlot.value) {
    const size = measuredSize.value;
    if (!size) return { left: 0, top: 0 };

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
  }

  return computeTooltipPosition({
    x: crosshair.value.mediaX,
    y: crosshair.value.mediaY,
    chartWidth: mediaSize.width,
    chartHeight: mediaSize.height,
    tooltipWidth: DEFAULT_TOOLTIP_WIDTH,
    tooltipHeight: DEFAULT_TOOLTIP_HEIGHT,
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
    }"
  >
    <div :style="{ display: 'flex', alignItems: 'center', gap: '8px' }">
      <span
        :style="{
          width: '10px',
          height: '10px',
          borderRadius: '50%',
          background: info.color,
          flexShrink: 0,
        }"
      />
      <span :style="{ fontWeight: 600 }">{{ info.label }}</span>
    </div>
    <div :style="{ display: 'flex', justifyContent: 'space-between', gap: '16px' }">
      <span :style="{ opacity: 0.6 }">{{ effectiveFormat(info.value) }}</span>
      <span :style="{ fontWeight: 600 }">{{ info.percent.toFixed(1) }}%</span>
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

<script setup lang="ts">
import {
  HEATMAP_TOOLTIP_HEIGHT,
  HEATMAP_TOOLTIP_WIDTH,
  type HoverInfo,
  type ValueFormatter,
  computeTooltipPosition,
  defaultHeatmapFormat,
  resolveHeatmapSeriesId,
} from '@wick-charts/core';
import { computed, onMounted, onUnmounted, ref } from 'vue';

import { useCrosshairPosition } from '../composables';
import { useChartInstance } from '../context';

const props = defineProps<{
  /**
   * Owning series id. **Optional** — when omitted, the first visible heatmap
   * series is picked.
   */
  seriesId?: string;
  /** Custom formatter for the cell value. Default: plain integers, compact decimals. */
  format?: ValueFormatter;
}>();

const effectiveFormat = computed<ValueFormatter>(() => props.format ?? defaultHeatmapFormat);

const chart = useChartInstance();
const crosshair = useCrosshairPosition(chart);

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

const theme = computed(() => {
  // `setTheme` fires `overlayChange`; read `bump` so this computed picks up
  // runtime theme swaps instead of freezing on the first-render snapshot.
  void bump.value;

  return chart.getTheme();
});
const resolvedId = computed<string | null>(() => {
  void bump.value;

  return resolveHeatmapSeriesId(chart, props.seriesId);
});

const info = computed<HoverInfo | null>(() => {
  void crosshair.value;
  void bump.value;
  if (resolvedId.value === null) return null;

  return chart.getHoverInfo(resolvedId.value);
});

const meterWidth = computed(() => {
  if (!info.value) return 0;

  return Math.max(2, Math.min(100, info.value.percent));
});

const tooltipPos = computed(() => {
  if (!crosshair.value || !info.value) return null;
  const mediaSize = chart.getMediaSize();

  return computeTooltipPosition({
    x: crosshair.value.mediaX,
    y: crosshair.value.mediaY,
    chartWidth: mediaSize.width,
    chartHeight: mediaSize.height,
    tooltipWidth: HEATMAP_TOOLTIP_WIDTH,
    tooltipHeight: HEATMAP_TOOLTIP_HEIGHT,
    offsetX: 16,
    offsetY: 16,
  });
});
</script>

<template>
  <div
    v-if="info && crosshair && tooltipPos"
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
      <span :style="{ marginLeft: 'auto', fontWeight: 600 }">{{ effectiveFormat(info.value) }}</span>
    </div>
    <div
      :style="{
        position: 'relative',
        height: '4px',
        borderRadius: '2px',
        background: theme.tooltip.borderColor,
        overflow: 'hidden',
      }"
    >
      <div
        :style="{
          position: 'absolute',
          inset: '0',
          width: meterWidth + '%',
          borderRadius: '2px',
          background: info.color,
        }"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { formatTime } from '@wick-charts/core';
import { computed, onMounted, onUnmounted, ref } from 'vue';

import { useCrosshairPosition } from '../composables';
import { useChartInstance } from '../context';

const chart = useChartInstance();
const position = useCrosshairPosition(chart);

// `setTheme` fires `overlayChange`; bump re-runs the theme computed so the
// label colors track a runtime theme swap instead of freezing on the
// first-render snapshot (matches Tooltip/PieTooltip).
const bump = ref(0);
const onOverlayChange = () => {
  bump.value++;
};
onMounted(() => chart.on('overlayChange', onOverlayChange));
onUnmounted(() => chart.off('overlayChange', onOverlayChange));

const theme = computed(() => {
  void bump.value;

  return chart.getTheme();
});
const dataInterval = computed(() => chart.getDataInterval());
// Format the time pill at the axis's *resolved* tick granularity, not the raw
// data interval — otherwise a time-of-day badge floats among date labels when
// zoomed out. Falls back to dataInterval on a degenerate range.
const tickInterval = computed(
  () => chart.timeScale.niceTickValues(dataInterval.value).tickInterval || dataInterval.value,
);

const labelStyle = computed(() => ({
  // Blend the theme's labelBackground at 80% opacity so the axis grid
  // shows through — keeps the badge from looking like an opaque block
  // while still masking whatever tick sits underneath.
  background: `color-mix(in srgb, ${theme.value.crosshair.labelBackground} 80%, transparent)`,
  color: theme.value.crosshair.labelTextColor,
  fontSize: theme.value.axis.fontSize + 'px',
  fontFamily: theme.value.typography.fontFamily,
  fontVariantNumeric: 'tabular-nums' as const,
  padding: '2px 6px',
  borderRadius: '2px',
  whiteSpace: 'nowrap' as const,
  pointerEvents: 'none' as const,
  // Sit above axis ticks (z:0) but below the YLabel badge (z:3) so the
  // live last-value stays visible when the crosshair crosses its row.
  zIndex: 2,
}));
</script>

<template>
  <template v-if="position">
    <!-- Y label on right axis -->
    <div
      :style="{
        position: 'absolute',
        right: '0',
        top: position.mediaY + 'px',
        transform: 'translateY(-50%)',
        ...labelStyle,
      }"
    >
      {{ chart.yScale.formatY(position.y) }}
    </div>
    <!-- Time label on bottom axis -->
    <div
      :style="{
        position: 'absolute',
        bottom: '0',
        left: position.mediaX + 'px',
        transform: 'translateX(-50%)',
        ...labelStyle,
      }"
    >
      {{ formatTime(position.time, tickInterval) }}
    </div>
  </template>
</template>

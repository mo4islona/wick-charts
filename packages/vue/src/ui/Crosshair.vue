<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';

import { vAxisLabelCover } from '../axis-label-cover';
import { useCrosshairPosition } from '../composables';
import { useChartInstance } from '../context';
import NumberText from './NumberText.vue';

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
// The chart reads the live range and data, which Vue can't track: `position` re-runs it
// on each move (a wheel-zoom re-emits the crosshair), `bump` after a data or formatter change.
const xLabel = computed(() => {
  void bump.value;
  const pos = position.value;

  return pos === null ? null : chart.getCrosshairXLabel(pos);
});

// One value label per named scale's axis column, each read through its own scale.
// `bump` re-labels a still crosshair after a formatter or scale change.
const defaultLabel = computed(() => {
  void bump.value;
  const pos = position.value;

  return pos === null ? '' : chart.yScale.formatY(pos.y);
});

const scaleLabels = computed(() => {
  void bump.value;
  const pos = position.value;
  if (pos === null) return [];

  return chart.getYScaleIds().flatMap((scale) => {
    const column = chart.getYScaleColumn(scale);
    if (column === null) return [];

    const yScale = chart.getYScale(scale);

    return [{ scale, position: column.position, text: yScale.formatY(yScale.yToValue(pos.mediaY)) }];
  });
});
// A named scale can own the default axis's side when the default axis is hidden.
const defaultSideTaken = computed(() => scaleLabels.value.some((label) => label.position === chart.yAxisPosition));

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
    <!-- Y label on the value axis -->
    <div
      v-if="!defaultSideTaken"
      v-axis-label-cover="chart"
      :style="{
        position: 'absolute',
        [chart.yAxisPosition]: '0',
        top: position.mediaY + 'px',
        transform: 'translateY(-50%)',
        ...labelStyle,
      }"
    >
      <NumberText :text="defaultLabel" :mute="false" />
    </div>
    <div
      v-for="label in scaleLabels"
      :key="label.scale"
      v-axis-label-cover="chart"
      :style="{
        position: 'absolute',
        [label.position]: '0',
        top: position.mediaY + 'px',
        transform: 'translateY(-50%)',
        ...labelStyle,
      }"
    >
      <NumberText :text="label.text" :mute="false" />
    </div>
    <!-- Time label on bottom axis -->
    <div
      v-if="xLabel"
      v-axis-label-cover="chart"
      :style="{
        position: 'absolute',
        left: xLabel.left + 'px',
        bottom: xLabel.bottom + 'px',
        transform: xLabel.transform,
        ...labelStyle,
      }"
    >
      {{ xLabel.text }}
    </div>
  </template>
</template>

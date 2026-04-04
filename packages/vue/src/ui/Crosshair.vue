<script setup lang="ts">
import { computed } from 'vue';
import { formatTime } from '@wick-charts/core';
import { useChartInstance } from '../context';
import { useCrosshairPosition } from '../composables';

const chart = useChartInstance();
const position = useCrosshairPosition(chart);

const theme = computed(() => chart.getTheme());
const dataInterval = computed(() => chart.getDataInterval());

const labelStyle = computed(() => ({
  background: theme.value.crosshair.labelBackground,
  color: theme.value.crosshair.labelTextColor,
  fontSize: theme.value.typography.axisFontSize + 'px',
  fontFamily: theme.value.typography.fontFamily,
  padding: '2px 6px',
  borderRadius: '2px',
  whiteSpace: 'nowrap' as const,
  pointerEvents: 'none' as const,
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
      {{ formatTime(position.time, dataInterval) }}
    </div>
  </template>
</template>

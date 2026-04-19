<script setup lang="ts">
import type { ValueFormatter } from '@wick-charts/core';
import { computed, onMounted, onUnmounted, watch } from 'vue';

import { useVisibleRange } from '../composables';
import { useChartInstance } from '../context';

const props = defineProps<{
  /** Custom tick-label formatter. Overrides the built-in range-adaptive default. */
  format?: ValueFormatter;
}>();

interface TrackedTick {
  opacity: number;
  addedAt: number;
}

const chart = useChartInstance();
// Subscribe to visible range to trigger re-renders on viewport changes
const visibleRange = useVisibleRange(chart);

// Route the formatter through yScale so Crosshair / YLabel fallback use the
// same function as the axis labels. Otherwise the crosshair readout would
// keep showing the built-in range-adaptive format.
onMounted(() => {
  if (props.format) chart.yScale.setFormat(props.format);
});
watch(
  () => props.format,
  (fn) => chart.yScale.setFormat(fn ?? null),
);
onUnmounted(() => chart.yScale.setFormat(null));

const tickMap = new Map<number, TrackedTick>();

const theme = computed(() => chart.getTheme());

const allTicks = computed(() => {
  // Access visibleRange.value to track dependency
  void visibleRange.value;

  const currentTicks = chart.yScale.niceTickValues();
  const currentSet = new Set(currentTicks);
  const now = performance.now();

  // Mark current ticks as visible
  for (const p of currentTicks) {
    if (!tickMap.has(p)) {
      tickMap.set(p, { opacity: 1, addedAt: now });
    } else {
      tickMap.get(p)!.opacity = 1;
    }
  }

  // Mark missing ticks for fade-out
  for (const [p, entry] of tickMap) {
    if (!currentSet.has(p)) {
      entry.opacity = 0;
    }
  }

  // Clean up old faded-out ticks
  for (const [p, entry] of tickMap) {
    if (entry.opacity === 0 && now - entry.addedAt > 5000) {
      tickMap.delete(p);
    }
  }

  return Array.from(tickMap.entries());
});
</script>

<template>
  <div
    :style="{
      position: 'absolute',
      right: '0',
      top: '0',
      bottom: chart.xAxisHeight + 'px',
      width: chart.yAxisWidth + 'px',
      pointerEvents: 'none',
    }"
  >
    <span
      v-for="[price, entry] in allTicks"
      :key="price"
      :style="{
        position: 'absolute',
        right: '8px',
        top: chart.yScale.valueToY(price) + 'px',
        transform: 'translateY(-50%)',
        color: theme.axis.textColor,
        fontSize: theme.typography.axisFontSize + 'px',
        fontFamily: theme.typography.fontFamily,
        fontVariantNumeric: 'tabular-nums',
        userSelect: 'none',
        opacity: entry.opacity,
        transition: 'opacity 0.3s ease',
        willChange: 'opacity',
      }"
    >
      {{ chart.yScale.formatY(price) }}
    </span>
  </div>
</template>

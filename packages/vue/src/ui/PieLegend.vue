<script setup lang="ts">
import { type ChartInstance, type SliceInfo, type ValueFormatter, formatCompact } from '@wick-charts/core';
import { computed, onMounted, onUnmounted, ref, useSlots } from 'vue';

import { useChartInstance, useTheme } from '../context';

type PieLegendMode = 'value' | 'percent' | 'both';

const props = withDefaults(
  defineProps<{
    /**
     * Owning series id. **Optional** — when omitted, the first visible pie
     * series is picked.
     */
    seriesId?: string;
    /** 'value' shows only the value, 'percent' only the percent, 'both' shows both. Default: 'both'. */
    mode?: PieLegendMode;
    /** Custom formatter for the absolute slice value. */
    format?: ValueFormatter;
  }>(),
  {
    mode: undefined,
    format: undefined,
  },
);

defineSlots<{
  default?(ctx: { slices: readonly SliceInfo[]; mode: PieLegendMode; format: ValueFormatter }): unknown;
}>();

const resolvedMode = computed<PieLegendMode>(() => props.mode ?? 'both');
const resolvedFormat = computed<ValueFormatter>(() => props.format ?? formatCompact);

const chart = useChartInstance();
const themeRef = useTheme();
const slots = useSlots();
const hasCustomSlot = computed(() => typeof slots.default === 'function');

const bump = ref(0);
const handler = () => {
  bump.value++;
};
onMounted(() => {
  chart.on('overlayChange', handler);
  if (chart.getSeriesIds().length > 0) bump.value++;
});
onUnmounted(() => {
  chart.off('overlayChange', handler);
});

function resolvePieSeriesId(c: ChartInstance, explicit: string | undefined): string | null {
  if (explicit !== undefined) return explicit;

  const pies = c.getSeriesIdsByType('pie', { visibleOnly: true });

  return pies.length > 0 ? pies[0] : null;
}

const theme = computed(() => themeRef.value);
const resolvedId = computed<string | null>(() => {
  void bump.value;

  return resolvePieSeriesId(chart, props.seriesId);
});
const slices = computed<readonly SliceInfo[]>(() => {
  void bump.value;
  if (resolvedId.value === null) return [];

  return chart.getSliceInfo(resolvedId.value) ?? [];
});
</script>

<template>
  <slot
    v-if="hasCustomSlot && slices.length > 0"
    :slices="slices"
    :mode="resolvedMode"
    :format="resolvedFormat"
  />
  <div
    v-else-if="slices.length > 0"
    :style="{
      display: 'flex',
      flexDirection: 'column',
      gap: '6px',
      padding: '8px 12px',
      fontFamily: theme.typography.fontFamily,
      fontSize: theme.typography.fontSize + 'px',
      color: theme.tooltip.textColor,
      pointerEvents: 'auto',
    }"
  >
    <div
      v-for="(slice, i) in slices"
      :key="i"
      :style="{ display: 'flex', alignItems: 'center', gap: '10px' }"
    >
      <span :style="{ width: '10px', height: '10px', borderRadius: '50%', background: slice.color, flexShrink: 0 }" />
      <span :style="{ flex: 1, opacity: 0.8 }">{{ slice.label }}</span>
      <span
        v-if="resolvedMode === 'value' || resolvedMode === 'both'"
        :style="{
          fontWeight: 600,
          fontVariantNumeric: 'tabular-nums',
          minWidth: resolvedMode === 'value' ? '40px' : undefined,
          textAlign: 'right',
        }"
      >
        {{ resolvedFormat(slice.value) }}
      </span>
      <span
        v-if="resolvedMode === 'percent' || resolvedMode === 'both'"
        :style="{
          opacity: resolvedMode === 'percent' ? 1 : 0.5,
          fontWeight: resolvedMode === 'percent' ? 600 : 400,
          fontSize: (resolvedMode === 'percent' ? theme.typography.fontSize : theme.axis.fontSize) + 'px',
          fontVariantNumeric: 'tabular-nums',
          minWidth: '40px',
          textAlign: 'right',
        }"
      >
        {{ slice.percent.toFixed(1) }}%
      </span>
    </div>
  </div>
</template>

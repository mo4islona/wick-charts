<script setup lang="ts">
import type { ChartInstance, ValueFormatter } from '@wick-charts/core';
import { computed, onMounted, onUnmounted, ref, useSlots } from 'vue';

import { useChartInstance } from '../context';
import NumberFlow from './NumberFlow.vue';

/** Direction of the current value vs. previous close. Drives the badge color in the default UI. */
export type YLabelDirection = 'up' | 'down' | 'neutral';

const props = defineProps<{
  /**
   * Owning series id. **Optional** — when omitted, the first visible
   * single-layer time series is picked, falling back to the first visible
   * multi-layer time series.
   */
  seriesId?: string;
  color?: string;
  /** Custom formatter; routed through NumberFlow's `formatter` so the digit animation still plays. */
  format?: ValueFormatter;
}>();

defineSlots<{
  default?(ctx: {
    value: number;
    y: number;
    bgColor: string;
    isLive: boolean;
    direction: YLabelDirection;
    format: ValueFormatter;
  }): unknown;
}>();

const chart = useChartInstance();
const slots = useSlots();
const hasCustomSlot = computed(() => typeof slots.default === 'function');

// Single subscription covering data/visibility/theme/options changes, plus
// viewportChange for pixel-Y drift on pan/zoom where the value is unchanged
// but the badge must move.
const bump = ref(0);
const onChange = () => {
  bump.value++;
};

onMounted(() => {
  chart.setYLabel(true);
  chart.on('overlayChange', onChange);
  chart.on('viewportChange', onChange);
  if (chart.getSeriesIds().length > 0) bump.value++;
});

onUnmounted(() => {
  chart.setYLabel(false);
  chart.off('overlayChange', onChange);
  chart.off('viewportChange', onChange);
});

function resolveSeriesId(c: ChartInstance, explicit: string | undefined): string | null {
  if (explicit !== undefined) return explicit;

  const singleLayer = c.getSeriesIdsByType('time', { visibleOnly: true, singleLayerOnly: true });
  if (singleLayer.length > 0) return singleLayer[0];

  const anyTime = c.getSeriesIdsByType('time', { visibleOnly: true });

  return anyTime.length > 0 ? anyTime[0] : null;
}

const resolvedId = computed<string | null>(() => {
  void bump.value;

  return resolveSeriesId(chart, props.seriesId);
});

const last = computed<{ value: number; isLive: boolean } | null>(() => {
  void bump.value;

  return resolvedId.value !== null ? chart.getStackedLastValue(resolvedId.value) : null;
});

const previousClose = computed<number | null>(() => {
  void bump.value;

  return resolvedId.value !== null ? chart.getPreviousClose(resolvedId.value) : null;
});

const theme = computed(() => {
  void bump.value;

  return chart.getTheme();
});

const y = computed(() => {
  void bump.value;
  if (last.value === null) return 0;

  return chart.yScale.valueToY(last.value.value);
});

const direction = computed<YLabelDirection>(() => {
  if (last.value === null || previousClose.value === null) return 'neutral';
  if (last.value.value > previousClose.value) return 'up';
  if (last.value.value < previousClose.value) return 'down';

  return 'neutral';
});

const bgColor = computed<string>(() => {
  if (last.value === null) return theme.value.yLabel.neutralBackground;
  if (!last.value.isLive) return theme.value.axis.textColor;
  if (props.color) return props.color;

  switch (direction.value) {
    case 'up':
      return theme.value.yLabel.upBackground;
    case 'down':
      return theme.value.yLabel.downBackground;
    default:
      return theme.value.yLabel.neutralBackground;
  }
});

const fractionDigits = computed(() => {
  void bump.value;
  const yRange = chart.yScale.getRange();
  const range = yRange.max - yRange.min;
  if (range < 0.1) return 6;
  if (range < 10) return 4;
  if (range < 1000) return 2;

  return 0;
});

const effectiveFormat = computed<ValueFormatter>(() => {
  if (props.format) return props.format;
  const nf = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: fractionDigits.value,
    maximumFractionDigits: fractionDigits.value,
    useGrouping: false,
  });

  return (v: number) => nf.format(v);
});
</script>

<template>
  <template v-if="last !== null">
    <slot
      v-if="hasCustomSlot"
      :value="last.value"
      :y="y"
      :bg-color="bgColor"
      :is-live="last.isLive"
      :direction="direction"
      :format="effectiveFormat"
    />
    <template v-else>
      <div
        :style="{
          position: 'absolute',
          left: '0',
          right: chart.yAxisWidth + 'px',
          top: y + 'px',
          height: '0',
          borderTop: '1px dashed ' + bgColor,
          opacity: 0.5,
          pointerEvents: 'none',
          zIndex: 2,
        }"
      />
      <div
        :style="{
          position: 'absolute',
          right: '4px',
          top: y + 'px',
          transform: 'translateY(-50%)',
          pointerEvents: 'auto',
          zIndex: 3,
          background: bgColor,
          color: theme.yLabel.textColor,
          fontSize: theme.yLabel.fontSize + 'px',
          fontFamily: theme.typography.fontFamily,
          padding: '3px 8px',
          borderRadius: '3px',
          whiteSpace: 'nowrap',
          transition: 'background-color 0.3s ease',
        }"
      >
        <NumberFlow :value="last.value" :format="effectiveFormat" :spin-duration="350" />
      </div>
    </template>
  </template>
</template>

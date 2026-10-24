<script setup lang="ts">
import type { ReferenceLineStyle, TimeValue } from '@wick-charts/core';
import { onMounted, onUnmounted, watch } from 'vue';

import { useChartInstance } from '../context';

const props = defineProps<{
  /** Horizontal line at this Y data value. Mutually exclusive with `time`. */
  value?: number;
  /** Vertical line at this `time` (epoch ms or `Date`). Mutually exclusive with `value`; wins when both are set. */
  time?: TimeValue;
  /** Line and label-chip accent color. Default: the theme line color. */
  color?: string;
  /** Optional text label drawn in an annotation chip at the line's near end. */
  label?: string;
  /** Dash style. Default: `'dashed'`. */
  style?: ReferenceLineStyle;
  /** Stroke width in CSS pixels. Default: `1`. */
  width?: number;
  /** Named Y scale (`ChartContainer` `scales`) the `value` maps through. Default: the default scale. */
  scale?: string;
}>();

const chart = useChartInstance();
let lineId: string | null = null;

onMounted(() => {
  lineId = chart.addLine({
    value: props.value,
    time: props.time,
    color: props.color,
    label: props.label,
    style: props.style,
    width: props.width,
    scale: props.scale,
  });
});

onUnmounted(() => {
  if (lineId !== null) chart.removeLine(lineId);
  lineId = null;
});

watch(
  () => [props.value, props.time, props.color, props.label, props.style, props.width, props.scale],
  () => {
    if (lineId === null) return;

    chart.updateLine(lineId, {
      value: props.value,
      time: props.time,
      color: props.color,
      label: props.label,
      style: props.style,
      width: props.width,
      scale: props.scale,
    });
  },
);
</script>

<template><span v-if="false" /></template>

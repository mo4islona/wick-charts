<script setup lang="ts">
import type { ReferenceLineStyle } from '@wick-charts/core';
import { onMounted, onUnmounted, watch } from 'vue';

import { useChartInstance } from '../context';
import type { ReferenceLineProps } from './props';

const props = defineProps<ReferenceLineProps>();

const chart = useChartInstance();
let lineId: string | null = null;
let warnedStyle = false;

/** `lineStyle`, else a bound `style`; a static `style` attribute arrives parsed as CSS and is not a dash style. */
function dashStyle(): ReferenceLineStyle | undefined {
  if (props.lineStyle !== undefined) return props.lineStyle;

  const style: unknown = props.style;
  if (style === 'solid' || style === 'dashed') return style;

  if (style !== undefined && !warnedStyle) {
    warnedStyle = true;
    console.warn(
      '[wick-charts] ReferenceLine: a static `style` attribute reaches Vue as CSS; use `lineStyle="dashed"`.',
    );
  }

  return undefined;
}

onMounted(() => {
  lineId = chart.addLine({
    value: props.value,
    time: props.time,
    color: props.color,
    label: props.label,
    style: dashStyle(),
    width: props.width,
    scale: props.scale,
  });
});

onUnmounted(() => {
  if (lineId !== null) chart.removeLine(lineId);
  lineId = null;
});

watch(
  () => [props.value, props.time, props.color, props.label, props.lineStyle, props.style, props.width, props.scale],
  () => {
    if (lineId === null) return;

    chart.updateLine(lineId, {
      value: props.value,
      time: props.time,
      color: props.color,
      label: props.label,
      style: dashStyle(),
      width: props.width,
      scale: props.scale,
    });
  },
);
</script>

<template><span v-if="false" /></template>

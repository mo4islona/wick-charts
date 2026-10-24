<script setup lang="ts">
import { onMounted, onUnmounted, watch } from 'vue';

import { useChartInstance } from '../context';
import type { ReferenceLineProps } from './props';

const props = defineProps<ReferenceLineProps>();

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

<script setup lang="ts">
import { onMounted, onUnmounted, watch } from 'vue';

import { useChartInstance } from '../context';
import type { MarkerProps } from './props';

const props = defineProps<MarkerProps>();

const chart = useChartInstance();
let markerId: string | null = null;

onMounted(() => {
  markerId = chart.addMarker({
    time: props.time,
    value: props.value,
    seriesId: props.seriesId,
    shape: props.shape,
    pulse: props.pulse,
    label: props.label,
    color: props.color,
    scale: props.scale,
  });
});

onUnmounted(() => {
  if (markerId !== null) chart.removeMarker(markerId);
  markerId = null;
});

watch(
  () => [props.time, props.value, props.seriesId, props.shape, props.pulse, props.label, props.color, props.scale],
  () => {
    if (markerId === null) return;

    chart.updateMarker(markerId, {
      time: props.time,
      value: props.value,
      seriesId: props.seriesId,
      shape: props.shape,
      pulse: props.pulse,
      label: props.label,
      color: props.color,
      scale: props.scale,
    });
  },
);
</script>

<template><span v-if="false" /></template>

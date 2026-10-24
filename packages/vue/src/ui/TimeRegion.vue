<script setup lang="ts">
import { onMounted, onUnmounted, watch } from 'vue';

import { useChartInstance } from '../context';
import type { TimeRegionProps } from './props';

const props = defineProps<TimeRegionProps>();

const chart = useChartInstance();
let regionId: string | null = null;

onMounted(() => {
  regionId = chart.addRegion({
    from: props.from,
    to: props.to,
    fill: props.fill,
    label: props.label,
    color: props.color,
  });
});

onUnmounted(() => {
  if (regionId !== null) chart.removeRegion(regionId);
  regionId = null;
});

watch(
  () => [props.from, props.to, props.fill, props.label, props.color],
  () => {
    if (regionId === null) return;

    chart.updateRegion(regionId, {
      from: props.from,
      to: props.to,
      fill: props.fill,
      label: props.label,
      color: props.color,
    });
  },
);
</script>

<template><span v-if="false" /></template>

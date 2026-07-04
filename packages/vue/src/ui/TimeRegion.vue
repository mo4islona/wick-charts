<script setup lang="ts">
import type { TimeRegionEnd, TimeValue } from '@wick-charts/core';
import { onMounted, onUnmounted, watch } from 'vue';

import { useChartInstance } from '../context';

const props = defineProps<{
  /** Left edge — epoch ms or a `Date`. */
  from: TimeValue;
  /** Right edge — epoch ms or a `Date`. Omit (or pass `'now'`) for an open-ended band to the right edge. */
  to?: TimeRegionEnd;
  /** Band fill — any CSS color, typically translucent. Default: a faint tint of `color`. */
  fill?: string;
  /** Optional text label drawn in an annotation chip at the top of the band. */
  label?: string;
  /** Edge-line and label-chip accent. Default: the theme's muted axis text color. */
  color?: string;
}>();

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

<script setup lang="ts">
import type { MarkerShape, TimeValue } from '@wick-charts/core';
import { onMounted, onUnmounted, watch } from 'vue';

import { useChartInstance } from '../context';

const props = defineProps<{
  /** X anchor — epoch ms or a `Date`. */
  time: TimeValue;
  /** Y anchor as a data value. Omit and set `seriesId` to snap to that series' value at `time`. */
  value?: number;
  /** Snap Y to this series' value at `time` when `value` is omitted. Also the default color source. */
  seriesId?: string;
  /** Glyph at the anchor. Default: `'dot'`. Arrows point their tip at the anchor. */
  shape?: MarkerShape;
  /** Reuse the line pulse halo around the anchor. Default: `false`. */
  pulse?: boolean;
  /** Optional text label drawn as a callout chip whose tail points at the anchor. */
  label?: string;
  /** Color override. Falls back to the series color (when `seriesId` is set), then the theme line color. */
  color?: string;
}>();

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
  });
});

onUnmounted(() => {
  if (markerId !== null) chart.removeMarker(markerId);
  markerId = null;
});

watch(
  () => [props.time, props.value, props.seriesId, props.shape, props.pulse, props.label, props.color],
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
    });
  },
);
</script>

<template><span v-if="false" /></template>

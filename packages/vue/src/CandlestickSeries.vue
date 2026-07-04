<script setup lang="ts">
import type { CandlestickData, CandlestickSeriesOptions, OHLCInput, SeriesSyncState } from '@wick-charts/core';
import { CandlestickSeriesDef, EMPTY_SYNC_STATE, syncSeriesLayer, toLayers } from '@wick-charts/core';
import { onMounted, onUnmounted, ref, watch } from 'vue';

import { useChartInstance } from './context';

const props = withDefaults(
  defineProps<{
    /** Flat `OHLCInput[]`, or `{ label, data }` to name the stream. */
    data: CandlestickData;
    options?: Partial<CandlestickSeriesOptions>;
    /** Stable series ID — same value across remounts. */
    id?: string;
    /** Show/hide the series without unmounting it — excludes it from the Y-range fit and tooltip/legend. Default `true`. Live. */
    visible?: boolean;
  }>(),
  // Vue's type-based `defineProps` casts an absent Boolean-typed prop to
  // `false` (not `undefined`) without an explicit default — see the
  // `interactive` fix in ChartContainer.vue for the full explanation.
  { visible: true },
);

const chart = useChartInstance();
const seriesId = ref<string | null>(null);
// Sync state — drives the shared append/keepLast/update/replace reconciliation
// so a rolling-window stream eases instead of snapping Y (and a 6–20 candle
// burst takes the smooth append path, matching React's 20-candle threshold).
let prevSync: SeriesSyncState = EMPTY_SYNC_STATE;

function applyData(id: string, data: CandlestickData): void {
  const layer = toLayers<OHLCInput>(data)[0];
  chart.setSeriesLabels(id, [layer.label]);
  prevSync = syncSeriesLayer({ chart, id, data: layer.data, prev: prevSync });
}

onMounted(() => {
  const id = chart.addSeries(CandlestickSeriesDef, {
    ...props.options,
    id: props.id,
    label: toLayers<OHLCInput>(props.data)[0].label,
  });
  seriesId.value = id;
  // Initial data load — Vue's `watch` is lazy by default, so the watcher
  // below only fires on subsequent `data` prop mutations. Explicitly apply
  // the first value here so components with static data render immediately.
  applyData(id, props.data);
  chart.setSeriesVisible(id, props.visible);
});

onUnmounted(() => {
  if (seriesId.value) chart.removeSeries(seriesId.value);
});

watch(
  () => props.data,
  (data) => {
    const id = seriesId.value;
    if (!id) return;

    applyData(id, data);
  },
);

watch(
  () => props.options,
  (options) => {
    if (seriesId.value && options) {
      chart.updateSeriesOptions(seriesId.value, options);
    }
  },
  { deep: true },
);

watch(
  () => props.visible,
  (visible) => {
    if (seriesId.value) chart.setSeriesVisible(seriesId.value, visible);
  },
);
</script>

<template><span v-if="false" /></template>

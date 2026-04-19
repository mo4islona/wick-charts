<script setup lang="ts">
import {
  type LineData,
  type OHLCData,
  type TooltipFormatter,
  formatCompact,
  formatPriceAdaptive,
  formatTime,
} from '@wick-charts/core';
import { computed, inject, onMounted, onUnmounted, ref, watch } from 'vue';

import { useCrosshairPosition } from '../composables';
import { ThemeKey, TooltipLegendAnchorKey, useChartInstance } from '../context';

type TooltipSort = 'none' | 'asc' | 'desc';

interface SeriesSnapshot {
  id: string;
  label?: string;
  data: OHLCData | LineData;
  color: string;
}

const props = withDefaults(
  defineProps<{
    seriesId?: string;
    sort?: TooltipSort;
    format?: TooltipFormatter;
  }>(),
  {
    sort: 'none',
    // For Function-typed props `withDefaults` stores the value as-is — no
    // factory wrapper (otherwise `props.format(...)` returns the inner fn).
    format: (v: number, field: string) => (field === 'volume' ? formatCompact(v) : formatPriceAdaptive(v)),
  },
);

const chart = useChartInstance();
const crosshair = useCrosshairPosition(chart);
const theme = inject(ThemeKey);
const anchor = inject(TooltipLegendAnchorKey);

// Match the "loud failure" contract of other Vue overlays — misuse outside
// `<ChartContainer>` should throw rather than render nothing silently.
if (!theme) {
  throw new Error('<TooltipLegend> must be used within <ChartContainer>: missing ThemeKey.');
}
if (!anchor) {
  throw new Error('<TooltipLegend> must be used within <ChartContainer>: missing TooltipLegendAnchorKey.');
}

// `bump` forces targetIds / snapshots to recompute after sibling series
// register. Without this, a TooltipLegend mounted before its series would
// see `getSeriesIds() === []` and stay empty.
const bump = ref(0);
const targetIds = computed(() => {
  void bump.value;
  return props.seriesId ? [props.seriesId] : chart.getSeriesIds();
});

const primaryId = computed(() => targetIds.value[0] ?? '');
const lastY = ref<{ value: number; isLive: boolean } | null>(
  primaryId.value ? chart.getLastValue(primaryId.value) : null,
);
const dataUpdateHandler = () => {
  const id = primaryId.value;
  lastY.value = id ? chart.getLastValue(id) : null;
};
const seriesChangeHandler = () => {
  bump.value++;
};
onMounted(() => {
  chart.on('dataUpdate', dataUpdateHandler);
  chart.on('seriesChange', seriesChangeHandler);
  // Catch-up: a sibling series' mount effect may have registered data in
  // the same synchronous flush, so poke the computed on mount.
  if (chart.getSeriesIds().length > 0) bump.value++;
});
onUnmounted(() => {
  chart.off('dataUpdate', dataUpdateHandler);
  chart.off('seriesChange', seriesChangeHandler);
});
watch(primaryId, () => dataUpdateHandler());

function sortSnapshots(snapshots: SeriesSnapshot[], sort: TooltipSort): SeriesSnapshot[] {
  if (sort === 'none' || snapshots.length <= 1) return snapshots;
  return [...snapshots].sort((a, b) => {
    const av = 'value' in a.data ? (a.data as LineData).value : (a.data as OHLCData).close;
    const bv = 'value' in b.data ? (b.data as LineData).value : (b.data as OHLCData).close;
    return sort === 'asc' ? av - bv : bv - av;
  });
}

function isOHLC(data: OHLCData | LineData): data is OHLCData {
  return 'open' in data;
}

const snapshots = computed(() => {
  void lastY.value;
  const hover: SeriesSnapshot[] = [];
  if (crosshair.value) {
    const time = crosshair.value.time;
    for (const id of targetIds.value) {
      const layers = chart.getLayerSnapshots(id, time);
      if (layers) {
        for (let i = 0; i < layers.length; i++) {
          hover.push({
            id: `${id}_layer${i}`,
            label: chart.getSeriesLabel(id),
            data: { time, value: layers[i].value } as LineData,
            color: layers[i].color,
          });
        }
        continue;
      }
      const d = chart.getDataAtTime(id, time);
      if (d) hover.push({ id, label: chart.getSeriesLabel(id), data: d, color: chart.getSeriesColor(id) ?? '#888' });
    }
  }
  if (hover.length > 0) return sortSnapshots(hover, props.sort);
  const last: SeriesSnapshot[] = [];
  for (const id of targetIds.value) {
    const d = chart.getLastData(id);
    if (!d) continue;
    const layers = chart.getLayerSnapshots(id, d.time);
    if (layers) {
      for (let i = 0; i < layers.length; i++) {
        last.push({
          id: `${id}_layer${i}`,
          label: chart.getSeriesLabel(id),
          data: { time: d.time, value: layers[i].value } as LineData,
          color: layers[i].color,
        });
      }
      continue;
    }
    last.push({ id, label: chart.getSeriesLabel(id), data: d, color: chart.getSeriesColor(id) ?? '#888' });
  }
  return sortSnapshots(last, props.sort);
});

const dataInterval = computed(() => chart.getDataInterval());
const displayTime = computed(() => (snapshots.value.length === 0 ? 0 : snapshots.value[0].data.time));
</script>

<template>
  <Teleport v-if="anchor && theme && snapshots.length > 0" :to="anchor">
    <div
      data-tooltip-legend=""
      :style="{
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        flexWrap: 'wrap',
        padding: '4px 8px',
        flexShrink: 0,
        fontSize: theme.typography.fontSize + 'px',
        fontFamily: theme.typography.fontFamily,
        fontVariantNumeric: 'tabular-nums',
        opacity: crosshair ? 1 : 0.6,
        transition: 'opacity 0.2s ease',
        pointerEvents: 'none',
      }"
    >
      <span :style="{ color: theme.axis.textColor, marginRight: '2px' }">
        {{ formatTime(displayTime, dataInterval) }}
      </span>
      <template v-for="s in snapshots" :key="s.id">
        <span v-if="isOHLC(s.data)" :style="{ display: 'inline-flex', alignItems: 'center', gap: '4px' }">
          <template
            v-for="cell in [
              { label: 'O', field: 'open' as const, val: (s.data as OHLCData).open },
              { label: 'H', field: 'high' as const, val: (s.data as OHLCData).high },
              { label: 'L', field: 'low' as const, val: (s.data as OHLCData).low },
              { label: 'C', field: 'close' as const, val: (s.data as OHLCData).close },
            ]"
            :key="cell.label"
          >
            <span :style="{ color: theme.axis.textColor, opacity: 0.5, marginLeft: '5px' }">{{ cell.label }}</span>
            <span
              :style="{
                color:
                  (s.data as OHLCData).close >= (s.data as OHLCData).open
                    ? theme.candlestick.upColor
                    : theme.candlestick.downColor,
                fontWeight: 500,
                marginLeft: '2px',
              }"
            >
              {{ props.format(cell.val, cell.field) }}
            </span>
          </template>
          <template v-if="(s.data as OHLCData).volume != null">
            <span :style="{ color: theme.axis.textColor, opacity: 0.5, marginLeft: '5px' }">V</span>
            <span :style="{ color: theme.axis.textColor, fontWeight: 500, marginLeft: '2px' }">
              {{ props.format((s.data as OHLCData).volume!, 'volume') }}
            </span>
          </template>
        </span>
        <span v-else :style="{ display: 'inline-flex', alignItems: 'center', gap: '3px' }">
          <span
            :style="{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: s.color,
              flexShrink: 0,
            }"
          />
          <span :style="{ color: s.color, fontWeight: 500 }">
            {{ props.format((s.data as LineData).value, 'value') }}
          </span>
        </span>
      </template>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { type LineData, type OHLCData, formatDate, formatTime } from '@wick-charts/core';
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';

import { useCrosshairPosition } from '../composables';
import { useChartInstance } from '../context';

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
  }>(),
  {
    sort: 'none',
  },
);

const chart = useChartInstance();
const crosshair = useCrosshairPosition(chart);

// `bump` forces targetIds / hover snapshots to recompute after sibling series
// register. Without a seriesChange subscription, a Tooltip mounted before
// its series would see `getSeriesIds() === []` and never recover.
const bump = ref(0);
const targetIds = computed(() => {
  void bump.value;
  if (props.seriesId) return [props.seriesId];
  return chart.getSeriesIds();
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
  // Catch-up: sibling series' mount effect may have registered data in the
  // same synchronous flush, so poke the computed now.
  if (chart.getSeriesIds().length > 0) bump.value++;
});
onUnmounted(() => {
  chart.off('dataUpdate', dataUpdateHandler);
  chart.off('seriesChange', seriesChangeHandler);
});
watch(primaryId, () => dataUpdateHandler());

const theme = computed(() => chart.getTheme());
const dataInterval = computed(() => chart.getDataInterval());

function sortSnapshots(snapshots: SeriesSnapshot[], sort: TooltipSort): SeriesSnapshot[] {
  if (sort === 'none' || snapshots.length <= 1) return snapshots;
  return [...snapshots].sort((a, b) => {
    const av = 'value' in a.data ? (a.data as LineData).value : (a.data as OHLCData).close;
    const bv = 'value' in b.data ? (b.data as LineData).value : (b.data as OHLCData).close;
    return sort === 'asc' ? av - bv : bv - av;
  });
}

function formatVolume(v: number): string {
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return v.toFixed(0);
}

const hoverSnapshots = computed(() => {
  if (!crosshair.value) return [];
  // Reference `lastY` so streaming `dataUpdate`s invalidate the hovered
  // values too — otherwise the downstream `snapshots` cache yields a stale
  // glass panel until the crosshair moves.
  void lastY.value;
  const time = crosshair.value.time;
  const result: SeriesSnapshot[] = [];
  for (const id of targetIds.value) {
    // Multi-layer series (stacked Line/Bar) expose per-layer snapshots so
    // each stack layer gets its own row — matches React's behavior.
    const layers = chart.getLayerSnapshots(id, time);
    if (layers) {
      for (let i = 0; i < layers.length; i++) {
        result.push({
          id: `${id}_layer${i}`,
          label: chart.getSeriesLabel(id),
          data: { time, value: layers[i].value } as LineData,
          color: layers[i].color,
        });
      }
      continue;
    }
    const d = chart.getDataAtTime(id, time);
    if (d) {
      result.push({
        id,
        label: chart.getSeriesLabel(id),
        data: d,
        color: chart.getSeriesColor(id) ?? '#888',
      });
    }
  }
  return result;
});

const snapshots = computed(() => {
  void lastY.value;
  return sortSnapshots(hoverSnapshots.value, props.sort);
});

const displayTime = computed(() => {
  if (snapshots.value.length === 0) return 0;
  return snapshots.value[0].data.time;
});

const floatingPos = computed(() => {
  if (!crosshair.value || hoverSnapshots.value.length === 0) return null;
  const mediaSize = chart.getMediaSize();
  const hasOHLC = hoverSnapshots.value.some((s) => 'open' in s.data);
  const lineCount = hoverSnapshots.value.filter((s) => !('open' in s.data)).length;

  const tooltipWidth = 160;
  const tooltipHeight = hasOHLC ? 140 : 40 + lineCount * 22;
  const offsetX = 16;
  const offsetY = 16;
  const chartWidth = mediaSize.width - chart.yAxisWidth;
  const chartHeight = mediaSize.height - chart.xAxisHeight;

  const left =
    crosshair.value.mediaX + offsetX + tooltipWidth > chartWidth
      ? crosshair.value.mediaX - offsetX - tooltipWidth
      : crosshair.value.mediaX + offsetX;
  const top =
    crosshair.value.mediaY + offsetY + tooltipHeight > chartHeight
      ? crosshair.value.mediaY - offsetY - tooltipHeight
      : crosshair.value.mediaY + offsetY;

  return { left, top };
});

function isOHLC(data: OHLCData | LineData): data is OHLCData {
  return 'open' in data;
}
</script>

<template>
  <div
    v-if="crosshair && hoverSnapshots.length > 0 && floatingPos"
    :style="{
      position: 'absolute',
      left: floatingPos.left + 'px',
      top: floatingPos.top + 'px',
      pointerEvents: 'none',
      background: theme.tooltip.background,
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      border: '1px solid ' + theme.tooltip.borderColor,
      borderRadius: '8px',
      padding: '10px 14px',
      boxShadow: '0 4px 16px rgba(0,0,0,0.1), 0 1px 4px rgba(0,0,0,0.06)',
      fontSize: theme.typography.tooltipFontSize + 'px',
      fontFamily: theme.typography.fontFamily,
      fontVariantNumeric: 'tabular-nums',
      color: theme.tooltip.textColor,
      minWidth: '140px',
      zIndex: 10,
      transition: 'opacity 0.15s ease',
    }"
  >
    <div
      :style="{
        fontSize: theme.typography.axisFontSize + 'px',
        color: theme.axis.textColor,
        marginBottom: '8px',
        paddingBottom: '6px',
        borderBottom: '1px solid ' + theme.tooltip.borderColor,
        letterSpacing: '0.02em',
      }"
    >
      {{ formatDate(displayTime) }} {{ formatTime(displayTime, dataInterval) }}
    </div>

    <template v-for="s in snapshots" :key="s.id">
      <div
        v-if="isOHLC(s.data)"
        :style="{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px' }"
      >
        <template
          v-for="row in [
            { label: 'Open', val: (s.data as OHLCData).open },
            { label: 'High', val: (s.data as OHLCData).high },
            { label: 'Low', val: (s.data as OHLCData).low },
            { label: 'Close', val: (s.data as OHLCData).close },
          ]"
          :key="row.label"
        >
          <span :style="{ opacity: 0.5 }">{{ row.label }}</span>
          <span
            :style="{
              fontWeight: 600,
              color:
                (s.data as OHLCData).close >= (s.data as OHLCData).open
                  ? theme.candlestick.upColor
                  : theme.candlestick.downColor,
              textAlign: 'right',
            }"
            >{{ row.val.toFixed(2) }}</span
          >
        </template>
        <template v-if="(s.data as OHLCData).volume != null">
          <span :style="{ opacity: 0.5 }">Volume</span>
          <span :style="{ fontWeight: 600, color: theme.tooltip.textColor, textAlign: 'right' }">
            {{ formatVolume((s.data as OHLCData).volume!) }}
          </span>
        </template>
      </div>
      <div
        v-else
        :style="{ display: 'flex', alignItems: 'center', gap: '8px', padding: '2px 0' }"
      >
        <span
          :style="{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: s.color,
            flexShrink: 0,
          }"
        />
        <span :style="{ opacity: 0.6, flex: '1' }">{{ s.label ?? 'Value' }}</span>
        <span :style="{ fontWeight: 600, color: s.color }">
          {{ (s.data as LineData).value.toFixed(2) }}
        </span>
      </div>
    </template>
  </div>
</template>

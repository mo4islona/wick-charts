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

const targetIds = computed(() => {
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
onMounted(() => chart.on('dataUpdate', dataUpdateHandler));
onUnmounted(() => chart.off('dataUpdate', dataUpdateHandler));
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
  if (v >= 1e9) return (v / 1e9).toFixed(2) + 'B';
  if (v >= 1e6) return (v / 1e6).toFixed(2) + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K';
  return v.toFixed(0);
}

const hoverSnapshots = computed(() => {
  if (!crosshair.value) return [];
  const result: SeriesSnapshot[] = [];
  for (const id of targetIds.value) {
    const d = chart.getDataAtTime(id, crosshair.value.time);
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

  if (hoverSnapshots.value.length > 0) {
    return sortSnapshots(hoverSnapshots.value, props.sort);
  }

  const lastSnapshots: SeriesSnapshot[] = [];
  for (const id of targetIds.value) {
    const d = chart.getLastData(id);
    if (d) {
      lastSnapshots.push({
        id,
        label: chart.getSeriesLabel(id),
        data: d,
        color: chart.getSeriesColor(id) ?? '#888',
      });
    }
  }
  return sortSnapshots(lastSnapshots, props.sort);
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
  <template v-if="snapshots.length > 0">
    <!-- Compact legend (top-left, always visible) -->
    <div
      :style="{
        position: 'absolute',
        top: '24px',
        left: '8px',
        pointerEvents: 'none',
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        flexWrap: 'wrap',
        maxWidth: '70%',
        fontSize: theme.typography.fontSize + 'px',
        fontFamily: theme.typography.fontFamily,
        fontVariantNumeric: 'tabular-nums',
        opacity: crosshair ? 1 : 0.6,
        transition: 'opacity 0.2s ease',
      }"
    >
      <span :style="{ color: theme.axis.textColor, marginRight: '2px' }">
        {{ formatTime(displayTime, dataInterval) }}
      </span>
      <template v-for="s in snapshots" :key="s.id">
        <!-- OHLC legend -->
        <span v-if="isOHLC(s.data)" :style="{ display: 'inline-flex', alignItems: 'center', gap: '4px' }">
          <template v-for="field in (['O', 'H', 'L', 'C'] as const)" :key="field">
            <span :style="{ color: theme.axis.textColor, opacity: 0.5, marginLeft: '5px' }">{{ field }}</span>
            <span
              :style="{
                color: (s.data as OHLCData).close >= (s.data as OHLCData).open ? theme.candlestick.upColor : theme.candlestick.downColor,
                fontWeight: 500,
                marginLeft: '2px',
              }"
            >
              {{ ({ O: (s.data as OHLCData).open, H: (s.data as OHLCData).high, L: (s.data as OHLCData).low, C: (s.data as OHLCData).close })[field].toFixed(2) }}
            </span>
          </template>
          <template v-if="(s.data as OHLCData).volume != null">
            <span :style="{ color: theme.axis.textColor, opacity: 0.5, marginLeft: '5px' }">V</span>
            <span :style="{ color: theme.axis.textColor, fontWeight: 500, marginLeft: '2px' }">
              {{ formatVolume((s.data as OHLCData).volume!) }}
            </span>
          </template>
        </span>
        <!-- Line legend -->
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
            {{ (s.data as LineData).value.toFixed(2) }}
          </span>
        </span>
      </template>
    </div>

    <!-- Floating tooltip (near cursor, only on hover) -->
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
      <!-- Time header -->
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
        <!-- OHLC floating -->
        <div
          v-if="isOHLC(s.data)"
          :style="{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px' }"
        >
          <template v-for="row in [
            { label: 'Open', val: (s.data as OHLCData).open },
            { label: 'High', val: (s.data as OHLCData).high },
            { label: 'Low', val: (s.data as OHLCData).low },
            { label: 'Close', val: (s.data as OHLCData).close },
          ]" :key="row.label">
            <span :style="{ opacity: 0.5 }">{{ row.label }}</span>
            <span
              :style="{
                fontWeight: 600,
                color: (s.data as OHLCData).close >= (s.data as OHLCData).open
                  ? theme.candlestick.upColor
                  : theme.candlestick.downColor,
                textAlign: 'right',
              }"
            >{{ row.val.toFixed(2) }}</span>
          </template>
          <template v-if="(s.data as OHLCData).volume != null">
            <span :style="{ opacity: 0.5 }">Volume</span>
            <span :style="{ fontWeight: 600, color: theme.tooltip.textColor, textAlign: 'right' }">
              {{ formatVolume((s.data as OHLCData).volume!) }}
            </span>
          </template>
        </div>
        <!-- Line floating -->
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
</template>

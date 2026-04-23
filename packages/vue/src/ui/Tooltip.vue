<script setup lang="ts">
import {
  type OHLCData,
  type SeriesSnapshot,
  type SnapshotSort,
  type TimePoint,
  type TooltipFormatter,
  buildHoverSnapshots,
  computeTooltipPosition,
  formatCompact,
  formatDate,
  formatPriceAdaptive,
  formatTime,
  resolveCandlestickBodyColor,
} from '@wick-charts/core';
import { computed, onMounted, onUnmounted, ref, useSlots, watchEffect } from 'vue';

import { useCrosshairPosition } from '../composables';
import { useChartInstance } from '../context';

const props = defineProps<{
  sort?: SnapshotSort;
  format?: TooltipFormatter;
}>();

defineSlots<{
  default?(ctx: { snapshots: readonly SeriesSnapshot[]; time: number }): unknown;
}>();

// Vue's `withDefaults` is inconsistent for function-typed props (sometimes
// treats the default as a factory, sometimes as the value). Use a computed
// fallback instead.
const effectiveSort = computed<SnapshotSort>(() => props.sort ?? 'none');
const effectiveFormat = computed<TooltipFormatter>(
  () =>
    props.format ?? ((v: number, field: string) => (field === 'volume' ? formatCompact(v) : formatPriceAdaptive(v))),
);

const chart = useChartInstance();
const crosshair = useCrosshairPosition(chart);

// `bump` re-runs computed values on any overlay-relevant chart mutation.
const bump = ref(0);
const onOverlayChange = () => {
  bump.value++;
};
onMounted(() => {
  chart.on('overlayChange', onOverlayChange);
  if (chart.getSeriesIds().length > 0) bump.value++;
});
onUnmounted(() => {
  chart.off('overlayChange', onOverlayChange);
});

const theme = computed(() => chart.getTheme());
const dataInterval = computed(() => chart.getDataInterval());

const snapshots = computed<readonly SeriesSnapshot[]>(() => {
  void bump.value;
  if (!crosshair.value) return [];

  return buildHoverSnapshots(chart, {
    time: crosshair.value.time,
    sort: effectiveSort.value,
    cacheKey: 'tooltip',
  });
});

// `crosshair.time` is the semantic truth — `snapshots[0].data.time` would
// shift with `sort` and, for ragged multi-layer data, disagree with the
// actual hover moment.
const displayTime = computed(() => crosshair.value?.time ?? 0);

const slots = useSlots();
const hasCustomSlot = computed(() => typeof slots.default === 'function');

const containerRef = ref<HTMLDivElement | null>(null);
const measuredSize = ref<{ width: number; height: number } | null>(null);

// `ResizeObserver` on the custom-render container — unknown content dimensions
// mean we can't pre-compute `tooltipWidth/Height` for `computeTooltipPosition`.
// Measure on mount + any content change, then flip `visibility` to visible.
let observer: ResizeObserver | null = null;
watchEffect((onCleanup) => {
  if (!hasCustomSlot.value) return;
  const node = containerRef.value;
  if (!node || typeof ResizeObserver === 'undefined') return;

  observer = new ResizeObserver((entries) => {
    const box = entries[0]?.contentRect;
    if (!box) return;
    const prev = measuredSize.value;
    if (!prev || prev.width !== box.width || prev.height !== box.height) {
      measuredSize.value = { width: box.width, height: box.height };
    }
  });
  observer.observe(node);

  onCleanup(() => {
    observer?.disconnect();
    observer = null;
  });
});

const floatingPos = computed<{ left: number; top: number } | null>(() => {
  if (!crosshair.value || snapshots.value.length === 0) return null;
  const mediaSize = chart.getMediaSize();
  const chartWidth = mediaSize.width - chart.yAxisWidth;
  const chartHeight = mediaSize.height - chart.xAxisHeight;

  if (hasCustomSlot.value) {
    const size = measuredSize.value;
    if (!size) return { left: 0, top: 0 };

    return computeTooltipPosition({
      x: crosshair.value.mediaX,
      y: crosshair.value.mediaY,
      chartWidth,
      chartHeight,
      tooltipWidth: size.width,
      tooltipHeight: size.height,
    });
  }

  const hasOHLC = snapshots.value.some((s) => 'open' in s.data);
  const lineCount = snapshots.value.filter((s) => !('open' in s.data)).length;
  const tooltipWidth = 160;
  const tooltipHeight = hasOHLC ? 140 : 40 + lineCount * 22;

  return computeTooltipPosition({
    x: crosshair.value.mediaX,
    y: crosshair.value.mediaY,
    chartWidth,
    chartHeight,
    tooltipWidth,
    tooltipHeight,
  });
});

const measured = computed(() => !hasCustomSlot.value || measuredSize.value !== null);

function isOHLC(data: OHLCData | TimePoint): data is OHLCData {
  return 'open' in data;
}
</script>

<template>
  <div
    v-if="crosshair && snapshots.length > 0 && floatingPos && !hasCustomSlot"
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
      fontSize: theme.tooltip.fontSize + 'px',
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
        fontSize: theme.axis.fontSize + 'px',
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
      <div v-if="isOHLC(s.data)" :style="{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px' }">
        <template
          v-for="row in [
            { label: 'Open', val: (s.data as OHLCData).open, field: 'open' as const },
            { label: 'High', val: (s.data as OHLCData).high, field: 'high' as const },
            { label: 'Low', val: (s.data as OHLCData).low, field: 'low' as const },
            { label: 'Close', val: (s.data as OHLCData).close, field: 'close' as const },
          ]"
          :key="row.label"
        >
          <span :style="{ opacity: 0.5 }">{{ row.label }}</span>
          <span
            :style="{
              fontWeight: 600,
              color: resolveCandlestickBodyColor(
                (s.data as OHLCData).close >= (s.data as OHLCData).open
                  ? theme.candlestick.up.body
                  : theme.candlestick.down.body,
              ),
              textAlign: 'right',
            }"
          >{{ effectiveFormat(row.val, row.field) }}</span>
        </template>
        <template v-if="(s.data as OHLCData).volume != null">
          <span :style="{ opacity: 0.5 }">Volume</span>
          <span :style="{ fontWeight: 600, color: theme.tooltip.textColor, textAlign: 'right' }">
            {{ effectiveFormat((s.data as OHLCData).volume!, 'volume') }}
          </span>
        </template>
      </div>
      <div v-else :style="{ display: 'flex', alignItems: 'center', gap: '8px', padding: '2px 0' }">
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
          {{ effectiveFormat((s.data as TimePoint).value, 'value') }}
        </span>
      </div>
    </template>
  </div>

  <div
    v-if="crosshair && snapshots.length > 0 && floatingPos && hasCustomSlot"
    ref="containerRef"
    :data-measured="measured ? 'true' : 'false'"
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
      fontFamily: theme.typography.fontFamily,
      fontSize: theme.tooltip.fontSize + 'px',
      fontVariantNumeric: 'tabular-nums',
      color: theme.tooltip.textColor,
      width: 'max-content',
      maxWidth: (chart.getMediaSize().width - chart.yAxisWidth) + 'px',
      boxSizing: 'border-box',
      zIndex: 10,
      visibility: measuredSize !== null ? 'visible' : 'hidden',
    }"
  >
    <slot :snapshots="snapshots" :time="displayTime" />
  </div>
</template>

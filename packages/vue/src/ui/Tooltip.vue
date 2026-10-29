<script setup lang="ts">
import {
  type BandPoint,
  type OHLCData,
  type SeriesSnapshot,
  type SnapshotSort,
  type TooltipFormatter,
  buildHoverSnapshots,
  computeTooltipPosition,
  formatRowTime,
  formatRowValue,
  formatTooltipHeader,
  resolveCandlestickBodyColor,
  rowFormatter,
} from '@wick-charts/core';
import { computed, onMounted, onUnmounted, onUpdated, ref, useSlots, watchEffect } from 'vue';

import { useCrosshairPosition } from '../composables';
import { useChartInstance } from '../context';
import NumberText from './NumberText.vue';
import type { TooltipProps, TooltipRenderContext } from './props';

const props = defineProps<TooltipProps>();

defineSlots<{
  default?(ctx: TooltipRenderContext): unknown;
}>();

// Vue's `withDefaults` is inconsistent for function-typed props (sometimes
// treats the default as a factory, sometimes as the value). Use a computed
// fallback instead.
const effectiveSort = computed<SnapshotSort>(() => props.sort ?? 'none');

const chart = useChartInstance();
// A row's formatter: the `format` prop, or the default that prints a whole-number series without decimals.
const formatFor = (s: SeriesSnapshot): TooltipFormatter => rowFormatter(chart, s, props.format);
const crosshair = useCrosshairPosition(chart);

// `bump` re-runs computed values on any overlay-relevant chart mutation.
const bump = ref(0);
const onOverlayChange = () => {
  bump.value++;
};
onMounted(() => {
  chart.on('overlayChange', onOverlayChange);
  // Rows read animated values (smoothing, fades, percent shares).
  chart.on('seriesFrame', onOverlayChange);
  if (chart.getSeriesIds().length > 0) bump.value++;
});
onUnmounted(() => {
  chart.off('overlayChange', onOverlayChange);
  chart.off('seriesFrame', onOverlayChange);
});

const theme = computed(() => {
  void bump.value;

  return chart.getTheme();
});
// `chart` is not reactive: `bump` re-reads the interval once data lands after mount.
const dataInterval = computed(() => {
  void bump.value;

  return chart.getDataInterval();
});

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

// The date of a row whose point is not the header's, else `null`.
const rowTimeFor = (s: SeriesSnapshot): string | null =>
  formatRowTime(chart, {
    time: displayTime.value,
    snapshots: snapshots.value,
    interval: dataInterval.value,
    snapshot: s,
  });

const slots = useSlots();
const hasCustomSlot = computed(() => typeof slots.default === 'function');

interface BoxSize {
  width: number;
  height: number;
}

/** Border-box size of the node, `null` before it has a layout. */
function readBox(node: HTMLElement | null): BoxSize | null {
  if (node === null) return null;

  const width = node.offsetWidth;
  if (width === 0) return null;

  return { width, height: node.offsetHeight };
}

function sameBox(a: BoxSize | null, b: BoxSize | null): boolean {
  if (a === null || b === null) return a === b;

  return a.width === b.width && a.height === b.height;
}

// Both boxes size to their content. Rows and labels change with the hover,
// so measure after every render; a new size re-renders in the same flush, before paint.
const boxRef = ref<HTMLDivElement | null>(null);
const boxSize = ref<BoxSize | null>(null);

function measureBox(): void {
  const next = readBox(boxRef.value);
  if (!sameBox(boxSize.value, next)) boxSize.value = next;
}

onMounted(measureBox);
onUpdated(measureBox);

// Custom slot content can also resize between renders (an image that loads).
// `contentRect` leaves out the padding and border, so the callback reads the border box.
watchEffect((onCleanup) => {
  if (!hasCustomSlot.value) return;
  const node = boxRef.value;
  if (!node || typeof ResizeObserver === 'undefined') return;

  const observer = new ResizeObserver(measureBox);
  observer.observe(node);

  onCleanup(() => observer.disconnect());
});

const floatingPos = computed<{ left: number; top: number } | null>(() => {
  if (!crosshair.value || snapshots.value.length === 0) return null;
  const mediaSize = chart.getMediaSize();
  const chartLeft = chart.plotLeft;
  const chartWidth = chart.getLayout().chartArea.width;
  const chartHeight = mediaSize.height - chart.xAxisHeight;

  if (hasCustomSlot.value) {
    // Custom slot content has no size to estimate, so the box stays hidden until it is measured.
    const size = boxSize.value;
    if (!size) return { left: chartLeft, top: 0 };

    return computeTooltipPosition({
      x: crosshair.value.mediaX,
      y: crosshair.value.mediaY,
      chartLeft,
      chartWidth,
      chartHeight,
      tooltipWidth: size.width,
      tooltipHeight: size.height,
    });
  }

  const hasOHLC = snapshots.value.some((s) => 'open' in s.data);
  const lineCount = snapshots.value.filter((s) => !('open' in s.data)).length;
  // Until the box is measured, estimate it: a band row carries two numbers, a percent-stack row a share and a value.
  const hasBand = snapshots.value.some((s) => 'high' in s.data && !('open' in s.data));
  const hasShare = snapshots.value.some((s) => s.share !== undefined);
  let estimatedWidth = 160;
  if (hasBand) estimatedWidth = 220;
  if (hasShare) estimatedWidth = 240;
  const estimatedHeight = hasOHLC ? 140 : 40 + lineCount * 22;
  const tooltipWidth = boxSize.value?.width ?? estimatedWidth;
  const tooltipHeight = boxSize.value?.height ?? estimatedHeight;

  return computeTooltipPosition({
    x: crosshair.value.mediaX,
    y: crosshair.value.mediaY,
    chartLeft,
    chartWidth,
    chartHeight,
    tooltipWidth,
    tooltipHeight,
  });
});

const measured = computed(() => !hasCustomSlot.value || boxSize.value !== null);

function isOHLC(data: SeriesSnapshot['data']): data is OHLCData {
  return 'open' in data;
}

function isBand(data: SeriesSnapshot['data']): data is BandPoint {
  return 'high' in data && !isOHLC(data);
}
</script>

<template>
  <div
    v-if="crosshair && snapshots.length > 0 && floatingPos && !hasCustomSlot"
    ref="boxRef"
    data-chart-tooltip=""
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
      width: 'max-content',
      minWidth: '140px',
      maxWidth: chart.getLayout().chartArea.width + 'px',
      boxSizing: 'border-box',
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
      {{ formatTooltipHeader(chart, { time: displayTime, snapshots, interval: dataInterval }) }}
    </div>

    <template v-for="s in snapshots" :key="s.id">
      <div v-if="isOHLC(s.data)" :style="{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px' }">
        <span v-if="rowTimeFor(s) !== null" :style="{ gridColumn: '1 / -1', opacity: 0.45, whiteSpace: 'nowrap' }">{{
          rowTimeFor(s)
        }}</span>
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
              color:
                theme.tooltip.valueColor ??
                resolveCandlestickBodyColor(
                  (s.rising ?? (s.data as OHLCData).close >= (s.data as OHLCData).open)
                    ? theme.candlestick.up.body
                    : theme.candlestick.down.body,
                ),
              textAlign: 'right',
            }"
          ><NumberText :text="formatFor(s)(row.val, row.field)" /></span>
        </template>
        <template v-if="(s.data as OHLCData).volume != null">
          <span :style="{ opacity: 0.5 }">Volume</span>
          <span :style="{ fontWeight: 600, color: theme.tooltip.textColor, textAlign: 'right' }">
            <NumberText :text="formatFor(s)((s.data as OHLCData).volume!, 'volume')" />
          </span>
        </template>
      </div>
      <div
        v-else-if="isBand(s.data)"
        :style="{ display: 'flex', alignItems: 'center', gap: '8px', padding: '2px 0' }"
      >
        <span
          :style="{
            width: '8px',
            height: '8px',
            borderRadius: '2px',
            background: s.color,
            flexShrink: 0,
          }"
        />
        <span
          :style="{
            opacity: 0.6,
            flex: '1',
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }"
        >{{ s.label ?? 'Range' }}</span>
        <span v-if="rowTimeFor(s) !== null" :style="{ opacity: 0.45, whiteSpace: 'nowrap' }">{{ rowTimeFor(s) }}</span>
        <span :style="{ fontWeight: 600, color: theme.tooltip.valueColor ?? s.color, whiteSpace: 'nowrap' }">
          <NumberText :text="formatFor(s)((s.data as BandPoint).low, 'low')" /> –
          <NumberText :text="formatFor(s)((s.data as BandPoint).high, 'high')" />
        </span>
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
        <span
          :style="{
            opacity: 0.6,
            flex: '1',
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }"
        >{{ s.label ?? 'Value' }}</span>
        <span v-if="rowTimeFor(s) !== null" :style="{ opacity: 0.45, whiteSpace: 'nowrap' }">{{ rowTimeFor(s) }}</span>
        <span :style="{ fontWeight: 600, color: theme.tooltip.valueColor ?? s.color, whiteSpace: 'nowrap' }">
          <NumberText :text="formatRowValue(s, (v) => formatFor(s)(v, 'value'))" />
        </span>
      </div>
    </template>
  </div>

  <div
    v-if="crosshair && snapshots.length > 0 && floatingPos && hasCustomSlot"
    ref="boxRef"
    data-chart-tooltip=""
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
      maxWidth: chart.getLayout().chartArea.width + 'px',
      boxSizing: 'border-box',
      zIndex: 10,
      visibility: boxSize !== null ? 'visible' : 'hidden',
    }"
  >
    <slot :snapshots="snapshots" :time="displayTime" />
  </div>
</template>

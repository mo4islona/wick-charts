<script setup lang="ts">
import {
  type BandPoint,
  type OHLCData,
  type SeriesSnapshot,
  type SnapshotSort,
  type TooltipFormatter,
  buildHoverSnapshots,
  buildLastSnapshots,
  formatHeaderX,
  formatRowValue,
  resolveCandlestickBodyColor,
  rowFormatter,
} from '@wick-charts/core';
import { computed, inject, onMounted, onUnmounted, ref, useSlots } from 'vue';

import { useCrosshairPosition } from '../composables';
import { InfoBarAnchorKey, ThemeKey, useChartInstance } from '../context';
import NumberText from './NumberText.vue';
import type { InfoBarProps } from './props';

const props = defineProps<InfoBarProps>();

defineSlots<{
  default?(ctx: { snapshots: readonly SeriesSnapshot[]; time: number; isHover: boolean }): unknown;
}>();

// Use computed fallbacks — `withDefaults` is inconsistent for function props.
const effectiveSort = computed<SnapshotSort>(() => props.sort ?? 'none');

const chart = useChartInstance();
// A row's formatter: the `format` prop, or the default that prints a whole-number series without decimals.
const formatFor = (s: SeriesSnapshot): TooltipFormatter => rowFormatter(chart, s, props.format);
const crosshair = useCrosshairPosition(chart);
const theme = inject(ThemeKey);
const anchor = inject(InfoBarAnchorKey);

// Match the "loud failure" contract of other Vue overlays — misuse outside
// `<ChartContainer>` should throw rather than render nothing silently.
if (!theme) {
  throw new Error('<InfoBar> must be used within <ChartContainer>: missing ThemeKey.');
}
if (!anchor) {
  throw new Error('<InfoBar> must be used within <ChartContainer>: missing InfoBarAnchorKey.');
}

// `bump` re-runs computed values after any overlay-relevant mutation
// (dataUpdate / seriesChange / setSeriesVisible / setTheme / option changes).
const bump = ref(0);
const onOverlayChange = () => {
  bump.value++;
};
onMounted(() => {
  chart.on('overlayChange', onOverlayChange);
  // Rows read animated values (smoothing, fades, percent shares).
  chart.on('seriesFrame', onOverlayChange);
  // Catch-up: a sibling series' mount effect may have registered data in the
  // same synchronous flush, so poke the computed now.
  if (chart.getSeriesIds().length > 0) bump.value++;
});
onUnmounted(() => {
  chart.off('overlayChange', onOverlayChange);
  chart.off('seriesFrame', onOverlayChange);
});

// Hover-over-the-y-axis gap: the overlay canvas includes the y-axis strip,
// so a crosshair event fires for offsets past the plotted data. The
// nearest-time lookup then snaps to an out-of-range timestamp and returns
// no samples. Falling back to the last-mode snapshots keeps the bar
// populated (showing last values at 0.6 opacity) instead of blinking out
// every time the pointer grazes the y-axis.
const hoverSnapshots = computed<readonly SeriesSnapshot[] | null>(() => {
  void bump.value;
  const pos = crosshair.value;
  if (pos === null) return null;

  return buildHoverSnapshots(chart, { time: pos.time, sort: effectiveSort.value, cacheKey: 'infobar-hover' });
});

const lastSnapshots = computed<readonly SeriesSnapshot[]>(() => {
  void bump.value;

  return buildLastSnapshots(chart, { sort: effectiveSort.value, cacheKey: 'infobar-last' });
});

const isHover = computed(() => hoverSnapshots.value !== null && hoverSnapshots.value.length > 0);
const snapshots = computed<readonly SeriesSnapshot[]>(() =>
  isHover.value ? (hoverSnapshots.value as readonly SeriesSnapshot[]) : lastSnapshots.value,
);

// `chart` is not reactive: `bump` re-reads the interval once data lands after mount.
const dataInterval = computed(() => {
  void bump.value;

  return chart.getDataInterval();
});
const displayTime = computed(() => {
  if (snapshots.value.length === 0) return 0;
  if (isHover.value && crosshair.value) return crosshair.value.time;

  return Math.max(...snapshots.value.map((s) => s.data.time));
});

const slots = useSlots();
const hasCustomSlot = computed(() => typeof slots.default === 'function');

function isOHLC(data: SeriesSnapshot['data']): data is OHLCData {
  return 'open' in data;
}

function isBand(data: SeriesSnapshot['data']): data is BandPoint {
  return 'high' in data && !isOHLC(data);
}
</script>

<template>
  <Teleport v-if="anchor && theme && snapshots.length > 0" :to="anchor">
    <div
      data-tooltip-legend=""
      :style="
        hasCustomSlot
          ? {
              display: 'flex',
              alignItems: 'center',
              flexShrink: 0,
              fontSize: theme.typography.fontSize + 'px',
              fontFamily: theme.typography.fontFamily,
              fontVariantNumeric: 'tabular-nums',
              opacity: isHover ? 1 : 0.6,
              transition: 'opacity 0.2s ease',
              pointerEvents: 'none',
            }
          : {
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              flexWrap: 'wrap',
              padding: '4px 8px',
              flexShrink: 0,
              fontSize: theme.typography.fontSize + 'px',
              fontFamily: theme.typography.fontFamily,
              fontVariantNumeric: 'tabular-nums',
              opacity: isHover ? 1 : 0.6,
              transition: 'opacity 0.2s ease',
              pointerEvents: 'none',
            }
      "
    >
      <slot v-if="hasCustomSlot" :snapshots="snapshots" :time="displayTime" :is-hover="isHover" />
      <template v-else>
        <span :style="{ color: theme.axis.textColor, marginRight: '2px' }">
          {{ formatHeaderX(chart, { time: displayTime, snapshots, interval: dataInterval }) }}
        </span>
        <template v-for="s in snapshots" :key="s.id">
          <span
            v-if="isOHLC(s.data)"
            :style="{ display: 'inline-flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }"
          >
            <!-- One flex item per pair, so a narrow bar wraps between values, never inside a pair. -->
            <span
              v-for="cell in [
                { label: 'O', field: 'open' as const, val: (s.data as OHLCData).open },
                { label: 'H', field: 'high' as const, val: (s.data as OHLCData).high },
                { label: 'L', field: 'low' as const, val: (s.data as OHLCData).low },
                { label: 'C', field: 'close' as const, val: (s.data as OHLCData).close },
              ]"
              :key="cell.label"
              :style="{ display: 'inline-flex', alignItems: 'center', gap: '4px' }"
            >
              <span :style="{ color: theme.axis.textColor, opacity: 0.5, marginLeft: '5px' }">{{ cell.label }}</span>
              <span
                :style="{
                  color: resolveCandlestickBodyColor(
                    (s.data as OHLCData).close >= (s.data as OHLCData).open
                      ? theme.candlestick.up.body
                      : theme.candlestick.down.body,
                  ),
                  fontWeight: 500,
                  marginLeft: '2px',
                }"
              >
                <NumberText :text="formatFor(s)(cell.val, cell.field)" />
              </span>
            </span>
            <span
              v-if="(s.data as OHLCData).volume != null"
              :style="{ display: 'inline-flex', alignItems: 'center', gap: '4px' }"
            >
              <span :style="{ color: theme.axis.textColor, opacity: 0.5, marginLeft: '5px' }">V</span>
              <span :style="{ color: theme.axis.textColor, fontWeight: 500, marginLeft: '2px' }">
                <NumberText :text="formatFor(s)((s.data as OHLCData).volume!, 'volume')" />
              </span>
            </span>
          </span>
          <span v-else-if="isBand(s.data)" :style="{ display: 'inline-flex', alignItems: 'center', gap: '3px' }">
            <span
              :style="{
                width: '6px',
                height: '6px',
                borderRadius: '1px',
                background: s.color,
                flexShrink: 0,
              }"
            />
            <span :style="{ color: s.color, fontWeight: 500 }">
              <NumberText :text="formatFor(s)((s.data as BandPoint).low, 'low')" /> –
              <NumberText :text="formatFor(s)((s.data as BandPoint).high, 'high')" />
            </span>
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
              <NumberText :text="formatRowValue(s, (v) => formatFor(s)(v, 'value'))" />
            </span>
          </span>
        </template>
      </template>
    </div>
  </Teleport>
</template>

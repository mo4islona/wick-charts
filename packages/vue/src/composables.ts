import type { ChartInstance, CrosshairPosition, VisibleRange, YRange } from '@wick-charts/core';
import { type Ref, onMounted, onUnmounted, ref } from 'vue';

export function useVisibleRange(chart: ChartInstance): Ref<VisibleRange> {
  const range = ref<VisibleRange>(chart.getVisibleRange()) as Ref<VisibleRange>;
  const handler = () => {
    range.value = chart.getVisibleRange();
  };
  onMounted(() => chart.on('viewportChange', handler));
  onUnmounted(() => chart.off('viewportChange', handler));
  return range;
}

export function useYRange(chart: ChartInstance): Ref<YRange> {
  const range = ref<YRange>(chart.getYRange()) as Ref<YRange>;
  const handler = () => {
    range.value = chart.getYRange();
  };
  onMounted(() => chart.on('viewportChange', handler));
  onUnmounted(() => chart.off('viewportChange', handler));
  return range;
}

export function useLastYValue(chart: ChartInstance, seriesId: string): Ref<{ value: number; isLive: boolean } | null> {
  let snapshot = chart.getLastValue(seriesId);
  // Track the pixel Y the snapshot maps to so a pan/zoom/resize that leaves the
  // value unchanged but shifts the badge still re-emits — a consumer-positioned
  // badge reads `yScale.valueToY` off this ref. Comparing prev/next against the
  // live yScale alone would always be equal.
  let lastY = snapshot ? chart.yScale.valueToY(snapshot.value) : null;
  const val = ref<{ value: number; isLive: boolean } | null>(snapshot);
  const handler = () => {
    const next = chart.getLastValue(seriesId);
    const nextY = next ? chart.yScale.valueToY(next.value) : null;
    if (snapshot?.value === next?.value && snapshot?.isLive === next?.isLive && lastY === nextY) return;

    snapshot = next;
    lastY = nextY;
    val.value = next;
  };
  onMounted(() => {
    chart.on('dataUpdate', handler);
    chart.on('viewportChange', handler);
  });
  onUnmounted(() => {
    chart.off('dataUpdate', handler);
    chart.off('viewportChange', handler);
  });
  return val;
}

export function usePreviousClose(chart: ChartInstance, seriesId: string): Ref<number | null> {
  const price = ref<number | null>(chart.getPreviousClose(seriesId));
  const handler = () => {
    price.value = chart.getPreviousClose(seriesId);
  };
  onMounted(() => chart.on('dataUpdate', handler));
  onUnmounted(() => chart.off('dataUpdate', handler));
  return price;
}

export function useCrosshairPosition(chart: ChartInstance): Ref<CrosshairPosition | null> {
  const pos = ref<CrosshairPosition | null>(chart.getCrosshairPosition()) as Ref<CrosshairPosition | null>;
  const handler = () => {
    pos.value = chart.getCrosshairPosition();
  };
  onMounted(() => chart.on('crosshairMove', handler));
  onUnmounted(() => chart.off('crosshairMove', handler));
  return pos;
}

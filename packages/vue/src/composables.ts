import { ref, onMounted, onUnmounted, type Ref } from 'vue';
import type { ChartInstance, CrosshairPosition, YRange, VisibleRange } from '@wick-charts/core';

export function useVisibleRange(chart: ChartInstance): Ref<VisibleRange> {
  const range = ref<VisibleRange>(chart.getVisibleRange()) as Ref<VisibleRange>;
  const handler = () => { range.value = chart.getVisibleRange(); };
  onMounted(() => chart.on('viewportChange', handler));
  onUnmounted(() => chart.off('viewportChange', handler));
  return range;
}

export function useYRange(chart: ChartInstance): Ref<YRange> {
  const range = ref<YRange>(chart.getYRange()) as Ref<YRange>;
  const handler = () => { range.value = chart.getYRange(); };
  onMounted(() => chart.on('viewportChange', handler));
  onUnmounted(() => chart.off('viewportChange', handler));
  return range;
}

export function useLastPrice(chart: ChartInstance, seriesId: string): Ref<number | null> {
  const price = ref<number | null>(chart.getLastPrice(seriesId));
  const handler = () => { price.value = chart.getLastPrice(seriesId); };
  onMounted(() => chart.on('dataUpdate', handler));
  onUnmounted(() => chart.off('dataUpdate', handler));
  return price;
}

export function usePreviousClose(chart: ChartInstance, seriesId: string): Ref<number | null> {
  const price = ref<number | null>(chart.getPreviousClose(seriesId));
  const handler = () => { price.value = chart.getPreviousClose(seriesId); };
  onMounted(() => chart.on('dataUpdate', handler));
  onUnmounted(() => chart.off('dataUpdate', handler));
  return price;
}

export function useCrosshairPosition(chart: ChartInstance): Ref<CrosshairPosition | null> {
  const pos = ref<CrosshairPosition | null>(chart.getCrosshairPosition()) as Ref<CrosshairPosition | null>;
  const handler = () => { pos.value = chart.getCrosshairPosition(); };
  onMounted(() => chart.on('crosshairMove', handler));
  onUnmounted(() => chart.off('crosshairMove', handler));
  return pos;
}

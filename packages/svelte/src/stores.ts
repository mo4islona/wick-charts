import type { ChartInstance, CrosshairPosition, VisibleRange, YRange } from '@wick-charts/core';
import { readable } from 'svelte/store';

export function createVisibleRange(chart: ChartInstance) {
  return readable<VisibleRange>(chart.getVisibleRange(), (set) => {
    const handler = () => set(chart.getVisibleRange());
    chart.on('viewportChange', handler);
    return () => chart.off('viewportChange', handler);
  });
}

export function createYRange(chart: ChartInstance) {
  return readable<YRange>(chart.getYRange(), (set) => {
    const handler = () => set(chart.getYRange());
    chart.on('viewportChange', handler);
    return () => chart.off('viewportChange', handler);
  });
}

export function createLastYValue(chart: ChartInstance, seriesId: string) {
  let currentValue = chart.getLastValue(seriesId);
  return readable<{ value: number; isLive: boolean } | null>(currentValue, (set) => {
    const handler = () => {
      const next = chart.getLastValue(seriesId);
      const prev = currentValue;
      if (prev?.value === next?.value && prev?.isLive === next?.isLive) return;
      currentValue = next;
      set(next);
    };
    chart.on('dataUpdate', handler);
    chart.on('viewportChange', handler);
    return () => {
      chart.off('dataUpdate', handler);
      chart.off('viewportChange', handler);
    };
  });
}

export function createPreviousClose(chart: ChartInstance, seriesId: string) {
  return readable<number | null>(chart.getPreviousClose(seriesId), (set) => {
    const handler = () => set(chart.getPreviousClose(seriesId));
    chart.on('dataUpdate', handler);
    return () => chart.off('dataUpdate', handler);
  });
}

export function createCrosshairPosition(chart: ChartInstance) {
  return readable<CrosshairPosition | null>(chart.getCrosshairPosition(), (set) => {
    const handler = () => set(chart.getCrosshairPosition());
    chart.on('crosshairMove', handler);
    return () => chart.off('crosshairMove', handler);
  });
}

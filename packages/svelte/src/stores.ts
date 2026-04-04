import { readable } from 'svelte/store';
import type { ChartInstance, CrosshairPosition, YRange, VisibleRange } from '@wick-charts/core';

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

export function createLastPrice(chart: ChartInstance, seriesId: string) {
  return readable<number | null>(chart.getLastPrice(seriesId), (set) => {
    const handler = () => set(chart.getLastPrice(seriesId));
    chart.on('dataUpdate', handler);
    return () => chart.off('dataUpdate', handler);
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

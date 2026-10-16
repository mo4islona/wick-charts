import type { ChartInstance, CrosshairPosition, VisibleRange, YAxisPosition, YRange } from '@wick-charts/core';
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

export interface AxisLayout {
  yAxisPosition: YAxisPosition;
  yAxisWidth: number;
  xAxisHeight: number;
  /** Width of the Y-axis column on each side — the default axis's or a named scale's, `0` for none. */
  leftAxisWidth: number;
  rightAxisWidth: number;
  /** Named scale owning each side's column, `null` for the default axis or none — a swap moves the columns. */
  leftAxisScale: string | null;
  rightAxisScale: string | null;
}

function readAxisLayout(chart: ChartInstance): AxisLayout {
  return {
    yAxisPosition: chart.yAxisPosition,
    yAxisWidth: chart.yAxisWidth,
    xAxisHeight: chart.xAxisHeight,
    leftAxisWidth: chart.getAxisColumnWidth('left'),
    rightAxisWidth: chart.getAxisColumnWidth('right'),
    leftAxisScale: chart.getAxisColumnScale('left'),
    rightAxisScale: chart.getAxisColumnScale('right'),
  };
}

/** The axis gutters overlays anchor to — emits on a Y-axis side or gutter size change. */
export function createAxisLayout(chart: ChartInstance) {
  let current = readAxisLayout(chart);

  return readable<AxisLayout>(current, (set) => {
    const handler = () => {
      const next = readAxisLayout(chart);
      const unchanged =
        current.yAxisPosition === next.yAxisPosition &&
        current.yAxisWidth === next.yAxisWidth &&
        current.xAxisHeight === next.xAxisHeight &&
        current.leftAxisWidth === next.leftAxisWidth &&
        current.rightAxisWidth === next.rightAxisWidth &&
        current.leftAxisScale === next.leftAxisScale &&
        current.rightAxisScale === next.rightAxisScale;
      if (unchanged) return;

      current = next;
      set(next);
    };

    handler();
    chart.on('viewportChange', handler);

    return () => chart.off('viewportChange', handler);
  });
}

export function createLastYValue(chart: ChartInstance, seriesId: string) {
  let currentValue = chart.getLastValue(seriesId);
  const yScale = () => chart.getYScale(chart.getSeriesScale(seriesId));
  // Track the pixel Y the snapshot maps to so a pan/zoom/resize that leaves the
  // value unchanged but shifts the badge still re-emits — a consumer-positioned
  // badge reads `yScale.valueToY` off this store. Comparing prev/next against
  // the live yScale alone would always be equal.
  let lastY = currentValue ? yScale().valueToY(currentValue.value) : null;
  return readable<{ value: number; isLive: boolean } | null>(currentValue, (set) => {
    const handler = () => {
      const next = chart.getLastValue(seriesId);
      const prev = currentValue;
      const nextY = next ? yScale().valueToY(next.value) : null;
      if (prev?.value === next?.value && prev?.isLive === next?.isLive && lastY === nextY) return;

      currentValue = next;
      lastY = nextY;
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

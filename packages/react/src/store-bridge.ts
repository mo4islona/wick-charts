import { useMemo, useSyncExternalStore } from 'react';

import type { ChartInstance, CrosshairPosition, VisibleRange, YRange } from '@wick-charts/core';

function createStore<T>(
  chart: ChartInstance,
  event: 'crosshairMove' | 'viewportChange' | 'dataUpdate',
  getSnapshot: () => T,
) {
  return {
    subscribe: (callback: () => void) => {
      chart.on(event as any, callback);
      return () => chart.off(event as any, callback);
    },
    getSnapshot,
  };
}

export function useVisibleRange(chart: ChartInstance): VisibleRange {
  const store = useMemo(() => createStore(chart, 'viewportChange', () => chart.getVisibleRange()), [chart]);
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}

export function useYRange(chart: ChartInstance): YRange {
  const store = useMemo(() => createStore(chart, 'viewportChange', () => chart.getYRange()), [chart]);
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}

export function useLastYValue(chart: ChartInstance, seriesId: string): { value: number; isLive: boolean } | null {
  const store = useMemo(() => {
    let snapshot = chart.getLastValue(seriesId);
    const getSnapshot = () => snapshot;
    return {
      subscribe: (callback: () => void) => {
        const update = () => {
          const next = chart.getLastValue(seriesId);
          // Skip re-render if value/isLive unchanged
          if (snapshot?.value === next?.value && snapshot?.isLive === next?.isLive) return;
          snapshot = next;
          callback();
        };
        chart.on('dataUpdate', update);
        chart.on('viewportChange', update);
        return () => {
          chart.off('dataUpdate', update);
          chart.off('viewportChange', update);
        };
      },
      getSnapshot,
    };
  }, [chart, seriesId]);
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}

export function usePreviousClose(chart: ChartInstance, seriesId: string): number | null {
  const store = useMemo(
    () => createStore(chart, 'dataUpdate', () => chart.getPreviousClose(seriesId)),
    [chart, seriesId],
  );
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}

export function useCrosshairPosition(chart: ChartInstance): CrosshairPosition | null {
  const store = useMemo(() => createStore(chart, 'crosshairMove', () => chart.getCrosshairPosition()), [chart]);
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}

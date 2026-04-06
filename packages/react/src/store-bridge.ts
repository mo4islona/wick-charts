import { useMemo, useSyncExternalStore } from 'react';

import type { ChartInstance, CrosshairPosition, VisibleRange, YRange } from '@wick-charts/core';

type ChartEvent = 'crosshairMove' | 'viewportChange' | 'dataUpdate' | 'seriesChange';

function createStore<T>(
  chart: ChartInstance,
  events: ChartEvent | ChartEvent[],
  getSnapshot: () => T,
) {
  const list = Array.isArray(events) ? events : [events];
  return {
    subscribe: (callback: () => void) => {
      for (const e of list) chart.on(e as any, callback);
      return () => { for (const e of list) chart.off(e as any, callback); };
    },
    getSnapshot,
  };
}

export function useVisibleRange(chart: ChartInstance): VisibleRange {
  const store = useMemo(() => createStore(chart, ['viewportChange', 'dataUpdate', 'seriesChange'], () => chart.getVisibleRange()), [chart]);
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}

export function useYRange(chart: ChartInstance): YRange {
  const store = useMemo(() => createStore(chart, ['viewportChange', 'dataUpdate', 'seriesChange'], () => chart.getYRange()), [chart]);
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}

export function useLastYValue(chart: ChartInstance, seriesId: string): { value: number; isLive: boolean } | null {
  const store = useMemo(() => {
    let snapshot = chart.getLastValue(seriesId);
    const getSnapshot = () => snapshot;
    return {
      subscribe: (callback: () => void) => {
        const onData = () => {
          const next = chart.getLastValue(seriesId);
          // Skip re-render if value/isLive unchanged
          if (snapshot?.value === next?.value && snapshot?.isLive === next?.isLive) return;
          snapshot = next;
          callback();
        };
        const onViewport = () => {
          const next = chart.getLastValue(seriesId);
          // Compare pixel position — valueToY depends on viewport even when value is unchanged
          const nextY = next ? chart.yScale.valueToY(next.value) : null;
          const prevY = snapshot ? chart.yScale.valueToY(snapshot.value) : null;
          if (nextY === prevY && snapshot?.value === next?.value && snapshot?.isLive === next?.isLive) return;
          snapshot = next;
          callback();
        };
        chart.on('dataUpdate', onData);
        chart.on('viewportChange', onViewport);
        return () => {
          chart.off('dataUpdate', onData);
          chart.off('viewportChange', onViewport);
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

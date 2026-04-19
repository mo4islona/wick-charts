import { useMemo, useSyncExternalStore } from 'react';

import type { ChartInstance, CrosshairPosition, VisibleRange, YRange } from '@wick-charts/core';

type ChartEvent = 'crosshairMove' | 'viewportChange' | 'dataUpdate' | 'seriesChange';

// `chart.on` is typed per-event (e.g. `crosshairMove` passes `CrosshairPosition`)
// but the React bridge only needs a generic "something changed" ping. Narrow
// via `Parameters<ChartInstance['on']>` so we stay inside the public surface
// without collapsing to `any`.
type ChartOnListener = Parameters<ChartInstance['on']>[1];

function createStore<T>(chart: ChartInstance, events: ChartEvent | ChartEvent[], getSnapshot: () => T) {
  const list = Array.isArray(events) ? events : [events];
  return {
    subscribe: (callback: () => void) => {
      const listener = callback as unknown as ChartOnListener;
      for (const e of list) chart.on(e, listener);
      return () => {
        for (const e of list) chart.off(e, listener);
      };
    },
    getSnapshot,
  };
}

export function useVisibleRange(chart: ChartInstance): VisibleRange {
  const store = useMemo(
    () => createStore(chart, ['viewportChange', 'dataUpdate', 'seriesChange'], () => chart.getVisibleRange()),
    [chart],
  );
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}

export function useYRange(chart: ChartInstance): YRange {
  const store = useMemo(
    () => createStore(chart, ['viewportChange', 'dataUpdate', 'seriesChange'], () => chart.getYRange()),
    [chart],
  );
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}

export function useLastYValue(chart: ChartInstance, seriesId: string): { value: number; isLive: boolean } | null {
  const store = useMemo(() => {
    let snapshot = chart.getLastValue(seriesId);
    // Remember the pixel Y that corresponds to `snapshot` so we can detect
    // viewport shifts (resize, headerLayout toggle, zoom/pan) where the value
    // is unchanged but the badge needs to move. Computing both prev and next
    // against the current yScale would always compare equal.
    let lastY = snapshot ? chart.yScale.valueToY(snapshot.value) : null;
    const getSnapshot = () => snapshot;

    const refresh = (): boolean => {
      const next = chart.getLastValue(seriesId);
      const nextY = next ? chart.yScale.valueToY(next.value) : null;
      if (snapshot?.value === next?.value && snapshot?.isLive === next?.isLive && lastY === nextY) {
        return false;
      }

      snapshot = next;
      lastY = nextY;
      return true;
    };

    return {
      subscribe: (callback: () => void) => {
        // The snapshot captured in useMemo can predate the series being added
        // (LineSeries's useLayoutEffect runs after YLabel's initial render, so
        // getLastValue returned null). Reconcile before listeners attach —
        // useSyncExternalStore re-reads getSnapshot after subscribe and will
        // force a re-render when the value differs from the last one it saw.
        refresh();
        const onChange = () => {
          if (refresh()) callback();
        };
        chart.on('dataUpdate', onChange);
        chart.on('viewportChange', onChange);
        return () => {
          chart.off('dataUpdate', onChange);
          chart.off('viewportChange', onChange);
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

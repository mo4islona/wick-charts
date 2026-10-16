import { useMemo, useSyncExternalStore } from 'react';

import type { ChartInstance, CrosshairPosition, VisibleRange, YAxisPosition, YRange } from '@wick-charts/core';

type ChartEvent = 'crosshairMove' | 'viewportChange' | 'dataUpdate' | 'seriesChange' | 'overlayChange';

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

function sameAxisLayout(a: AxisLayout, b: AxisLayout): boolean {
  return (
    a.yAxisPosition === b.yAxisPosition &&
    a.yAxisWidth === b.yAxisWidth &&
    a.xAxisHeight === b.xAxisHeight &&
    a.leftAxisWidth === b.leftAxisWidth &&
    a.rightAxisWidth === b.rightAxisWidth &&
    a.leftAxisScale === b.leftAxisScale &&
    a.rightAxisScale === b.rightAxisScale
  );
}

/**
 * The axis gutters overlays anchor to. Re-renders only when the Y-axis side
 * or a gutter size actually changes — an axis config update, not every
 * viewport tick. `null` while there is no chart yet.
 */
export function useAxisLayout(chart: ChartInstance): AxisLayout;
export function useAxisLayout(chart: ChartInstance | null): AxisLayout | null;
export function useAxisLayout(chart: ChartInstance | null): AxisLayout | null {
  const store = useMemo(() => {
    let snapshot = chart === null ? null : readAxisLayout(chart);

    const refresh = (): boolean => {
      if (chart === null) return false;

      const next = readAxisLayout(chart);
      if (snapshot !== null && sameAxisLayout(snapshot, next)) return false;

      snapshot = next;

      return true;
    };

    return {
      subscribe: (callback: () => void) => {
        if (chart === null) return () => {};

        // The layout can change between useMemo and subscribe (the axis
        // effect runs after children render) — reconcile before listening.
        refresh();
        const onChange = () => {
          if (refresh()) callback();
        };
        chart.on('viewportChange', onChange);

        return () => {
          chart.off('viewportChange', onChange);
        };
      },
      getSnapshot: () => snapshot,
    };
  }, [chart]);

  // Doubles as the server snapshot: `ChartContainer` calls this before its
  // chart exists (always so on the server), where the snapshot is `null`.
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

export function useLastYValue(chart: ChartInstance, seriesId: string): { value: number; isLive: boolean } | null {
  const store = useMemo(() => {
    let snapshot = chart.getLastValue(seriesId);
    const yScale = () => chart.getYScale(chart.getSeriesScale(seriesId));
    // Remember the pixel Y that corresponds to `snapshot` so we can detect
    // viewport shifts (resize, headerLayout toggle, zoom/pan) where the value
    // is unchanged but the badge needs to move. Computing both prev and next
    // against the current yScale would always compare equal.
    let lastY = snapshot ? yScale().valueToY(snapshot.value) : null;
    const getSnapshot = () => snapshot;

    const refresh = (): boolean => {
      const next = chart.getLastValue(seriesId);
      const nextY = next ? yScale().valueToY(next.value) : null;
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

/** Re-renders on `overlayChange` — formatter, scale and theme changes that leave the crosshair still. */
export function useOverlayVersion(chart: ChartInstance): number {
  const store = useMemo(() => createStore(chart, 'overlayChange', () => chart.getOverlayVersion()), [chart]);
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}

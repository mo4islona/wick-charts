import { useMemo, useSyncExternalStore } from "react";
import type { ChartInstance } from "../core/chart";
import type { CrosshairPosition, PriceRange, VisibleRange } from "../core/types";

function createStore<T>(
  chart: ChartInstance,
  event: "crosshairMove" | "viewportChange" | "dataUpdate",
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
  const store = useMemo(() => createStore(chart, "viewportChange", () => chart.getVisibleRange()), [chart]);
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}

export function usePriceRange(chart: ChartInstance): PriceRange {
  const store = useMemo(() => createStore(chart, "viewportChange", () => chart.getPriceRange()), [chart]);
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}

export function useLastPrice(chart: ChartInstance, seriesId: string): number | null {
  const store = useMemo(() => createStore(chart, "dataUpdate", () => chart.getLastPrice(seriesId)), [chart, seriesId]);
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}

export function usePreviousClose(chart: ChartInstance, seriesId: string): number | null {
  const store = useMemo(
    () => createStore(chart, "dataUpdate", () => chart.getPreviousClose(seriesId)),
    [chart, seriesId],
  );
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}

export function useCrosshairPosition(chart: ChartInstance): CrosshairPosition | null {
  const store = useMemo(() => createStore(chart, "crosshairMove", () => chart.getCrosshairPosition()), [chart]);
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}

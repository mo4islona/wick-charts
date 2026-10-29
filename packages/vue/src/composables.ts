import type { ChartInstance, CrosshairPosition, VisibleRange, YAxisPosition, YRange } from '@wick-charts/core';
import { type Ref, onMounted, onUnmounted, ref, toRaw } from 'vue';

/** A `{ label?, color?, data }` layer — an object carrying a `data` array. */
function isLayerObject(value: unknown): value is { data: unknown[] } {
  return (
    typeof value === 'object' && value !== null && !Array.isArray(value) && Array.isArray(Reflect.get(value, 'data'))
  );
}

/** Each layer's point array, read through whatever Proxy the prop arrived in. */
function layerArrays(data: unknown): unknown[][] {
  if (isLayerObject(data)) return [data.data];
  if (!Array.isArray(data)) return [];

  const layered = Array.isArray(data[0]) || isLayerObject(data[0]);
  if (!layered) return [data];

  return data.map((layer) => (isLayerObject(layer) ? layer.data : (layer as unknown[])));
}

/**
 * A series `data` prop with Vue's reactive Proxies taken off the top level and
 * each layer, so the chart reads plain arrays: a `ref` / `reactive` array of
 * 100k points read through its Proxy costs the engine several times more.
 */
export function rawSeriesData<D>(data: D): D {
  const raw = toRaw(data);
  const rawLayer = (layer: unknown) => {
    if (!isLayerObject(layer)) return toRaw(layer);

    const plain = toRaw(layer);

    return { ...plain, data: toRaw(plain.data) };
  };

  if (!Array.isArray(raw)) return rawLayer(raw) as D;

  const layered = Array.isArray(raw[0]) || isLayerObject(raw[0]);
  if (!layered) return raw;

  return raw.map(rawLayer) as D;
}

/**
 * Watch source for a series `data` prop. Besides a new array, it re-fires on
 * an in-place `push` / `splice` or an edit of a layer's last point on a
 * reactive array — it reads each layer's length and last point through the
 * Proxy instead of deep-watching every point. A `shallowRef` needs a new
 * array: `triggerRef` after an in-place edit passes the same array again.
 */
export function seriesDataSource(getData: () => unknown): () => unknown[] {
  return () => {
    const data = getData();
    const deps: unknown[] = [data];
    for (const points of layerArrays(data)) {
      deps.push(points, points.length);

      const last = points[points.length - 1];
      if (typeof last === 'object' && last !== null) deps.push(...Object.values(last));
    }

    return deps;
  };
}

/**
 * Watch source for the items of a pie or radial series: a short list where any
 * item can change, so it reads every field of every item through the Proxy.
 */
export function itemsDataSource(getData: () => readonly object[]): () => unknown[] {
  return () => {
    const data = getData();
    const deps: unknown[] = [data, data.length];
    for (const item of data) {
      deps.push(item, ...Object.values(item));
    }

    return deps;
  };
}

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

/** The axis gutters overlays anchor to — refreshed on a Y-axis side or gutter size change. */
export function useAxisLayout(chart: ChartInstance): Ref<AxisLayout> {
  const layout = ref<AxisLayout>(readAxisLayout(chart)) as Ref<AxisLayout>;
  const handler = () => {
    const next = readAxisLayout(chart);
    const prev = layout.value;
    const unchanged =
      prev.yAxisPosition === next.yAxisPosition &&
      prev.yAxisWidth === next.yAxisWidth &&
      prev.xAxisHeight === next.xAxisHeight &&
      prev.leftAxisWidth === next.leftAxisWidth &&
      prev.rightAxisWidth === next.rightAxisWidth &&
      prev.leftAxisScale === next.leftAxisScale &&
      prev.rightAxisScale === next.rightAxisScale;
    if (unchanged) return;

    layout.value = next;
  };
  onMounted(() => {
    // The axis watcher may have landed a new config between setup and mount.
    handler();
    chart.on('viewportChange', handler);
  });
  onUnmounted(() => chart.off('viewportChange', handler));

  return layout;
}

export function useLastYValue(chart: ChartInstance, seriesId: string): Ref<{ value: number; isLive: boolean } | null> {
  let snapshot = chart.getLastValue(seriesId);
  const yScale = () => chart.getYScale(chart.getSeriesScale(seriesId));
  // Track the pixel Y the snapshot maps to so a pan/zoom/resize that leaves the
  // value unchanged but shifts the badge still re-emits — a consumer-positioned
  // badge reads `yScale.valueToY` off this ref. Comparing prev/next against the
  // live yScale alone would always be equal.
  let lastY = snapshot ? yScale().valueToY(snapshot.value) : null;
  const val = ref<{ value: number; isLive: boolean } | null>(snapshot);
  const handler = () => {
    const next = chart.getLastValue(seriesId);
    const nextY = next ? yScale().valueToY(next.value) : null;
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

import type { ChartInstance } from '../chart';
import type { MultiLayerData, OHLCInput, SeriesLayer, TimePointInput } from '../types';
import { normalizeTime } from '../utils/time';

/**
 * Per-layer bookkeeping for {@link syncSeriesLayer}. The caller persists one
 * of these per series layer (a React ref, a Vue/Svelte closure var) and feeds
 * it back on the next data prop change so the helper can pick the cheapest
 * correct mutation.
 */
export interface SeriesSyncState {
  /** Point count at the previous sync. */
  len: number;
  /** Normalized timestamp of the first point, or `null` before any data. */
  firstTime: number | null;
  /** Normalized timestamp of the last point, or `null` before any data. */
  lastTime: number | null;
  /**
   * The previous sync's point array, retained (not copied) only so a
   * same-length, same-boundary-timestamp update can prove the middle didn't
   * change before taking the cheap last-point-only path. `null` before any
   * data.
   */
  data: readonly (OHLCInput | TimePointInput)[] | null;
}

/** Initial state for a layer that has never been synced. */
export const EMPTY_SYNC_STATE: SeriesSyncState = { len: 0, firstTime: null, lastTime: null, data: null };

/**
 * Only fall back to a full `setSeriesData` replace when more than this many
 * new points arrive in a single tick — otherwise a streamed burst would look
 * like a bulk load and the renderer would clear its entrance animators (and
 * the Y axis would snap instead of easing). Streamed feeds emit a handful per
 * tick; history loads deliberately exceed this.
 */
const BULK_THRESHOLD = 20;

/** Field-wise equality for one data point — every key except `time` compares by strict equality; `time` normalizes first so a `Date` and its equivalent ms number still match. */
function pointEquals<T extends OHLCInput | TimePointInput>(a: T, b: T): boolean {
  if (normalizeTime(a.time) !== normalizeTime(b.time)) return false;

  const aKeys = Object.keys(a) as (keyof T)[];
  const bKeys = Object.keys(b) as (keyof T)[];
  if (aKeys.length !== bKeys.length) return false;

  return aKeys.every((key) => key === 'time' || a[key] === b[key]);
}

/**
 * Whether every point except the last is unchanged from the previous sync —
 * the precondition for the cheap `updateData(last)` path. Without this check,
 * a same-length replacement with matching first/last timestamps but edited
 * values in between would silently leave the middle stale on screen (only
 * the last point would repaint).
 */
function middleUnchanged<T extends OHLCInput | TimePointInput>(
  prevData: readonly (OHLCInput | TimePointInput)[] | null,
  data: readonly T[],
): boolean {
  if (!prevData || prevData.length !== data.length) return false;

  for (let i = 0; i < data.length - 1; i++) {
    if (!pointEquals(prevData[i] as T, data[i])) return false;
  }

  return true;
}

/**
 * Whether the incoming `data` is the previous data with exactly `added` older
 * points spliced onto the front and the existing suffix left byte-for-byte
 * unchanged — the precondition for the cheap `prependData` (history load-more)
 * path. Proven by matching `prev.data[i]` against `data[added + i]` for the
 * whole previous array; the length identity guards against a same-time tail
 * edit sneaking through. Streaming tail growth fails on the first compare
 * (times differ), so this stays cheap for the common append case.
 */
function isFrontPrepend<T extends OHLCInput | TimePointInput>(
  prevData: readonly (OHLCInput | TimePointInput)[] | null,
  data: readonly T[],
  added: number,
): boolean {
  // Requires a non-empty prior suffix to anchor: refilling after a clear
  // (`prevData === []`) is a fresh load that must snap/fit, not a prepend.
  if (!prevData || prevData.length === 0 || added <= 0 || prevData.length !== data.length - added) return false;

  for (let i = 0; i < prevData.length; i++) {
    if (!pointEquals(prevData[i] as T, data[added + i])) return false;
  }

  return true;
}

/** True for a {@link SeriesLayer} object — an object (not array) carrying a `data` array. */
function isSeriesLayer<T>(x: unknown): x is SeriesLayer<T> {
  return typeof x === 'object' && x !== null && !Array.isArray(x) && Array.isArray((x as { data?: unknown }).data);
}

/**
 * Normalize any accepted line/bar/candlestick `data` shape to a uniform
 * `SeriesLayer[]`. Accepts, interchangeably:
 * - a flat `T[]` — one unnamed layer (the common single-series case);
 * - a layered `T[][]` — N unnamed layers;
 * - a single `SeriesLayer<T>` — one named/colored layer;
 * - an array mixing raw `T[]` layers and `SeriesLayer<T>`s.
 *
 * Disambiguates on the first element: a data point is an object without a
 * `data` array, a raw layer is an array, and a named layer is an object whose
 * `data` is an array. An empty top-level array becomes one empty layer.
 */
export function toLayers<T extends OHLCInput | TimePointInput>(
  data: T[] | T[][] | SeriesLayer<T> | Array<T[] | SeriesLayer<T>>,
): SeriesLayer<T>[] {
  // Single named layer object.
  if (!Array.isArray(data)) return [data];
  // Empty top-level → one empty layer (the "single series, no data yet" reading).
  if (data.length === 0) return [{ data: [] as T[] }];

  const first = data[0];
  // Layered: every element is a raw `T[]` or a `SeriesLayer`. A bare point is
  // neither an array nor an object carrying `data`, so this branch is taken
  // only for genuine layer arrays.
  if (Array.isArray(first) || isSeriesLayer<T>(first)) {
    return (data as Array<T[] | SeriesLayer<T>>).map((el) => (Array.isArray(el) ? { data: el } : el));
  }

  // Flat single layer of points.
  return [{ data: data as T[] }];
}

export interface SyncLayersArgs {
  chart: ChartInstance;
  id: string;
  data: MultiLayerData;
  /** Per-layer state from the previous call; one entry per layer. */
  prev: SeriesSyncState[];
}

/**
 * Reconcile a full line/bar `data` prop (any {@link MultiLayerData} shape)
 * against the previous per-layer {@link SeriesSyncState}s and mirror the
 * carried metadata into the chart:
 *
 * - normalizes the omnivorous input to layers via {@link toLayers};
 * - pushes per-layer labels (a multi-layer series auto-names unnamed layers
 *   `Series N`; a single layer keeps its raw label so an unnamed single line
 *   still reads as "Value" in the tooltip);
 * - applies per-layer `color` overrides on top of the resolved palette;
 * - routes each layer's points through {@link syncSeriesLayer} so streaming
 *   still eases instead of Y-snapping.
 *
 * Stateless: returns the new per-layer states for the caller to persist. Shared
 * by the React / Vue / Svelte line + bar wrappers so all three behave alike.
 */
export function syncLayers(args: SyncLayersArgs): SeriesSyncState[] {
  const { chart, id } = args;
  const layers = toLayers<TimePointInput>(args.data);

  // Labels: auto-name only when there's more than one layer to disambiguate.
  const labels = layers.length > 1 ? layers.map((l, i) => l.label ?? `Series ${i + 1}`) : [layers[0].label];
  chart.setSeriesLabels(id, labels);

  // Colors: store the per-layer overrides (sparse — `undefined` where the layer
  // carries no color). The chart re-applies them on top of `options.colors`, so
  // a data color wins regardless of which effect (data vs. options) runs last.
  chart.setLayerColors(
    id,
    layers.map((l) => l.color),
  );

  const next: SeriesSyncState[] = [];
  chart.batch(() => {
    for (let i = 0; i < layers.length; i++) {
      next[i] = syncSeriesLayer({
        chart,
        id,
        data: layers[i].data,
        prev: args.prev[i] ?? EMPTY_SYNC_STATE,
        layerIndex: i,
      });
    }
  });

  return next;
}

export interface SyncSeriesLayerArgs<T extends OHLCInput | TimePointInput> {
  chart: ChartInstance;
  id: string;
  data: T[];
  prev: SeriesSyncState;
  /** Layer index for multi-layer series (line / bar); omit for single-layer (candlestick). */
  layerIndex?: number;
}

/**
 * Reconcile one layer of incoming time-series (or OHLC) data against the
 * previous {@link SeriesSyncState}, choosing the cheapest correct mutation so
 * streamed updates ease instead of Y-snapping:
 *
 *   - rolling-window slide (same length, head dropped + tail appended) →
 *     `appendData` + `keepLast` (eases — no Y snap),
 *   - history prepend (N older points spliced onto the front, existing suffix
 *     untouched) → `prependData` (keeps the viewport put — no re-fit or snap),
 *   - bulk load / shrink / window shift → `setSeriesData`,
 *   - in-place last-point update (same length, same boundary timestamps,
 *     and every point but the last proven unchanged) → `updateData`,
 *   - same length but a middle value edited underneath matching boundary
 *     timestamps → `setSeriesData` (can't cheaply patch an arbitrary middle
 *     point, and skipping it would leave stale values on screen),
 *   - tail growth → `appendData` per new point.
 *
 * Stateless: returns the new state for the caller to persist. Shared by the
 * React, Vue and Svelte series wrappers so all three behave identically — in
 * particular the rolling-window path keeps streaming Y smooth everywhere,
 * instead of the per-tick snap the Vue/Svelte wrappers previously had.
 */
export function syncSeriesLayer<T extends OHLCInput | TimePointInput>(args: SyncSeriesLayerArgs<T>): SeriesSyncState {
  const { chart, id, data, prev, layerIndex } = args;

  if (data.length === 0) {
    chart.setSeriesData(id, [], layerIndex);

    return { len: 0, firstTime: null, lastTime: null, data: [] };
  }

  const firstTime = normalizeTime(data[0].time);
  const lastTime = normalizeTime(data[data.length - 1].time);
  const shifted = prev.firstTime !== null && prev.firstTime !== firstTime;
  const added = data.length - prev.len;
  const hasNewLast = prev.lastTime !== null && prev.lastTime !== lastTime;

  if (shifted && added === 0 && hasNewLast) {
    // Rolling-window slide (maxPoints cap): oldest dropped, newest appended,
    // length unchanged. Append the new tail then trim the head — this path
    // goes through `keepLast` (no Y snap) instead of `setSeriesData`. Batched
    // so the append + trim run one `onDataChanged` pass, not two.
    chart.batch(() => {
      chart.appendData(id, data[data.length - 1], layerIndex);
      chart.keepLast(id, data.length, layerIndex);
    });
  } else if (isFrontPrepend(prev.data, data, added)) {
    // History load-more: only the front grew, the on-screen suffix is
    // unchanged. Splice the older points in without a bulk replace so the
    // viewport stays anchored instead of re-fitting the (now larger) span and
    // snapping both axes.
    chart.prependData(id, data.slice(0, added), layerIndex);
  } else if (prev.len === 0 || data.length < prev.len || added > BULK_THRESHOLD || shifted) {
    chart.setSeriesData(id, data, layerIndex);
  } else if (data.length === prev.len) {
    if (middleUnchanged(prev.data, data)) {
      chart.updateData(id, data[data.length - 1], layerIndex);
    } else {
      chart.setSeriesData(id, data, layerIndex);
    }
  } else {
    // Tail growth — a burst of ≤ BULK_THRESHOLD points in one commit. Batched:
    // every point still seeds its own entrance animator, but the engine
    // retargets once for the whole burst instead of once per point.
    chart.batch(() => {
      for (let i = prev.len; i < data.length; i++) {
        chart.appendData(id, data[i], layerIndex);
      }
    });
  }

  return { len: data.length, firstTime, lastTime, data };
}

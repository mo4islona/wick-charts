import type { ChartInstance } from '../chart';
import type {
  BandData,
  BandPointInput,
  MultiLayerData,
  OHLCInput,
  SeriesLayer,
  TimePointInput,
  XBandPointInput,
  XPointInput,
} from '../types';

/** Any input point a series layer accepts. */
type InputPoint = OHLCInput | TimePointInput | BandPointInput | XPointInput | XBandPointInput;

import { normalizeTime } from '../utils/time';

/** A point's X key — `x` on a numeric / category axis, the normalized `time` otherwise. */
function keyOf(point: InputPoint): number | string {
  if ('x' in point) return point.x;

  return normalizeTime(point.time);
}

/**
 * Per-layer bookkeeping for {@link syncSeriesLayer}. The caller persists one
 * of these per series layer (a React ref, a Vue/Svelte closure var) and feeds
 * it back on the next data prop change so the helper can pick the cheapest
 * correct mutation.
 */
export interface SeriesSyncState {
  /** Point count at the previous sync. */
  len: number;
  /** X key (normalized timestamp, or `x`) of the first point, or `null` before any data. */
  firstTime: number | string | null;
  /** X key (normalized timestamp, or `x`) of the last point, or `null` before any data. */
  lastTime: number | string | null;
  /**
   * The previous sync's point array, retained (not copied) only so a
   * same-length, same-boundary-timestamp update can prove the middle didn't
   * change before taking the cheap last-point-only path. `null` before any
   * data.
   */
  data: readonly InputPoint[] | null;
  /**
   * A copy of the last point at the previous sync: when the host edits `data`
   * in place, it is the only snapshot left to diff against. `null` / absent
   * before any data.
   */
  last?: InputPoint | null;
}

/** Initial state for a layer that has never been synced. */
export const EMPTY_SYNC_STATE: SeriesSyncState = { len: 0, firstTime: null, lastTime: null, data: null, last: null };

/**
 * Only fall back to a full `setSeriesData` replace when more than this many
 * new points arrive in a single tick — otherwise a streamed burst would look
 * like a bulk load and the renderer would clear its entrance animators (and
 * the Y axis would snap instead of easing). Streamed feeds emit a handful per
 * tick; history loads deliberately exceed this.
 */
const BULK_THRESHOLD = 20;

/** Field-wise equality for one data point — every key except `time` compares by strict equality; the X key normalizes first so a `Date` and its equivalent ms number still match. */
function pointEquals<T extends InputPoint>(a: T, b: T): boolean {
  if (keyOf(a) !== keyOf(b)) return false;

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
function middleUnchanged<T extends InputPoint>(prevData: readonly InputPoint[] | null, data: readonly T[]): boolean {
  if (!prevData || prevData.length !== data.length) return false;

  // Same array reference: a caller that reuses one array and edits a point in
  // place gives us no snapshot to diff against — comparing it to itself always
  // reports "unchanged". Refuse the cheap path so the edit still repaints.
  if (prevData === data) return false;

  for (let i = 0; i < data.length - 1; i++) {
    // Reference-equal middle point → unchanged, no field walk. The common
    // streaming update (`[...prev.slice(0, -1), newLast]`) reuses every middle
    // object, so this stays allocation-free; only genuinely rebuilt points
    // fall through to the field-wise compare.
    if (prevData[i] === data[i]) continue;

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
 *
 * The prepended head itself must be strictly ascending and end strictly
 * before the old first point — `chart.prependData` concatenates it onto the
 * store without re-sorting, so a load-more page delivered newest-first (or
 * one that repeats the boundary point) must fall through to the full-replace
 * path, which sorts and dedups like any other bulk load.
 */
function isFrontPrepend<T extends InputPoint>(
  prevData: readonly InputPoint[] | null,
  data: readonly T[],
  added: number,
): boolean {
  // Requires a non-empty prior suffix to anchor: refilling after a clear
  // (`prevData === []`) is a fresh load that must snap/fit, not a prepend.
  if (!prevData || prevData.length === 0 || added <= 0 || prevData.length !== data.length - added) return false;

  for (let i = 1; i < added; i++) {
    if (keyOf(data[i - 1]) >= keyOf(data[i])) return false;
  }
  if (keyOf(data[added - 1]) >= keyOf(prevData[0])) return false;

  for (let i = 0; i < prevData.length; i++) {
    if (!pointEquals(prevData[i] as T, data[added + i])) return false;
  }

  return true;
}

/** How the kept part of the previous data reads in the new array — see {@link continuation}. */
type Continuation = 'unchanged' | 'lastEdited';

/**
 * Whether `data` is the previous data with its first `dropped` points removed
 * and newer points appended — the precondition for the cheap append paths.
 * `'lastEdited'` when the old last point kept its X but changed its values
 * (a candle closed in the same commit that opens the next one); `null` when
 * any other kept point changed, or an appended point is not newer than the
 * one before it.
 *
 * Without a snapshot (`null`) there is nothing to diff, so the caller's
 * length-and-boundary reading stands. The same array mutated in place can only
 * be diffed at its old last point, against the copy in `prev`.
 */
function continuation<T extends InputPoint>(
  prev: SeriesSyncState,
  data: readonly T[],
  dropped: number,
): Continuation | null {
  const prevData = prev.data;
  if (!prevData) return 'unchanged';
  if (prevData === data) return lastEditedInPlace(prev, data) ? 'lastEdited' : 'unchanged';

  const kept = prevData.length - dropped;
  if (kept <= 0 || kept > data.length) return null;

  for (let i = 0; i < kept - 1; i++) {
    const before = prevData[dropped + i] as T;
    if (before === data[i]) continue;

    if (!pointEquals(before, data[i])) return null;
  }

  for (let i = kept; i < data.length; i++) {
    if (keyOf(data[i - 1]) >= keyOf(data[i])) return null;
  }

  const lastBefore = prevData[prevData.length - 1] as T;
  const lastNow = data[kept - 1];
  if (lastBefore === lastNow || pointEquals(lastBefore, lastNow)) return 'unchanged';
  if (keyOf(lastBefore) !== keyOf(lastNow)) return null;

  return 'lastEdited';
}

/** Whether the point that was last at the previous sync changed its values in place, keeping its X. */
function lastEditedInPlace<T extends InputPoint>(prev: SeriesSyncState, data: readonly T[]): boolean {
  const before = (prev.last ?? null) as T | null;
  const now = data[prev.len - 1];
  if (before === null || now === undefined) return false;

  return keyOf(before) === keyOf(now) && !pointEquals(before, now);
}

function syncedState<T extends InputPoint>(data: readonly T[]): SeriesSyncState {
  const last = data[data.length - 1];

  return { len: data.length, firstTime: keyOf(data[0]), lastTime: keyOf(last), data, last: { ...last } };
}

/** True for a {@link SeriesLayer} object — an object (not array) carrying a `data` array. */
function isSeriesLayer<T>(x: unknown): x is SeriesLayer<T> {
  return typeof x === 'object' && x !== null && !Array.isArray(x) && Array.isArray((x as { data?: unknown }).data);
}

/**
 * Normalize any accepted line/bar/band/candlestick `data` shape to a uniform
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
export function toLayers<T extends InputPoint>(
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
  data: MultiLayerData | BandData;
  /** Per-layer state from the previous call; one entry per layer. */
  prev: SeriesSyncState[];
}

/**
 * Reconcile a full line/bar/band `data` prop (any {@link MultiLayerData} or
 * {@link BandData} shape)
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
 * by the React / Vue / Svelte line, bar and band wrappers so all three behave alike.
 */
export function syncLayers(args: SyncLayersArgs): SeriesSyncState[] {
  const { chart, id } = args;
  const layers = toLayers<TimePointInput | BandPointInput | XPointInput | XBandPointInput>(args.data);

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

export interface SyncSeriesLayerArgs<T extends InputPoint> {
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
 *   - rolling-window slide (same length, head dropped + tail appended, every
 *     kept point proven unchanged) → `appendData` + `keepLast` (eases — no Y snap),
 *   - history prepend (N older points spliced onto the front, existing suffix
 *     untouched) → `prependData` (keeps the viewport put — no re-fit or snap),
 *   - bulk load / shrink / window shift → `setSeriesData`,
 *   - in-place last-point update (same length, same boundary timestamps,
 *     and every point but the last proven unchanged) → `updateData`,
 *   - same length but a middle value edited underneath matching boundary
 *     timestamps → `setSeriesData` (can't cheaply patch an arbitrary middle
 *     point, and skipping it would leave stale values on screen),
 *   - tail growth → `appendData` per new point,
 *   - either append path with the old last point edited at the same X →
 *     `updateData` on it first; any other kept point changed → `setSeriesData`.
 *
 * Stateless: returns the new state for the caller to persist. Shared by the
 * React, Vue and Svelte series wrappers so all three behave identically — in
 * particular the rolling-window path keeps streaming Y smooth everywhere,
 * instead of the per-tick snap the Vue/Svelte wrappers previously had.
 */
export function syncSeriesLayer<T extends InputPoint>(args: SyncSeriesLayerArgs<T>): SeriesSyncState {
  const { chart, id, data, prev, layerIndex } = args;

  if (data.length === 0) {
    chart.setSeriesData(id, [], layerIndex);

    return { len: 0, firstTime: null, lastTime: null, data: [], last: null };
  }

  // Re-fired sync with the very same array and no length change: either the
  // host re-rendered with a fresh wrapper around unchanged points (an inline
  // `{ color, data }` layer literal re-fires the data effect every render), or
  // it edited the array in place (Vue / Svelte `data[i] = x`). The copy of the
  // last point tells the two apart; an in-place edit of an older point goes
  // unseen. Classifying the array against itself would fall through to a bulk
  // `setSeriesData`, which snaps both axes mid-ease.
  if (prev.data === data && prev.len === data.length) {
    if (!lastEditedInPlace(prev, data)) return prev;

    chart.updateData(id, data[data.length - 1], layerIndex);

    return syncedState(data);
  }

  const firstTime = keyOf(data[0]);
  const lastTime = keyOf(data[data.length - 1]);

  // Category points (string `x`) have no order to slide or prepend along, so
  // only a value edit of the last point takes a cheap path.
  if (typeof firstTime === 'string') {
    const lastOnly = data.length === prev.len && middleUnchanged(prev.data, data);
    if (lastOnly) {
      chart.updateData(id, data[data.length - 1], layerIndex);
    } else {
      chart.setSeriesData(id, data, layerIndex);
    }

    return syncedState(data);
  }

  const shifted = prev.firstTime !== null && prev.firstTime !== firstTime;
  const added = data.length - prev.len;
  const hasNewLast = prev.lastTime !== null && prev.lastTime !== lastTime;

  const slide = shifted && added === 0 && hasNewLast ? continuation(prev, data, 1) : null;

  if (slide !== null) {
    // Rolling-window slide (maxPoints cap): oldest dropped, newest appended,
    // length unchanged. Append the new tail then trim the head — this path
    // goes through `keepLast` (no Y snap) instead of `setSeriesData`. Batched
    // so the append + trim run one `onDataChanged` pass, not two.
    chart.batch(() => {
      if (slide === 'lastEdited') {
        chart.updateData(id, data[data.length - 2], layerIndex);
      }

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
    const growth = continuation(prev, data, 0);

    if (growth === null) {
      chart.setSeriesData(id, data, layerIndex);
    } else {
      // Tail growth — a burst of ≤ BULK_THRESHOLD points in one commit. Batched:
      // every point still seeds its own entrance animator, but the engine
      // retargets once for the whole burst instead of once per point.
      chart.batch(() => {
        if (growth === 'lastEdited') {
          chart.updateData(id, data[prev.len - 1], layerIndex);
        }

        for (let i = prev.len; i < data.length; i++) {
          chart.appendData(id, data[i], layerIndex);
        }
      });
    }
  }

  return syncedState(data);
}

import type { ChartInstance } from '../chart';
import type { OHLCInput, TimePointInput } from '../types';
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
}

/** Initial state for a layer that has never been synced. */
export const EMPTY_SYNC_STATE: SeriesSyncState = { len: 0, firstTime: null, lastTime: null };

/**
 * Only fall back to a full `setSeriesData` replace when more than this many
 * new points arrive in a single tick — otherwise a streamed burst would look
 * like a bulk load and the renderer would clear its entrance animators (and
 * the Y axis would snap instead of easing). Streamed feeds emit a handful per
 * tick; history loads deliberately exceed this.
 */
const BULK_THRESHOLD = 20;

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
 *   - bulk load / shrink / window shift → `setSeriesData`,
 *   - in-place last-point update (same length, same timestamps) → `updateData`,
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

    return { len: 0, firstTime: null, lastTime: null };
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
  } else if (prev.len === 0 || data.length < prev.len || added > BULK_THRESHOLD || shifted) {
    chart.setSeriesData(id, data, layerIndex);
  } else if (data.length === prev.len) {
    chart.updateData(id, data[data.length - 1], layerIndex);
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

  return { len: data.length, firstTime, lastTime };
}

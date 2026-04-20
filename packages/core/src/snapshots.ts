import type { ChartInstance } from './chart';
import type { OHLCData, TimePoint } from './types';

/**
 * Frozen, per-row snapshot of a series at a single point in time. The shape
 * `buildHoverSnapshots` / `buildLastSnapshots` return to overlay slot
 * consumers.
 *
 * **Two identities, one snapshot:**
 * - `id` is the **row key** — guaranteed unique within the returned array,
 *   safe for React `key`, Vue `:key`, Svelte `each … (key)`. For single-layer
 *   series this equals the `seriesId`; for multi-layer series it's
 *   `${seriesId}_layer${layerIndex}`.
 * - `seriesId` is the **owning series identity** — never carries a layer
 *   suffix, not unique across multi-layer rows. Use it for filtering or
 *   grouping (e.g. `snapshots.filter(s => s.seriesId === 'btc')`).
 *
 * `data` is a shallow clone, frozen along with the snapshot itself — a slot
 * consumer cannot accidentally mutate the chart's internal store.
 */
export interface SeriesSnapshot {
  readonly id: string;
  readonly seriesId: string;
  readonly layerIndex?: number;
  readonly label?: string;
  readonly data: Readonly<OHLCData> | Readonly<TimePoint>;
  readonly color: string;
}

/** Sort order applied to a snapshot list by the helper. */
export type SnapshotSort = 'none' | 'asc' | 'desc';

export interface BuildHoverSnapshotsArgs {
  /** Timestamp to resolve each series at. Typically `crosshair.time`. */
  time: number;
  /** Sort the output by numeric value. Default: `'none'`. */
  sort?: SnapshotSort;
  /**
   * Cache bucket key. Distinct buckets (e.g. `'tooltip'`, `'infobar-hover'`)
   * let separate overlays cache independently so they don't invalidate each
   * other on every call.
   */
  cacheKey: string;
}

export interface BuildLastSnapshotsArgs {
  sort?: SnapshotSort;
  cacheKey: string;
}

interface CacheSlot {
  version: number;
  time: number | null;
  sort: SnapshotSort;
  data: readonly SeriesSnapshot[];
}

// One map per chart instance — weak reference so the cache dies with the chart.
const cacheByChart = new WeakMap<ChartInstance, Map<string, CacheSlot>>();

function getSlot(chart: ChartInstance, cacheKey: string): CacheSlot | undefined {
  return cacheByChart.get(chart)?.get(cacheKey);
}

function setSlot(chart: ChartInstance, cacheKey: string, slot: CacheSlot): void {
  let bucket = cacheByChart.get(chart);
  if (!bucket) {
    bucket = new Map();
    cacheByChart.set(chart, bucket);
  }
  bucket.set(cacheKey, slot);
}

function extractValue(p: OHLCData | TimePoint): number {
  return 'close' in p ? p.close : p.value;
}

function sortSnapshots(snapshots: SeriesSnapshot[], sort: SnapshotSort): SeriesSnapshot[] {
  if (sort === 'none' || snapshots.length <= 1) return snapshots;

  const sorted = [...snapshots];
  sorted.sort((a, b) => {
    const av = extractValue(a.data as OHLCData | TimePoint);
    const bv = extractValue(b.data as OHLCData | TimePoint);

    return sort === 'asc' ? av - bv : bv - av;
  });

  return sorted;
}

function freezeSnapshot(s: {
  id: string;
  seriesId: string;
  layerIndex?: number;
  label?: string;
  data: OHLCData | TimePoint;
  color: string;
}): SeriesSnapshot {
  // Deep-freeze: without cloning `data`, callers with `snapshot.data.close = X`
  // would mutate the chart's internal store directly.
  const frozenData = Object.freeze({ ...s.data });
  const frozen: SeriesSnapshot = {
    id: s.id,
    seriesId: s.seriesId,
    layerIndex: s.layerIndex,
    label: s.label,
    data: frozenData,
    color: s.color,
  };

  return Object.freeze(frozen);
}

/**
 * Snapshot every visible series / layer at `time`. Used by hover overlays
 * (`InfoBar` in hover mode, `Tooltip`). Hidden series and hidden layers are
 * skipped automatically — the returned array reflects what the chart would
 * actually be drawing.
 *
 * The result is cached per `(chart, cacheKey)` slot; as long as
 * `chart.getOverlayVersion()` hasn't changed and `time`/`sort` match the
 * cached call, the **same reference** is returned. This makes
 * `React.memo((a, b) => a.snapshots === b.snapshots)` skip renders on
 * crosshair moves that stay within one data point.
 */
export function buildHoverSnapshots(chart: ChartInstance, args: BuildHoverSnapshotsArgs): readonly SeriesSnapshot[] {
  const sort = args.sort ?? 'none';
  const version = chart.getOverlayVersion();
  const cached = getSlot(chart, args.cacheKey);
  if (cached && cached.version === version && cached.time === args.time && cached.sort === sort) {
    return cached.data;
  }

  const out: SeriesSnapshot[] = [];
  for (const id of chart.getSeriesIds()) {
    if (!chart.isSeriesVisible(id)) continue;

    const label = chart.getSeriesLabel(id);
    const isMultiLayer = chart.getSeriesLayers(id) !== null;

    if (isMultiLayer) {
      // Multi-layer: rely on the real `layerIndex` + resolved sample `time`
      // the renderer reports. A null result means *every* layer is hidden
      // — the chart is drawing nothing for this series, so we skip it
      // instead of falling through to `getDataAtTime` (which would resurrect
      // layer 0's data as a phantom row).
      const layers = chart.getLayerSnapshots(id, args.time);
      if (!layers) continue;

      for (const l of layers) {
        out.push(
          freezeSnapshot({
            id: `${id}_layer${l.layerIndex}`,
            seriesId: id,
            layerIndex: l.layerIndex,
            label,
            data: { time: l.time, value: l.value } as TimePoint,
            color: l.color,
          }),
        );
      }

      continue;
    }

    const d = chart.getDataAtTime(id, args.time);
    if (!d) continue;

    out.push(
      freezeSnapshot({
        id,
        seriesId: id,
        label,
        data: d,
        color: chart.getSeriesColor(id) ?? '#888',
      }),
    );
  }

  const data = Object.freeze(sortSnapshots(out, sort));
  setSlot(chart, args.cacheKey, { version, time: args.time, sort, data });

  return data;
}

/**
 * Snapshot every visible series / layer at its own last point. For
 * multi-layer renderers each layer contributes its own `time`, so ragged
 * streams (layer 1 newer than layer 0) show correctly instead of stalling
 * at the primary layer's timestamp.
 *
 * Cached by `(chart, cacheKey)` + `sort`, invalidated on
 * `chart.getOverlayVersion()` bump. `time` is not an input, so the slot is
 * stored with `time: null`.
 */
export function buildLastSnapshots(chart: ChartInstance, args: BuildLastSnapshotsArgs): readonly SeriesSnapshot[] {
  const sort = args.sort ?? 'none';
  const version = chart.getOverlayVersion();
  const cached = getSlot(chart, args.cacheKey);
  if (cached && cached.version === version && cached.time === null && cached.sort === sort) {
    return cached.data;
  }

  const out: SeriesSnapshot[] = [];
  for (const id of chart.getSeriesIds()) {
    if (!chart.isSeriesVisible(id)) continue;

    const label = chart.getSeriesLabel(id);
    const layerLasts = chart.getLayerLastSnapshots(id);
    if (layerLasts) {
      for (const l of layerLasts) {
        out.push(
          freezeSnapshot({
            id: `${id}_layer${l.layerIndex}`,
            seriesId: id,
            layerIndex: l.layerIndex,
            label,
            data: { time: l.time, value: l.value } as TimePoint,
            color: l.color,
          }),
        );
      }

      continue;
    }

    const d = chart.getLastData(id);
    if (!d) continue;

    out.push(
      freezeSnapshot({
        id,
        seriesId: id,
        label,
        data: d,
        color: chart.getSeriesColor(id) ?? '#888',
      }),
    );
  }

  const data = Object.freeze(sortSnapshots(out, sort));
  setSlot(chart, args.cacheKey, { version, time: null, sort, data });

  return data;
}

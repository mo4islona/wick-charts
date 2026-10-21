import type { ChartInstance } from './chart';
import type { LayerSnapshot } from './series/types';
import type { BandPoint, OHLCData, TimePoint } from './types';
import { type TooltipFormatter, formatTooltipValue, formatWholeTooltipValue } from './utils/format';
import { type SeriesPoint, isGapPoint, pointValue } from './utils/point';
import { formatDate } from './utils/time';

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
 * consumer cannot accidentally mutate the chart's internal store. Its shape
 * follows the series: `OHLCData` for a candlestick, `TimePoint` for a line or
 * bar, `BandPoint` (`{ time, low, high }`) for a band.
 */
export interface SeriesSnapshot {
  readonly id: string;
  readonly seriesId: string;
  readonly layerIndex?: number;
  readonly label?: string;
  readonly data: Readonly<OHLCData> | Readonly<TimePoint> | Readonly<BandPoint>;
  readonly color: string;
  /** On a percent stack, the layer's share of the column in percent — what the chart draws it at. */
  readonly share?: number;
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

/** A layer row's point — a band layer carries its edges, every other layer one value. */
function layerPoint(layer: LayerSnapshot): TimePoint | BandPoint {
  const point: TimePoint | BandPoint =
    layer.low !== undefined && layer.high !== undefined
      ? { time: layer.time, low: layer.low, high: layer.high }
      : { time: layer.time, value: layer.value };
  if (layer.x !== undefined) point.x = layer.x;

  return point;
}

function sortSnapshots(snapshots: SeriesSnapshot[], sort: SnapshotSort): SeriesSnapshot[] {
  if (sort === 'none' || snapshots.length <= 1) return snapshots;

  const sorted = [...snapshots];
  sorted.sort((a, b) => {
    const av = pointValue(a.data);
    const bv = pointValue(b.data);

    return sort === 'asc' ? av - bv : bv - av;
  });

  return sorted;
}

function freezeSnapshot(s: {
  id: string;
  seriesId: string;
  layerIndex?: number;
  label?: string;
  data: SeriesPoint;
  color: string;
  share?: number;
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
    ...(s.share === undefined ? {} : { share: s.share }),
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
 * `chart.getSnapshotVersion()` hasn't changed and `time`/`sort` match the
 * cached call, the **same reference** is returned. This makes
 * `React.memo((a, b) => a.snapshots === b.snapshots)` skip renders on
 * crosshair moves that stay within one data point.
 */
export function buildHoverSnapshots(chart: ChartInstance, args: BuildHoverSnapshotsArgs): readonly SeriesSnapshot[] {
  const sort = args.sort ?? 'none';
  const version = chart.getSnapshotVersion();
  const cached = getSlot(chart, args.cacheKey);
  if (cached && cached.version === version && cached.time === args.time && cached.sort === sort) {
    return cached.data;
  }

  const out: SeriesSnapshot[] = [];
  for (const id of chart.getSeriesIds()) {
    if (!chart.isSeriesVisible(id)) continue;

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
        const point = layerPoint(l);
        if (isGapPoint(point)) continue;

        out.push(
          freezeSnapshot({
            id: `${id}_layer${l.layerIndex}`,
            seriesId: id,
            layerIndex: l.layerIndex,
            label: chart.getLayerLabel(id, l.layerIndex),
            data: point,
            color: l.color,
            share: l.share,
          }),
        );
      }

      continue;
    }

    // A gap has no reading to show — leave its row out instead of printing 0.
    const d = chart.getDataAtTime(id, args.time);
    if (!d || isGapPoint(d)) continue;

    out.push(
      freezeSnapshot({
        id,
        seriesId: id,
        label: chart.getSeriesLabel(id),
        data: d,
        // At the hovered value: a sign- or threshold-colored series names this point's color.
        color: chart.getSeriesColorAt(id, pointValue(d)) ?? '#888',
      }),
    );
  }

  const data = Object.freeze(sortSnapshots(out, sort));
  setSlot(chart, args.cacheKey, { version, time: args.time, sort, data });

  return data;
}

interface HeaderArgs {
  time: number;
  snapshots: readonly SeriesSnapshot[];
  interval: number;
}

const DAY = 86_400_000;

/** The time of the snapshot point nearest to `time`; `time` itself when there is none. */
function nearestPointTime(time: number, snapshots: readonly SeriesSnapshot[]): number {
  let nearest = time;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const snapshot of snapshots) {
    const distance = Math.abs(snapshot.data.time - time);
    // A tie goes to the later point, as `findNearest` does, so the sort order can't flip it.
    const tieLoses = distance === bestDistance && snapshot.data.time <= nearest;
    if (distance > bestDistance || tieLoses) continue;

    bestDistance = distance;
    nearest = snapshot.data.time;
  }

  return nearest;
}

/**
 * The X label of a tooltip / info-bar header at `time` (the crosshair time,
 * or the newest point's). It names the nearest snapshot's point, not the
 * pointer position, so the label matches the values listed under it; a
 * numeric X prints with that value's own decimals.
 */
export function formatHeaderX(chart: ChartInstance, args: HeaderArgs): string {
  const nearest = nearestPointTime(args.time, args.snapshots);

  return chart.timeScale.formatPointX(nearest, args.interval);
}

/**
 * The full tooltip header: on a time axis the point's date, plus its time of
 * day when the data is intraday; elsewhere {@link formatHeaderX}.
 */
export function formatTooltipHeader(chart: ChartInstance, args: HeaderArgs): string {
  const x = formatHeaderX(chart, args);
  if (chart.timeScale.getType() !== 'time') return x;

  const nearest = nearestPointTime(args.time, args.snapshots);
  const date = formatDate(nearest, { locale: chart.timeScale.getLocale(), timeZone: chart.timeScale.getTimeZone() });

  // The built-in label of daily or coarser data is the date again.
  const repeatsDate = args.interval >= DAY && chart.timeScale.getFormat() === null;
  if (repeatsDate) return date;

  return `${date} ${x}`;
}

/**
 * The formatter for one Tooltip / InfoBar row: `format` when the caller passed
 * one, else {@link formatTooltipValue} — without decimals when every value of
 * the row's series is a whole number.
 */
export function rowFormatter(
  chart: ChartInstance,
  snapshot: SeriesSnapshot,
  format: TooltipFormatter | undefined,
): TooltipFormatter {
  if (format) return format;

  return chart.hasOnlyWholeValues(snapshot.seriesId) ? formatWholeTooltipValue : formatTooltipValue;
}

/**
 * The value a line or bar row prints: on a percent stack its share leads, then
 * the value itself ("42.1% · 25.77M").
 */
export function formatRowValue(snapshot: SeriesSnapshot, format: (value: number) => string): string {
  const value = format(pointValue(snapshot.data));
  if (snapshot.share === undefined) return value;

  const share = Number(snapshot.share.toFixed(1));

  return `${share}% · ${value}`;
}

/**
 * Snapshot every visible series / layer at its own last point. For
 * multi-layer renderers each layer contributes its own `time`, so ragged
 * streams (layer 1 newer than layer 0) show correctly instead of stalling
 * at the primary layer's timestamp.
 *
 * Cached by `(chart, cacheKey)` + `sort`, invalidated on
 * `chart.getSnapshotVersion()` bump. `time` is not an input, so the slot is
 * stored with `time: null`.
 */
export function buildLastSnapshots(chart: ChartInstance, args: BuildLastSnapshotsArgs): readonly SeriesSnapshot[] {
  const sort = args.sort ?? 'none';
  const version = chart.getSnapshotVersion();
  const cached = getSlot(chart, args.cacheKey);
  if (cached && cached.version === version && cached.time === null && cached.sort === sort) {
    return cached.data;
  }

  const out: SeriesSnapshot[] = [];
  for (const id of chart.getSeriesIds()) {
    if (!chart.isSeriesVisible(id)) continue;

    const layerLasts = chart.getLayerLastSnapshots(id);
    if (layerLasts) {
      for (const l of layerLasts) {
        const point = layerPoint(l);
        if (isGapPoint(point)) continue;

        out.push(
          freezeSnapshot({
            id: `${id}_layer${l.layerIndex}`,
            seriesId: id,
            layerIndex: l.layerIndex,
            label: chart.getLayerLabel(id, l.layerIndex),
            data: point,
            color: l.color,
            share: l.share,
          }),
        );
      }

      continue;
    }

    const d = chart.getLastData(id);
    if (!d || isGapPoint(d)) continue;

    out.push(
      freezeSnapshot({
        id,
        seriesId: id,
        label: chart.getSeriesLabel(id),
        data: d,
        color: chart.getSeriesColor(id) ?? '#888',
      }),
    );
  }

  const data = Object.freeze(sortSnapshots(out, sort));
  setSlot(chart, args.cacheKey, { version, time: null, sort, data });

  return data;
}

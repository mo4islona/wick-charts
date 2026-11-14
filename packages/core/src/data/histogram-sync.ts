import type { ChartInstance } from '../chart';
import type { HistogramBin, HistogramData, HistogramInput, SeriesLayer } from '../types';

/** Per-layer bookkeeping of {@link syncHistogramLayers}: the array it last sent and that array's length. */
export interface HistogramSyncState {
  data: HistogramInput | null;
  len: number;
}

/** Initial state for a histogram layer that has never been synced. */
export const EMPTY_HISTOGRAM_SYNC_STATE: HistogramSyncState = { data: null, len: 0 };

type HistogramLayer = SeriesLayer<number> | SeriesLayer<HistogramBin>;

function isLayerObject(value: unknown): value is HistogramLayer {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;

  return Array.isArray((value as { data?: unknown }).data);
}

/**
 * Normalize any accepted histogram `data` shape to a list of layers. A flat
 * list of samples or bins is one layer; a list of lists or named layers is
 * several, overlaid. An empty list is one empty layer.
 */
export function toHistogramLayers(data: HistogramData): Array<SeriesLayer<number | HistogramBin>> {
  if (!Array.isArray(data)) return [data as SeriesLayer<number | HistogramBin>];
  if (data.length === 0) return [{ data: [] }];

  const first = data[0];
  const layered = Array.isArray(first) || isLayerObject(first);
  if (!layered) return [{ data: data as HistogramInput }];

  return (data as Array<HistogramInput | HistogramLayer>).map((layer) =>
    Array.isArray(layer) ? { data: layer } : (layer as SeriesLayer<number | HistogramBin>),
  );
}

export interface SyncHistogramLayersArgs {
  chart: ChartInstance;
  id: string;
  data: HistogramData;
  /** Per-layer state from the previous call; one entry per layer. */
  prev: readonly HistogramSyncState[];
}

/**
 * Mirror a histogram `data` prop into the chart: layer names and colors, then
 * each layer whose samples changed. The series re-bins and morphs on every
 * change, so a new array is one `setSeriesData`, whatever changed in it. The
 * same array with a new length (a Vue / Svelte `push`) counts as changed.
 *
 * Stateless: returns the new per-layer states for the caller to persist.
 */
export function syncHistogramLayers(args: SyncHistogramLayersArgs): HistogramSyncState[] {
  const { chart, id } = args;
  const layers = toHistogramLayers(args.data);

  const labels = layers.length > 1 ? layers.map((layer, i) => layer.label ?? `Series ${i + 1}`) : [layers[0].label];
  chart.setSeriesLabels(id, labels);
  chart.setLayerColors(
    id,
    layers.map((layer) => layer.color),
  );

  const next: HistogramSyncState[] = [];
  chart.batch(() => {
    for (let i = 0; i < layers.length; i++) {
      const data = layers[i].data as HistogramInput;
      const prev = args.prev[i] ?? EMPTY_HISTOGRAM_SYNC_STATE;
      next[i] = { data, len: data.length };

      const unchanged = prev.data === data && prev.len === data.length;
      if (unchanged) continue;

      chart.setSeriesData(id, data, i);
    }
  });

  return next;
}

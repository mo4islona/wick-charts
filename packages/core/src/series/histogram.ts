import { DEFAULT_HISTOGRAM_ENTRY, DEFAULT_HISTOGRAM_INTRO, DEFAULT_HISTOGRAM_SMOOTH } from '../animation/config';
import { ScalarSpring } from '../animation/scalar-spring';
import { drawChip, measureChip } from '../components/annotation-chip';
import { renderReferenceLine } from '../components/reference-line';
import type { ChartTheme } from '../theme/types';
import type {
  HistogramBin,
  HistogramBinPoint,
  HistogramNormalize,
  HistogramQuantile,
  HistogramSeriesOptions,
  ValueColor,
} from '../types';
import { warnDataOnce } from '../utils/poisoned-data-reporter';
import { BaseMultiLayerSeries } from './base-multi-layer';
import type { SeriesDefinition } from './definition';
import {
  type BinLayout,
  binLayout,
  cleanEdge,
  countIntoBins,
  quantileOfBins,
  quantileOfSorted,
  sampleExtent,
} from './histogram-bins';
import { fillRoundedRect } from './painters/canvas-path';
import type { HoverLookupOptions, LayerSnapshot, SeriesRenderContext, ValueRangeOptions, XTickGrid } from './types';

type ResolvedHistogramOptions = Omit<
  HistogramSeriesOptions,
  'entryMs' | 'smoothMs' | 'introMs' | 'normalize' | 'gap' | 'cornerRadius'
> & {
  /** One resolver per layer; the theme palette, or a layer's `color` from the data. */
  colors: ValueColor[];
  normalize: HistogramNormalize;
  gap: number;
  cornerRadius: number;
  entryMs: number;
  smoothMs: number;
  introMs: number;
  historyRevealMs: number;
  stacking: 'off';
};

type HistogramOptionsInput = Partial<HistogramSeriesOptions> & { colors?: ValueColor[] };

/** A layer's data as it came in: raw samples, bins counted already, or nothing yet. */
type LayerInput = { kind: 'samples'; samples: number[] } | { kind: 'bins'; bins: HistogramBin[] } | { kind: 'empty' };

/** A bin that new data dropped, shrinking away where it stood. */
interface ExitBar {
  x0: number;
  x1: number;
  value: number;
  startTime: number;
}

/** A quantile line as the renderer draws it: its X eases to new data. */
interface QuantileLine {
  q: number;
  label: string;
  color: string | undefined;
  spring: ScalarSpring;
}

const DEFAULT_OVERLAY_OPACITY = 0.55;
const DEFAULT_GAP = 1;
const QUANTILE_CHIP_GAP = 4;

const TOP_CORNERS = { tl: true, tr: true, br: false, bl: false };

function normalize(options: HistogramOptionsInput & { colors: ValueColor[] }): ResolvedHistogramOptions {
  return {
    ...options,
    normalize: options.normalize ?? 'count',
    gap: Math.max(0, options.gap ?? DEFAULT_GAP),
    cornerRadius: Math.max(0, options.cornerRadius ?? 0),
    entryMs: options.entryMs === false ? 0 : (options.entryMs ?? DEFAULT_HISTOGRAM_ENTRY),
    smoothMs: options.smoothMs === false ? 0 : (options.smoothMs ?? DEFAULT_HISTOGRAM_SMOOTH),
    introMs: options.introMs === false ? 0 : (options.introMs ?? DEFAULT_HISTOGRAM_INTRO),
    historyRevealMs: 0,
    stacking: 'off',
  };
}

function isBin(value: unknown): value is HistogramBin {
  if (typeof value !== 'object' || value === null) return false;

  const bin = value as Partial<HistogramBin>;

  return typeof bin.x0 === 'number' && typeof bin.x1 === 'number';
}

function quantileLabel(q: number): string {
  return `p${Number((q * 100).toFixed(1))}`;
}

/** The fraction `0`–`1` one quantile entry asks for, or `null` for a bad one. */
function quantileSpec(entry: number | HistogramQuantile): HistogramQuantile | null {
  const spec = typeof entry === 'number' ? { q: entry } : entry;
  if (!Number.isFinite(spec.q) || spec.q < 0 || spec.q > 1) return null;

  return spec;
}

/**
 * A histogram: bins drawn as contiguous bars on a numeric X axis. Raw samples are
 * binned here — every raw layer on one shared set of bins, so overlaid layers line
 * up — and pre-binned layers are drawn as given. The store holds one point per bin
 * at its center, so the base class eases heights, fades layers and answers the
 * value range; new data re-bins and morphs every layer.
 */
export class HistogramRenderer extends BaseMultiLayerSeries<HistogramBinPoint> {
  readonly kind = 'histogram' as const;
  /** Every data change re-bins, so the chart re-fits X and eases Y as for a morph. */
  readonly reshapesOnData = true;
  protected declare options: ResolvedHistogramOptions;

  #inputs: LayerInput[];
  /** Ascending raw samples per layer, sorted on demand for the quantiles. */
  #sorted: Array<number[] | null>;
  readonly #exits: Array<Map<number, ExitBar>>;
  #quantiles: QuantileLine[][];
  #grid: XTickGrid | null = null;
  /** The chart hears of a re-bin once, after every layer moved: per store it would fit Y to half-converted layers. */
  readonly #dataListeners = new Set<() => void>();
  /** First palette slot of the theme default colors — see `SeriesCreateEnv.paletteIndex`. */
  readonly #paletteIndex: number;
  /**
   * Per layer, new height over old height of each bin while a `normalize` switch re-bins:
   * the bars start from their screen height in the new units, as Y snaps to them.
   */
  #unitScale: Array<Map<number, number>> | null = null;
  /** Widest bin of any layer, in X units — the draw range widens by it so a bar straddling the edge still draws. */
  #maxBinWidth = 0;
  /** Narrowest bin of any layer, in X units; `null` without bins. */
  #minBinWidth: number | null = null;

  constructor(layerCount: number, options?: HistogramOptionsInput, paletteIndex = 0) {
    super(layerCount);
    this.#paletteIndex = paletteIndex;
    this.options = normalize({ colors: ['#5b8def'], ...options });
    this.#inputs = Array.from({ length: layerCount }, (): LayerInput => ({ kind: 'empty' }));
    this.#sorted = new Array(layerCount).fill(null);
    this.#exits = Array.from({ length: layerCount }, () => new Map<number, ExitBar>());
    this.#quantiles = Array.from({ length: layerCount }, () => []);
  }

  updateOptions(options: HistogramOptionsInput): void {
    const prev = this.options;
    this.options = normalize({ ...this.options, ...options });

    const rebins =
      prev.bins !== this.options.bins ||
      prev.binWidth !== this.options.binWidth ||
      prev.binOrigin !== this.options.binOrigin ||
      prev.normalize !== this.options.normalize;
    const unitsChanged = prev.normalize !== this.options.normalize;
    if (rebins && this.#hasData()) this.#rebin({ unitsChanged });
    if (prev.quantiles !== this.options.quantiles) this.#syncQuantiles({ snap: false });
  }

  applyTheme(theme: ChartTheme, _prev: ChartTheme): void {
    this.updateOptions({ colors: paletteColors({ theme, count: this.stores.length, start: this.#paletteIndex }) });
  }

  get valueRangeKey(): string {
    return this.options.normalize;
  }

  protected isEntryEnabled(): boolean {
    return true;
  }

  onDataChanged(listener: () => void): () => void {
    this.#dataListeners.add(listener);

    return () => {
      this.#dataListeners.delete(listener);
    };
  }

  dispose(): void {
    super.dispose();
    this.#dataListeners.clear();
  }

  // --- Data ingest ----------------------------------------------------------

  setData(data: unknown, layerIndex = 0): void {
    if (layerIndex < 0 || layerIndex >= this.stores.length) return;

    this.#inputs[layerIndex] = this.#parse(data);
    this.#sorted[layerIndex] = null;
    this.#rebin();
  }

  morphData(data: unknown, layerIndex = 0): void {
    this.setData(data, layerIndex);
  }

  /** A sample (or a bin, on a pre-binned layer) joins the layer, and every layer re-bins. */
  appendPoint(point: unknown, layerIndex = 0): void {
    this.#mutate({ layerIndex, points: [point], apply: (list, added) => [...list, ...added] });
  }

  prependPoints(points: unknown[], layerIndex = 0): void {
    this.#mutate({ layerIndex, points, apply: (list, added) => [...added, ...list] });
  }

  /** Replace the layer's newest sample — or, on a pre-binned layer, the bin at the same `x0`, else the last. */
  updateLastPoint(point: unknown, layerIndex = 0): void {
    this.#mutate({
      layerIndex,
      points: [point],
      apply: (list, [next]) => {
        if (list.length === 0) return [next];

        if (isBin(next)) {
          const bins = list as HistogramBin[];
          const at = bins.findIndex((bin) => bin.x0 === next.x0);
          const index = at >= 0 ? at : bins.length - 1;

          return [...bins.slice(0, index), next, ...bins.slice(index + 1)];
        }

        return [...list.slice(0, -1), next];
      },
    });
  }

  /** Keep the layer's newest `count` samples (or bins): a rolling window over a stream. */
  keepLast(count: number, layerIndex = 0): void {
    const input = this.#inputs[layerIndex];
    if (input === undefined || input.kind === 'empty' || count < 0) return;

    const list = input.kind === 'samples' ? input.samples : input.bins;
    if (list.length <= count) return;

    this.#mutate({ layerIndex, points: [], apply: (all) => all.slice(all.length - count) });
  }

  #mutate<T extends number | HistogramBin>(args: {
    layerIndex: number;
    points: readonly unknown[];
    apply: (list: readonly T[], added: T[]) => T[];
  }): void {
    const { layerIndex } = args;
    const input = this.#inputs[layerIndex];
    if (input === undefined) return;

    const added = this.#parse(args.points);
    const mixed = input.kind !== 'empty' && added.kind !== 'empty' && added.kind !== input.kind;
    if (mixed) {
      warnDataOnce({
        token: this,
        topic: 'histogram-mixed',
        message:
          `histogram layer ${layerIndex} holds ${input.kind === 'samples' ? 'raw samples' : 'bins'}; ` +
          'points of the other kind are skipped.',
      });

      return;
    }

    const kind = input.kind === 'empty' ? added.kind : input.kind;
    if (kind === 'empty') return;

    const list = (input.kind === 'samples' ? input.samples : input.kind === 'bins' ? input.bins : []) as T[];
    const addedList = (added.kind === 'samples' ? added.samples : added.kind === 'bins' ? added.bins : []) as T[];
    const next = args.apply(list, addedList);

    this.#inputs[layerIndex] =
      kind === 'samples' ? { kind, samples: next as number[] } : { kind, bins: sortBins(next as HistogramBin[]) };
    this.#sorted[layerIndex] = null;
    this.#rebin();
  }

  /** Read one layer's input; a bad sample or bin is skipped, and noted. */
  #parse(data: unknown): LayerInput {
    if (!Array.isArray(data) || data.length === 0) return { kind: 'empty' };

    const first = data.find((item) => item !== null && item !== undefined);
    if (isBin(first)) {
      const bins = data.filter((item): item is HistogramBin => isBin(item) && validBin(item));
      if (bins.length < data.length) {
        warnDataOnce({
          token: this,
          topic: 'histogram-bad-bin',
          message: `skipped ${data.length - bins.length} histogram bin(s) without a finite x0 < x1 and count.`,
        });
      }

      return { kind: 'bins', bins: sortBins(bins) };
    }

    const samples = data.filter((item): item is number => typeof item === 'number' && Number.isFinite(item));
    if (samples.length < data.length) {
      warnDataOnce({
        token: this,
        topic: 'histogram-bad-sample',
        message: `skipped ${data.length - samples.length} histogram sample(s) that are not finite numbers.`,
      });
    }

    return samples.length > 0 ? { kind: 'samples', samples } : { kind: 'empty' };
  }

  #hasData(): boolean {
    return this.#inputs.some((input) => input.kind !== 'empty');
  }

  /**
   * Re-bin every layer from its input and hand the bins to the stores: the first
   * data seeds them (and plays the intro), later data morphs them — a bin that
   * keeps its center eases to its new height, a new one grows in, a dropped one
   * shrinks away.
   */
  #rebin(opts: { unitsChanged?: boolean } = {}): void {
    const hadData = this.stores.some((store) => store.length > 0);
    const binned = this.#binLayers();
    const layers = binned.bins.map((bins) => toPoints({ bins, normalize: this.options.normalize }));
    this.#unitScale = opts.unitsChanged ? this.#unitScales(layers) : null;
    // Bars still fading out hold heights in the old units.
    if (opts.unitsChanged) {
      for (const exits of this.#exits) {
        exits.clear();
      }
    }

    for (let li = 0; li < this.stores.length; li++) {
      if (!hadData) {
        super.setData(layers[li], li);
        continue;
      }

      this.#morphLayer(li, layers[li]);
    }

    this.#unitScale = null;

    this.#grid = binned.grid;
    this.#maxBinWidth = binned.maxWidth;
    this.#minBinWidth = narrowestBin(binned.bins);
    this.#syncQuantiles({ snap: !hadData });

    for (const listener of this.#dataListeners) {
      listener();
    }
  }

  /** New height over stored height per bin of each layer, for a bin kept across a units switch. */
  #unitScales(layers: readonly HistogramBinPoint[][]): Array<Map<number, number>> {
    return layers.map((points, li) => {
      const scales = new Map<number, number>();
      for (const point of points) {
        const before = this.stores[li].findNearest(point.time, 0);
        if (before !== null && before.value > 0) scales.set(point.time, point.value / before.value);
      }

      return scales;
    });
  }

  /** Morph one store to `points`; a bin it no longer holds shrinks away where it stood. */
  #morphLayer(layerIndex: number, points: HistogramBinPoint[]): void {
    const store = this.stores[layerIndex];
    const left = new Map<number, ExitBar>();
    const now = performance.now();
    for (const point of store.getAll()) {
      const value = this.liveValue(layerIndex, point.time, point.value);
      left.set(point.time, { x0: point.x0, x1: point.x1, value, startTime: now });
    }

    // Across a `normalize` switch a bar starts from its screen height in the new units, so it never leaves the plot.
    const scales = this.#unitScale?.[layerIndex];
    const from =
      scales === undefined
        ? undefined
        : (point: { time: number; shown: number }) => point.shown * (scales.get(point.time) ?? 1);
    super.morphData(points, layerIndex, { from });

    const exits = this.#exits[layerIndex];
    for (const point of points) {
      left.delete(point.time);
      exits.delete(point.time);
    }
    if (this.options.entryMs <= 0) return;

    for (const [time, exit] of left) {
      if (exit.value > 0) exits.set(time, exit);
    }
  }

  /**
   * Bins per layer. Raw layers share one layout over their joint extent, so
   * overlaid distributions are counted into the same bins; a pre-binned layer
   * keeps its own. `grid` is the common edge step when every layer has one.
   */
  #binLayers(): { bins: HistogramBin[][]; grid: XTickGrid | null; maxWidth: number } {
    const layout = this.#sharedLayout();
    const bins = this.#inputs.map((input): HistogramBin[] => {
      if (input.kind === 'bins') return input.bins;
      if (input.kind === 'samples' && layout !== null) return countIntoBins(input.samples, layout);

      return [];
    });

    const grids: XTickGrid[] = layout === null ? [] : [tickGrid({ step: layout.width, edge: layout.start })];
    let maxWidth = layout?.width ?? 0;
    let uniform = true;
    for (const input of this.#inputs) {
      if (input.kind !== 'bins' || input.bins.length === 0) continue;

      for (const bin of input.bins) {
        maxWidth = Math.max(maxWidth, bin.x1 - bin.x0);
      }

      const step = uniformStep(input.bins);
      if (step === null) uniform = false;
      else grids.push(tickGrid({ step, edge: input.bins[0].x0 }));
    }

    const first = grids[0];
    const shared = uniform && first !== undefined && grids.every((grid) => onGrid({ grid: first, other: grid }));

    return { bins, grid: shared ? first : null, maxWidth };
  }

  #sharedLayout(): BinLayout | null {
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    let largest = 0;
    for (const input of this.#inputs) {
      if (input.kind !== 'samples') continue;

      const extent = sampleExtent(input.samples);
      if (extent === null) continue;

      min = Math.min(min, extent.min);
      max = Math.max(max, extent.max);
      largest = Math.max(largest, input.samples.length);
    }
    if (min > max) return null;

    const { bins, binWidth, binOrigin } = this.options;

    return binLayout({ min, max, sampleCount: largest, bins, binWidth, binOrigin });
  }

  // --- Quantiles ------------------------------------------------------------

  /** Recompute every quantile line; a line already drawn eases to its new X. */
  #syncQuantiles(args: { snap: boolean }): void {
    const specs = (this.options.quantiles ?? []).map(quantileSpec).filter((s): s is HistogramQuantile => s !== null);

    this.#quantiles = this.#inputs.map((_, li) => {
      const previous = new Map(this.#quantiles[li]?.map((line) => [line.q, line]));
      const lines: QuantileLine[] = [];
      for (const spec of specs) {
        const x = this.#quantileAt(li, spec.q);
        if (x === null) continue;

        const prev = previous.get(spec.q);
        const spring = prev?.spring ?? new ScalarSpring(x);
        const snaps = args.snap || prev === undefined || this.options.smoothMs <= 0;
        if (snaps) spring.snap(x);
        else if (spring.target !== x) spring.retarget(x, { settleMs: this.options.smoothMs });

        lines.push({ q: spec.q, label: spec.label ?? quantileLabel(spec.q), color: spec.color, spring });
      }

      return lines;
    });
  }

  #quantileAt(layerIndex: number, q: number): number | null {
    const input = this.#inputs[layerIndex];
    if (input.kind === 'bins') return quantileOfBins(input.bins, q);
    if (input.kind === 'empty') return null;

    let sorted = this.#sorted[layerIndex];
    if (sorted === null) {
      sorted = [...input.samples].sort((a, b) => a - b);
      this.#sorted[layerIndex] = sorted;
    }

    return quantileOfSorted(sorted, q);
  }

  /** Each layer's quantile lines at their current (eased) X, for a test or an overlay. */
  getQuantiles(): Array<Array<{ q: number; label: string; x: number }>> {
    return this.#quantiles.map((lines) =>
      lines.map((line) => ({ q: line.q, label: line.label, x: line.spring.current })),
    );
  }

  /** The narrowest bin width: the data step, known even from a single bin. */
  getXStep(): number | null {
    return this.#minBinWidth;
  }

  /** The step and origin of the bin edges when every layer's bins share one, else `null`. */
  getXTickGrid(): XTickGrid | null {
    return this.#grid;
  }

  // --- Animation --------------------------------------------------------------

  get needsAnimation(): boolean {
    if (super.needsAnimation) return true;
    if (this.#exits.some((exits) => exits.size > 0)) return true;

    return this.#quantiles.some((lines) => lines.some((line) => line.spring.current !== line.spring.target));
  }

  #tickExtras(now: number): void {
    const entryMs = this.options.entryMs;
    for (const exits of this.#exits) {
      for (const [time, exit] of exits) {
        if (now - exit.startTime >= entryMs) exits.delete(time);
      }
    }

    for (const lines of this.#quantiles) {
      for (const line of lines) {
        line.spring.tick(now);
      }
    }
  }

  // --- Render -----------------------------------------------------------------

  render(ctx: SeriesRenderContext): void {
    const now = performance.now();
    this.tickAnimations(now);
    this.#tickExtras(now);

    const { scope, timeScale, yScale } = ctx;
    const { context, horizontalPixelRatio: hpr } = scope;

    const plotHeight = yScale.getMediaHeight() * scope.verticalPixelRatio;
    const baseline = yScale.isPlottable(0) ? 0 : yScale.getRange().min;
    const zeroY = Math.min(plotHeight, yScale.valueToBitmapY(baseline));
    const halfGap = (this.options.gap * hpr) / 2;
    const radius = this.options.cornerRadius * hpr;
    const fillOpacity = this.options.fillOpacity ?? (this.stores.length > 1 ? DEFAULT_OVERLAY_OPACITY : 1);

    const range = timeScale.getDrawRange();
    const from = range.from - this.#maxBinWidth;
    const to = range.to + this.#maxBinWidth;
    const outerAlpha = context.globalAlpha;

    for (let li = 0; li < this.stores.length; li++) {
      const layerAlpha = this.getLayerAlpha(li);
      if (layerAlpha <= 0) continue;

      // `presence` 0 → 1 grows a bar from the baseline and fades it in: the intro wave, a new bin, a dropped one backwards.
      const bars: Array<{ x0: number; x1: number; value: number; presence: number }> = [];
      for (const point of this.stores[li].getVisibleData(from, to)) {
        const settled = this.liveValue(li, point.time, point.value);
        const presence = this.entranceProgress(li, point.time) * this.introProgressAt(ctx, point.time);
        bars.push({ x0: point.x0, x1: point.x1, value: settled * presence, presence });
      }
      for (const exit of this.#exits[li].values()) {
        const presence = this.#exitRemaining(exit, now);
        bars.push({ x0: exit.x0, x1: exit.x1, value: exit.value * presence, presence });
      }

      const layerFill = outerAlpha * layerAlpha * fillOpacity;
      for (const bar of bars) {
        if (!(bar.value > 0)) continue;

        context.globalAlpha = layerFill * Math.min(1, bar.presence * 1.5);

        const left = Math.round(timeScale.timeToBitmapX(bar.x0) + halfGap);
        const right = Math.round(timeScale.timeToBitmapX(bar.x1) - halfGap);
        const top = Math.round(yScale.valueToBitmapY(bar.value));
        const height = zeroY - top;
        if (height <= 0) continue;

        context.fillStyle = this.resolveLayerColor(li, bar.value);
        fillRoundedRect(context, {
          x: left,
          y: top,
          width: Math.max(1, right - left),
          height,
          radius,
          corners: TOP_CORNERS,
        });
      }
    }

    context.globalAlpha = outerAlpha;
    this.#drawQuantiles(ctx);
  }

  #exitRemaining(exit: ExitBar, now: number): number {
    const entryMs = this.options.entryMs;
    if (entryMs <= 0) return 0;

    return Math.min(1, Math.max(0, 1 - (now - exit.startTime) / entryMs));
  }

  /** Dashed quantile lines with a chip at the top; chips that would overlap step down a row. */
  #drawQuantiles(ctx: SeriesRenderContext): void {
    const { scope, timeScale, yScale, theme } = ctx;
    const { context, horizontalPixelRatio: hpr, verticalPixelRatio: vpr } = scope;
    const plotWidth = timeScale.getMediaWidth() * hpr;
    const plotHeight = yScale.getMediaHeight() * vpr;
    const outerAlpha = context.globalAlpha;
    const reveal = this.introWave.active ? this.introWave.sweep() : 1;

    // Chips hang below the header that floats over the plot top.
    const top = ((ctx.headerHeight ?? 0) + QUANTILE_CHIP_GAP) * vpr;
    const rows: Array<Array<{ from: number; to: number }>> = [];
    for (let li = 0; li < this.#quantiles.length; li++) {
      const layerAlpha = this.getLayerAlpha(li) * reveal;
      if (layerAlpha <= 0) continue;

      context.globalAlpha = outerAlpha * layerAlpha;
      for (const line of this.#quantiles[li]) {
        const coord = line.spring.current;
        const x = timeScale.timeToBitmapX(coord);
        if (!Number.isFinite(x) || x < 0 || x > plotWidth) continue;

        const color = line.color ?? this.resolveLayerColor(li, 1);
        renderReferenceLine({
          scope,
          timeScale,
          yScale,
          theme,
          line: { orientation: 'vertical', coord, color, style: 'dashed', width: 1 },
          plotWidth,
          plotHeight,
        });

        const chip = measureChip({ context, theme, label: line.label, hpr, vpr });
        const chipX = Math.min(x + QUANTILE_CHIP_GAP * hpr, plotWidth - chip.width - QUANTILE_CHIP_GAP * hpr);
        const row = freeRow({ rows, from: chipX, to: chipX + chip.width });
        const chipY = top + row * (chip.height + QUANTILE_CHIP_GAP * vpr);
        drawChip({ context, theme, color, label: line.label, x: chipX, y: chipY, ...chip, hpr, vpr });
      }
    }

    context.globalAlpha = outerAlpha;
  }

  // --- Queries ----------------------------------------------------------------

  getValueRange(from: number, to: number, opts?: ValueRangeOptions): { min: number; max: number } | null {
    const range = super.getValueRange(from, to, opts);
    const zeroPlottable = opts?.plottable?.(0) ?? true;
    if (range === null || !zeroPlottable) return range;

    return { min: Math.min(0, range.min), max: Math.max(0, range.max) };
  }

  getDataAtTime(time: number, _interval: number, _opts?: HoverLookupOptions): HistogramBinPoint | null {
    const store = this.stores[0];
    if (store === undefined || !store.isVisible()) return null;

    const point = binAt(store.getAll(), time);

    return point === null ? null : { ...point, value: this.snapshotValue(0, point.time, point.value) };
  }

  getLayerSnapshots(time: number, _interval: number, _opts?: HoverLookupOptions): LayerSnapshot[] | null {
    if (this.stores.length <= 1) return null;

    const rows: LayerSnapshot[] = [];
    for (let li = 0; li < this.stores.length; li++) {
      if (!this.stores[li].isVisible()) continue;

      const point = binAt(this.stores[li].getAll(), time);
      if (point === null) continue;

      rows.push({
        layerIndex: li,
        time: point.time,
        value: this.snapshotValue(li, point.time, point.value),
        color: this.resolveLayerColor(li, point.value),
        x: point.time,
        bin: { x0: point.x0, x1: point.x1, count: point.count, share: point.share },
      });
    }

    return rows.length > 0 ? rows : null;
  }

  /** An unnamed single layer reads as the bin count it lists in the tooltip. */
  getLayerLabel(index: number): string | undefined {
    return this.stores.length === 1 && index === 0 ? 'Count' : undefined;
  }

  /** Rows print bin counts, not heights: whole when every count is. */
  hasOnlyWholeValues(): boolean {
    const counts = this.stores.flatMap((store) => store.getAll().map((point) => point.count));

    return counts.length > 0 && counts.every((count) => Number.isInteger(count));
  }

  /** `null`: the default row format follows the counts ({@link hasOnlyWholeValues}), not the heights. */
  getValueStats(): null {
    return null;
  }

  /** A histogram has no column stacks; the base never asks without `stacking: 'percent'`. */
  protected percentShares(_time: number): Map<number, number> | null {
    return null;
  }
}

/** One store point per bin, at its center: `value` is the height `normalize` asks for. */
function toPoints(args: { bins: readonly HistogramBin[]; normalize: HistogramNormalize }): HistogramBinPoint[] {
  const { bins, normalize: mode } = args;
  let total = 0;
  for (const bin of bins) {
    total += Math.max(0, bin.count);
  }

  return bins.map((bin) => {
    const count = Math.max(0, bin.count);
    const share = total > 0 ? (count / total) * 100 : 0;
    const width = bin.x1 - bin.x0;
    const center = cleanEdge((bin.x0 + bin.x1) / 2);

    let value = count;
    if (mode === 'percent') value = share;
    if (mode === 'density') value = total > 0 && width > 0 ? count / (total * width) : 0;

    return { time: center, x: center, value, x0: bin.x0, x1: bin.x1, count, share };
  });
}

/** The point whose bin holds `x`; the last bin also holds its right edge. */
function binAt(points: readonly HistogramBinPoint[], x: number): HistogramBinPoint | null {
  let low = 0;
  let high = points.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const point = points[mid];
    if (x < point.x0) {
      high = mid - 1;
      continue;
    }

    const isLast = mid === points.length - 1;
    const inside = x < point.x1 || (isLast && x === point.x1);
    if (inside) return point;

    low = mid + 1;
  }

  return null;
}

/** The narrowest bin width across layers, or `null` without a bin. */
function narrowestBin(layers: readonly (readonly HistogramBin[])[]): number | null {
  let narrowest: number | null = null;
  for (const bins of layers) {
    for (const bin of bins) {
      const width = bin.x1 - bin.x0;
      if (narrowest === null || width < narrowest) narrowest = width;
    }
  }

  return narrowest;
}

function validBin(bin: HistogramBin): boolean {
  return Number.isFinite(bin.x0) && Number.isFinite(bin.x1) && bin.x1 > bin.x0 && Number.isFinite(bin.count);
}

function sortBins(bins: HistogramBin[]): HistogramBin[] {
  for (let i = 1; i < bins.length; i++) {
    if (bins[i].x0 < bins[i - 1].x0) return [...bins].sort((a, b) => a.x0 - b.x0);
  }

  return bins;
}

/** The common width of contiguous bins, or `null` when the widths differ or a gap breaks them. */
function uniformStep(bins: readonly HistogramBin[]): number | null {
  const first = bins[0];
  if (first === undefined) return null;

  const step = first.x1 - first.x0;
  const tolerance = step * 1e-6;
  for (let i = 1; i < bins.length; i++) {
    const width = bins[i].x1 - bins[i].x0;
    const contiguous = Math.abs(bins[i].x0 - bins[i - 1].x1) <= tolerance;
    if (Math.abs(width - step) > tolerance || !contiguous) return null;
  }

  return step;
}

/**
 * The grid of edges `edge + k × step`, with its origin at the edge nearest above
 * zero, so ticks count from round numbers (0, 200, 400) rather than the first bin.
 */
function tickGrid(args: { step: number; edge: number }): XTickGrid {
  const { step, edge } = args;

  return { step, origin: cleanEdge(edge - Math.floor(edge / step) * step) };
}

/** Whether the edges of `other` coincide with `grid`'s. */
function onGrid(args: { grid: XTickGrid; other: XTickGrid }): boolean {
  const { grid, other } = args;
  const tolerance = grid.step * 1e-6;
  const offset = (other.origin - grid.origin) / grid.step;
  const sameStep = Math.abs(other.step - grid.step) <= tolerance;

  return sameStep && Math.abs(offset - Math.round(offset)) * grid.step <= tolerance;
}

/** The first chip row where `[from, to]` overlaps no chip placed before; claims it. */
function freeRow(args: { rows: Array<Array<{ from: number; to: number }>>; from: number; to: number }): number {
  const { rows, from, to } = args;
  for (let row = 0; ; row++) {
    const taken = rows[row] ?? [];
    const overlaps = taken.some((span) => from < span.to && to > span.from);
    if (overlaps) continue;

    taken.push({ from, to });
    rows[row] = taken;

    return row;
  }
}

/** `count` palette colors from slot `start`, wrapping around the theme's list. */
function paletteColors(args: { theme: ChartTheme; count: number; start: number }): string[] {
  const palette = args.theme.seriesColors.length > 0 ? args.theme.seriesColors : ['#5b8def'];

  return Array.from({ length: args.count }, (_, i) => palette[(args.start + i) % palette.length]);
}

/** Series definition for `chart.addSeries` — a histogram plots on a numeric X axis only. */
export const HistogramSeriesDef: SeriesDefinition<HistogramSeriesOptions> = {
  type: 'histogram',
  xTypes: ['numeric'],
  create: ({ theme, layerCount, paletteIndex }, options) => {
    const start = paletteIndex ?? 0;
    const colors = paletteColors({ theme, count: layerCount, start });

    return new HistogramRenderer(layerCount, { colors, ...options }, start);
  },
};

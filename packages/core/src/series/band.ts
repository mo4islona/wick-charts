import { Animator } from '../animation/animator';
import {
  DEFAULT_BAND_ENTRY,
  DEFAULT_BAND_INTRO,
  DEFAULT_BAND_SMOOTH,
  DEFAULT_HISTORY_REVEAL,
} from '../animation/config';
import { easeOutCubic } from '../animation/easing';
import { IntroWave } from '../animation/intro-wave';
import { ScalarSpring } from '../animation/scalar-spring';
import { decimateBandData } from '../data/decimation';
import { TimeSeriesStore } from '../data/store';
import type { ChartTheme } from '../theme/types';
import type { BandEntryAnimation, BandPoint, BandPointInput, BandSeriesOptions, TimePoint, ValueColor } from '../types';
import { hexToRgba, resolveColor } from '../utils/color';
import { lerp } from '../utils/math';
import { normalizeTime } from '../utils/time';
import type { SeriesDefinition } from './definition';
import {
  type LineIntroDirectives,
  type LineIntroFn,
  type LineIntroFrame,
  backfillSweepIntro,
  scaleMean,
  unfoldIntro,
} from './line-intro';
import {
  type CurveKind,
  type PathSegment,
  buildCurveSegments,
  replaySegmentsForward,
  replaySegmentsReversed,
} from './painters/canvas-path';
import type { LinePoint } from './painters/types';
import type {
  LayerSnapshot,
  OverlayRenderContext,
  SeriesRenderContext,
  TimeSeriesRenderer,
  ValueRangeOptions,
} from './types';

interface ResolvedBandOptions {
  /** One resolver per layer, from the theme; `data` color overrides are held apart. */
  colors: ValueColor[];
  fill: string | [string, string] | undefined;
  stroke: { visible: boolean; width: number; color: string | undefined };
  curve: CurveKind;
  entryAnimation: BandEntryAnimation;
  entryMs: number;
  smoothMs: number;
  introMs: number;
  historyRevealMs: number;
  introAnimation: LineIntroFn | undefined;
  historyReveal: LineIntroFn | 'none' | undefined;
}

/** Caller-facing option input — the public surface plus the internal `colors`. */
type BandOptionsInput = Partial<BandSeriesOptions> & { colors?: ValueColor[] };

const DEFAULT_OPTIONS: ResolvedBandOptions = {
  colors: ['#2962FF'],
  fill: undefined,
  stroke: { visible: true, width: 1, color: undefined },
  curve: 'straight',
  entryAnimation: 'grow',
  entryMs: DEFAULT_BAND_ENTRY,
  smoothMs: DEFAULT_BAND_SMOOTH,
  introMs: DEFAULT_BAND_INTRO,
  historyRevealMs: DEFAULT_HISTORY_REVEAL,
  introAnimation: undefined,
  historyReveal: undefined,
};

const DEFAULT_FILL_TOP_ALPHA = 0.4;
const DEFAULT_FILL_BOTTOM_ALPHA = 0.04;
const DEFAULT_STROKE_ALPHA = 0.6;

const DEFAULT_HISTORY_REVEAL_FN = backfillSweepIntro();

function toMs(value: number | false | undefined, fallback: number): number {
  if (value === false) return 0;

  return value ?? fallback;
}

/** Merge `input` over `prev`. Keys absent from `input` keep their previous value. */
function mergeOptions(prev: ResolvedBandOptions, input: BandOptionsInput): ResolvedBandOptions {
  const stroke = input.stroke;

  return {
    colors: input.colors ?? prev.colors,
    fill: 'fill' in input ? input.fill : prev.fill,
    stroke: {
      visible: stroke?.visible ?? prev.stroke.visible,
      width: stroke?.width ?? prev.stroke.width,
      color: stroke !== undefined && 'color' in stroke ? stroke.color : prev.stroke.color,
    },
    curve: input.curve ?? prev.curve,
    entryAnimation: input.entryAnimation ?? prev.entryAnimation,
    entryMs: toMs(input.entryMs, prev.entryMs),
    smoothMs: toMs(input.smoothMs, prev.smoothMs),
    introMs: toMs(input.introMs, prev.introMs),
    historyRevealMs: toMs(input.historyRevealMs, prev.historyRevealMs),
    introAnimation: 'introAnimation' in input ? input.introAnimation : prev.introAnimation,
    historyReveal: 'historyReveal' in input ? input.historyReveal : prev.historyReveal,
  };
}

interface Edges {
  low: number;
  high: number;
}

interface EdgeChase {
  low: ScalarSpring;
  high: ScalarSpring;
}

/** One drawn sample in bitmap space. `top` is the upper edge (smaller Y). */
interface BandVertex {
  x: number;
  top: number;
  bottom: number;
}

/** A vertex run plus its two edge curves, built once and shared by fill and stroke. */
interface RunPath {
  upper: LinePoint[];
  lower: LinePoint[];
  upperSegs: PathSegment[];
  lowerSegs: PathSegment[];
}

type GeometryContext = Pick<SeriesRenderContext, 'scope' | 'timeScale' | 'yScale'>;

const scalarLerp = (a: number, b: number, t: number): number => a + (b - a) * t;

function clamp01(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;

  return value;
}

/**
 * Normalize one input sample: `Date` time to ms, edges ordered so `low ≤ high`.
 * A missing or non-finite edge makes the whole sample a gap (both edges `NaN`)
 * — `Math.min(null, 5)` is `0`, so finiteness is checked before ordering.
 */
function toBandPoint(input: BandPointInput): BandPoint {
  const time = normalizeTime(input.time);
  const { low, high } = input;
  if (!Number.isFinite(low) || !Number.isFinite(high)) return { ...input, time, low: Number.NaN, high: Number.NaN };

  return { ...input, time, low: Math.min(low, high), high: Math.max(low, high) };
}

function isGap(point: BandPoint): boolean {
  return !Number.isFinite(point.low);
}

function edgesOf(point: BandPoint): Edges {
  return { low: point.low, high: point.high };
}

/**
 * Smooth edges are fitted one by one, so crossed control points draw the edges across each other.
 * A crossed pair meets at its midpoint: the shared-x segment stays ordered and inside each edge's span.
 */
function orderEdgeSegments(path: RunPath): void {
  const { upperSegs, lowerSegs } = path;

  for (let i = 0; i < upperSegs.length; i++) {
    const top = upperSegs[i];
    const bottom = lowerSegs[i];
    if (top.kind !== 'bezier' || bottom.kind !== 'bezier') continue;

    const cp1 = orderedPair(top.cp1y, bottom.cp1y);
    const cp2 = orderedPair(top.cp2y, bottom.cp2y);
    upperSegs[i] = { ...top, cp1y: cp1.top, cp2y: cp2.top };
    lowerSegs[i] = { ...bottom, cp1y: cp1.bottom, cp2y: cp2.bottom };
  }
}

/** Bitmap Y grows downward, so an ordered pair has `top ≤ bottom`. */
function orderedPair(top: number, bottom: number): { top: number; bottom: number } {
  if (top <= bottom) return { top, bottom };

  const meet = (top + bottom) / 2;

  return { top: meet, bottom: meet };
}

/** Per-layer state: one store, its entrance registry, live-edge chase and visibility fade. */
class BandLayer {
  readonly store = new TimeSeriesStore<BandPoint>();
  /** Entrance start wall-time per appended point, keyed by point time. */
  readonly entries = new Map<number, number>();
  readonly alpha = new Animator<number>({ initial: 1, duration: 0, lerp: scalarLerp });
  /** Displayed edges of the last point; the chase moves them toward the stored ones. */
  displayedLast: Edges | null = null;
  chase: EdgeChase | null = null;
  /**
   * A chase displaced from the last slot by an append, still settling on that
   * (now penultimate) point. Dropping it would snap that vertex the frame the
   * new point lands.
   */
  pinned: { time: number; chase: EdgeChase } | null = null;
}

/**
 * Band (range) series: fills the region between a `low` and a `high` edge over
 * time — percentile bands, min/max envelopes, Bollinger bands, forecast
 * intervals. Each layer is one band; layers draw in order with translucent
 * fills. Gaps split a band into separate polygons, the same way line gaps split
 * runs.
 */
export class BandRenderer implements TimeSeriesRenderer {
  readonly kind = 'band' as const;

  #options: ResolvedBandOptions;
  readonly #layers: BandLayer[];
  /** Per-layer colors carried in `data` (sparse); kept apart so a theme swap leaves them alone. */
  #colorOverrides: (ValueColor | undefined)[] = [];

  /** Initial-load reveal, armed once on the empty → non-empty seed and shared by every layer. */
  readonly #introWave = new IntroWave();
  /** History-prepend reveal, armed by {@link prependPoints}. */
  readonly #historyWave = new IntroWave();
  /** Prepended span: `from` = deepest new point, `to` = the pre-prepend first point. */
  #historyRange: { from: number; to: number } | null = null;

  #introDirectives: LineIntroDirectives | null = null;
  #historyDirectives: LineIntroDirectives | null = null;
  #defaultIntro: LineIntroFn | null = null;
  /** True while a ghost pre-pass draws — edges only, no fill. */
  #ghostPass = false;

  constructor(layerCount: number, options?: BandOptionsInput) {
    this.#layers = Array.from({ length: Math.max(1, layerCount) }, () => new BandLayer());
    this.#options = mergeOptions(DEFAULT_OPTIONS, options ?? {});
  }

  updateOptions(options: BandOptionsInput): void {
    this.#options = mergeOptions(this.#options, options);
  }

  applyTheme(theme: ChartTheme): void {
    this.updateOptions({ colors: themeColors(theme, this.#layers.length) });
  }

  // --- Data ingest ----------------------------------------------------------

  setData(data: unknown, layerIndex = 0): void {
    const layer = this.#layers[layerIndex];
    if (!layer) return;

    const hadData = this.#layers.some((l) => l.store.length > 0);
    const points = ((data ?? []) as BandPointInput[]).map(toBandPoint);
    layer.store.setData(points);

    // First seed only — a bulk re-seed of a live series must never replay the intro.
    if (!hadData && points.length > 0) {
      this.#introWave.arm(this.#options.introMs);
    }

    const last = layer.store.last();
    layer.displayedLast = last ? edgesOf(last) : null;
    layer.chase = null;
    layer.pinned = null;
    layer.entries.clear();

    // The reveal's range refers to the previous dataset's boundary.
    this.#historyWave.finish();
    this.#historyRange = null;
  }

  appendPoint(point: unknown, layerIndex = 0): void {
    const layer = this.#layers[layerIndex];
    if (!layer) return;

    const next = toBandPoint(point as BandPointInput);
    const prevLast = layer.store.last();
    const lengthBefore = layer.store.length;
    layer.store.append(next);

    // A same-time append degrades to an overwrite, so only a grown store has a
    // distinct penultimate point to hand the in-flight chase to.
    const grew = layer.store.length > lengthBefore;
    if (layer.chase !== null && prevLast !== undefined && grew) {
      layer.pinned = { time: prevLast.time, chase: layer.chase };
    }

    layer.displayedLast = edgesOf(next);
    layer.chase = null;

    const entryEnabled = this.#options.entryAnimation !== 'none' && this.#options.entryMs > 0;
    if (entryEnabled) {
      layer.entries.set(next.time, performance.now());
    }
  }

  prependPoints(points: unknown[], layerIndex = 0): void {
    const layer = this.#layers[layerIndex];
    if (!layer || points.length === 0) return;

    // The visible suffix didn't change, so none of `setData`'s snap machinery runs.
    const normalized = (points as BandPointInput[]).map(toBandPoint);
    const boundary = layer.store.first()?.time;
    layer.store.prepend(normalized);

    this.#armHistoryReveal(normalized[0]?.time, boundary);
  }

  /** While a reveal is in flight only the range grows — a restart would hide half-revealed points again. */
  #armHistoryReveal(deepestTime: number | undefined, boundary: number | undefined): void {
    const revealMs = this.#options.historyRevealMs;
    if (this.#options.historyReveal === 'none' || revealMs <= 0) return;
    if (deepestTime === undefined || boundary === undefined) return;

    if (this.#historyWave.active && this.#historyRange !== null) {
      this.#historyRange = { from: Math.min(this.#historyRange.from, deepestTime), to: this.#historyRange.to };

      return;
    }

    this.#historyRange = { from: deepestTime, to: boundary };
    this.#historyWave.arm(revealMs);
  }

  updateLastPoint(point: unknown, layerIndex = 0): void {
    const layer = this.#layers[layerIndex];
    if (!layer) return;

    const next = toBandPoint(point as BandPointInput);
    layer.store.updateLast(next);

    const smoothMs = this.#options.smoothMs;
    if (smoothMs <= 0 || isGap(next)) {
      layer.displayedLast = edgesOf(next);
      layer.chase = null;

      return;
    }

    if (layer.chase === null) {
      const shown = layer.displayedLast;
      const start = shown !== null && Number.isFinite(shown.low) ? shown : edgesOf(next);
      layer.chase = { low: new ScalarSpring(start.low), high: new ScalarSpring(start.high) };
    }

    layer.chase.low.retarget(next.low, { settleMs: smoothMs });
    layer.chase.high.retarget(next.high, { settleMs: smoothMs });
  }

  keepLast(count: number, layerIndex = 0): void {
    const layer = this.#layers[layerIndex];
    if (!layer || count < 0) return;

    const drop = layer.store.length - count;
    if (drop <= 0) return;

    layer.store.trimStart(drop);
  }

  // --- Layer model ----------------------------------------------------------

  getLayerCount(): number {
    return this.#layers.length;
  }

  setLayerVisible(index: number, visible: boolean): void {
    this.#layers[index]?.store.setVisible(visible);
  }

  isLayerVisible(index: number): boolean {
    return this.#layers[index]?.store.isVisible() ?? true;
  }

  setColorOverrides(overrides: (ValueColor | undefined)[]): void {
    this.#colorOverrides = overrides;
  }

  /** Representative color per layer — a value-fn resolves at the layer's last midpoint. */
  getLayerColors(): string[] {
    return this.#layers.map((_, index) => this.#layerColor(index));
  }

  #layerColor(layerIndex: number): string {
    const override = this.#colorOverrides[layerIndex];
    const base = this.#options.colors;
    const resolver = override ?? base[layerIndex % base.length];

    const last = this.#layers[layerIndex]?.store.last();
    const mid = last !== undefined && !isGap(last) ? (last.low + last.high) / 2 : 0;

    return resolveColor(resolver, mid);
  }

  // --- Animation ------------------------------------------------------------

  /** Advance owned animators. Called by both passes; every clock samples `now`, so a second tick is a no-op. */
  #tick(now: number): void {
    this.#introWave.tick(now);
    this.#historyWave.tick(now);

    for (const layer of this.#layers) {
      layer.alpha.tick(now);
      this.#tickChases(layer, now);
      this.#pruneEntries(layer, now);
    }
  }

  #tickChases(layer: BandLayer, now: number): void {
    const chase = layer.chase;
    if (chase !== null) {
      const lowMoving = chase.low.tick(now);
      const highMoving = chase.high.tick(now);
      layer.displayedLast = { low: chase.low.current, high: chase.high.current };
      if (!lowMoving && !highMoving) layer.chase = null;
    }

    const pinned = layer.pinned;
    if (pinned !== null) {
      const lowMoving = pinned.chase.low.tick(now);
      const highMoving = pinned.chase.high.tick(now);
      if (!lowMoving && !highMoving) layer.pinned = null;
    }
  }

  #pruneEntries(layer: BandLayer, now: number): void {
    const entryMs = this.#options.entryMs;
    if (entryMs <= 0) {
      layer.entries.clear();

      return;
    }

    for (const [time, start] of layer.entries) {
      if (now - start >= entryMs) layer.entries.delete(time);
    }
  }

  #entranceProgress(layer: BandLayer, time: number): number {
    const start = layer.entries.get(time);
    const entryMs = this.#options.entryMs;
    if (start === undefined || entryMs <= 0) return 1;

    return clamp01((performance.now() - start) / entryMs);
  }

  /** Trailing points whose entrance is unsettled, oldest first; stops at the first settled one. */
  #unsettledTail(layer: BandLayer): Array<{ time: number; progress: number }> {
    const all = layer.store.getAll();
    const tail: Array<{ time: number; progress: number }> = [];
    for (let i = all.length - 1; i >= 1; i--) {
      const progress = this.#entranceProgress(layer, all[i].time);
      if (progress >= 1) break;

      tail.unshift({ time: all[i].time, progress });
    }

    return tail;
  }

  get needsAnimation(): boolean {
    if (this.#introWave.active || this.#historyWave.active) return true;

    for (const layer of this.#layers) {
      const busy = layer.alpha.animating || layer.chase !== null || layer.pinned !== null || layer.entries.size > 0;
      if (busy) return true;
    }

    return false;
  }

  getIntroFront(): number {
    return this.#introWave.sweep();
  }

  cancelEntranceAnimations(): void {
    this.#introWave.finish();

    for (const layer of this.#layers) {
      layer.entries.clear();
    }
  }

  setAlpha(target: number, durationMs: number): void {
    for (const layer of this.#layers) {
      layer.alpha.setTarget(target, { duration: durationMs });
    }
  }

  /** `1` while any layer is visible or still fading — a binary gate; per-layer alpha is applied at draw time. */
  getAlpha(): number {
    const shown = this.#layers.some((layer) => layer.alpha.current > 0 || layer.alpha.animating);

    return shown ? 1 : 0;
  }

  setLayerAlpha(index: number, target: number, durationMs: number): void {
    this.#layers[index]?.alpha.setTarget(target, { duration: durationMs });
  }

  getLayerAlpha(index: number): number {
    return this.#layers[index]?.alpha.current ?? 1;
  }

  // --- Geometry -------------------------------------------------------------

  /** Stored edges with the live chase applied: the last point, or the pinned chase on the point an append displaced. */
  #liveEdges(layer: BandLayer, point: BandPoint): Edges {
    const last = layer.store.last();
    if (last !== undefined && point.time === last.time) return layer.displayedLast ?? edgesOf(point);

    const pinned = layer.pinned;
    if (pinned !== null && pinned.time === point.time) {
      return { low: pinned.chase.low.current, high: pinned.chase.high.current };
    }

    return edgesOf(point);
  }

  /** The active intro / history value transform for one sample, or `null` when none applies. */
  #valueTransform(ctx: GeometryContext, layerIndex: number, time: number): ((value: number) => number) | null {
    const history = this.#historyWave.active ? this.#historyDirectives?.value : undefined;
    const historyRange = this.#historyRange;
    if (history !== undefined && historyRange !== null && time < historyRange.to) {
      const span = historyRange.to - historyRange.from;
      const position = span > 0 ? clamp01((historyRange.to - time) / span) : 0;

      return (value) => history({ layerIndex, time, value, position });
    }

    const intro = this.#introWave.active ? this.#introDirectives?.value : undefined;
    if (intro === undefined) return null;

    const range = ctx.timeScale.getRange();
    const span = range.to - range.from;
    const position = span > 0 ? clamp01((time - range.from) / span) : 0;

    return (value) => intro({ layerIndex, time, value, position });
  }

  /**
   * Where a sample draws this frame, or `null` for a gap (non-finite, or an
   * edge the Y scale can't place, stored or as drawn). Edges swap when an
   * animation crosses them, so the polygon never twists.
   */
  #vertex(ctx: GeometryContext, layerIndex: number, point: BandPoint): BandVertex | null {
    const { timeScale, yScale } = ctx;
    if (isGap(point) || !yScale.isPlottable(point.low) || !yScale.isPlottable(point.high)) return null;

    const layer = this.#layers[layerIndex];
    const live = this.#liveEdges(layer, point);
    const transform = this.#valueTransform(ctx, layerIndex, point.time);
    const low = transform === null ? live.low : transform(live.low);
    const high = transform === null ? live.high : transform(live.high);
    // The chase and the intro move an edge off its stored value, possibly out of the scale's domain.
    if (!yScale.isPlottable(low) || !yScale.isPlottable(high)) return null;

    const yLow = yScale.valueToBitmapYExact(low);
    const yHigh = yScale.valueToBitmapYExact(high);

    return { x: timeScale.timeToBitmapXExact(point.time), top: Math.min(yLow, yHigh), bottom: Math.max(yLow, yHigh) };
  }

  /**
   * Rendered vertices of the layer's still-entering tail, keyed by time. Each
   * link grows from the previous link's rendered spot, so a feed faster than
   * `entryMs` keeps every head unfurling instead of snapping older ones.
   */
  #growTail(ctx: GeometryContext, layerIndex: number): Map<number, BandVertex> | null {
    if (this.#options.entryAnimation !== 'grow') return null;

    const layer = this.#layers[layerIndex];
    const chain = this.#unsettledTail(layer);
    if (chain.length === 0) return null;

    const all = layer.store.getAll();
    const anchorIdx = all.length - 1 - chain.length;
    if (anchorIdx < 0) return null;

    const anchor = this.#vertex(ctx, layerIndex, all[anchorIdx]);
    if (anchor === null) return null;

    const grown = new Map<number, BandVertex>();
    let prev = anchor;
    for (let k = 0; k < chain.length; k++) {
      const point = all[anchorIdx + 1 + k];
      const target = this.#vertex(ctx, layerIndex, point);
      if (target === null) return null;

      const t = easeOutCubic(chain[k].progress);
      const vertex = {
        x: lerp(prev.x, target.x, t),
        top: lerp(prev.top, target.top, t),
        bottom: lerp(prev.bottom, target.bottom, t),
      };
      grown.set(point.time, vertex);
      prev = vertex;
    }

    return grown;
  }

  // --- Rendering ------------------------------------------------------------

  render(ctx: SeriesRenderContext): void {
    this.#tick(performance.now());

    const { context } = ctx.scope;

    this.#historyDirectives = null;
    const historyRange = this.#historyRange;
    if (this.#historyWave.active && historyRange !== null) {
      const reveal = this.#options.historyReveal ?? DEFAULT_HISTORY_REVEAL_FN;
      if (reveal !== 'none') {
        this.#historyDirectives = reveal(this.#buildHistoryFrame(ctx, historyRange));
      }
    }
    const history = this.#historyDirectives;

    this.#renderGhost(ctx, history?.ghostAlpha ?? 0);
    const historyClipped = this.#applyHistoryClip(ctx, history, historyRange);

    if (this.#introWave.active) {
      this.#renderWithIntro(ctx);
    } else {
      this.#introDirectives = null;
      this.#renderLayers(ctx);
    }

    if (historyClipped) context.restore();
  }

  #renderWithIntro(ctx: SeriesRenderContext): void {
    const intro = this.#options.introAnimation ?? this.#resolveDefaultIntro();
    const directives = intro(this.#buildIntroFrame(ctx));
    this.#introDirectives = directives;

    this.#renderGhost(ctx, directives.ghostAlpha ?? 0);

    const { context } = ctx.scope;
    const { width, height } = ctx.scope.bitmapSize;
    const clip = directives.clip;
    const hasClip = clip !== undefined && (clip.fromX !== undefined || clip.toX !== undefined);
    if (hasClip) {
      const fromX = clip.fromX ?? 0;
      const toX = clip.toX ?? width;
      context.save();
      context.beginPath();
      context.rect(fromX, 0, Math.max(0, toX - fromX), height);
      context.clip();
    }

    this.#renderLayers(ctx);

    if (hasClip) context.restore();
  }

  #resolveDefaultIntro(): LineIntroFn {
    if (this.#defaultIntro === null) this.#defaultIntro = unfoldIntro();

    return this.#defaultIntro;
  }

  /** Edges-only skeleton under the main pass, so a clip reveal never reads as an empty chart. */
  #renderGhost(ctx: SeriesRenderContext, alpha: number): void {
    if (alpha <= 0) return;

    const { context } = ctx.scope;
    context.save();
    context.globalAlpha *= alpha;
    this.#ghostPass = true;
    this.#renderLayers(ctx);
    this.#ghostPass = false;
    context.restore();
  }

  /** History clip, mapped from reveal space (`x = 0` at the data boundary) to bitmap space. */
  #applyHistoryClip(
    ctx: SeriesRenderContext,
    directives: LineIntroDirectives | null,
    range: { from: number; to: number } | null,
  ): boolean {
    const clip = directives?.clip;
    if (clip === undefined || range === null) return false;
    if (clip.fromX === undefined && clip.toX === undefined) return false;

    const { context } = ctx.scope;
    const { width, height } = ctx.scope.bitmapSize;
    const boundaryX = ctx.timeScale.timeToBitmapXExact(range.to);
    const spanWidth = Math.abs(boundaryX - ctx.timeScale.timeToBitmapXExact(range.from));
    const pad = Math.max(2, this.#options.stroke.width * ctx.scope.horizontalPixelRatio);
    const fromLocal = clip.fromX ?? 0;
    const toLocal = clip.toX ?? spanWidth;

    context.save();
    context.beginPath();
    context.rect(boundaryX - toLocal - pad, 0, Math.max(0, toLocal - fromLocal + pad), height);
    context.rect(boundaryX, 0, Math.max(0, width - boundaryX), height);
    context.clip();

    return true;
  }

  #renderLayers(ctx: SeriesRenderContext): void {
    for (let li = 0; li < this.#layers.length; li++) {
      this.#renderLayer(ctx, li);
    }
  }

  #renderLayer(ctx: SeriesRenderContext, layerIndex: number): void {
    const layer = this.#layers[layerIndex];
    const layerAlpha = layer.alpha.current;
    if (layerAlpha <= 0) return;

    const { scope, timeScale } = ctx;
    const range = timeScale.getRange();
    let data = layer.store.getVisibleData(range.from, range.to);
    if (data.length > scope.mediaSize.width * 2) {
      data = decimateBandData(data, Math.round(scope.mediaSize.width * 1.5));
    }
    if (data.length === 0) return;

    const sliceLast = data[data.length - 1];
    const lastIsLive = this.#sliceEndsLive(layer, data);
    const grown = lastIsLive ? this.#growTail(ctx, layerIndex) : null;

    const runs = this.#collectRuns(ctx, { layerIndex, data, grown });
    if (runs.length === 0) return;

    const progress = lastIsLive ? this.#entranceProgress(layer, sliceLast.time) : 1;
    const fading = lastIsLive && !isGap(sliceLast) && this.#options.entryAnimation === 'fade' && progress < 1;
    const seamX = fading ? fadeSeam(runs) : null;

    const { context } = scope;
    context.save();
    if (layerAlpha < 1) context.globalAlpha *= layerAlpha;

    const color = this.#layerColor(layerIndex);
    const paint = { ctx, runs, color, growing: grown !== null };
    if (seamX === null) {
      this.#paintRuns(paint);
    } else {
      // Only the new trailing segment fades in; the body stays solid.
      const { width, height } = scope.bitmapSize;
      context.save();
      context.beginPath();
      context.rect(0, 0, seamX, height);
      context.clip();
      this.#paintRuns(paint);
      context.restore();

      context.save();
      context.beginPath();
      context.rect(seamX, 0, Math.max(0, width - seamX), height);
      context.clip();
      context.globalAlpha *= progress;
      this.#paintRuns(paint);
      context.restore();
    }

    context.restore();
  }

  /** Split the visible slice into runs of drawable vertices; a gap ends a run. */
  /**
   * Whether a visible slice ends at the live point. Panned into history, the
   * slice's last point is an interior sample, and the live-tail entrance must not apply.
   */
  #sliceEndsLive(layer: BandLayer, data: readonly BandPoint[]): boolean {
    const storeLast = layer.store.last();
    const sliceLast = data[data.length - 1];

    return storeLast !== undefined && sliceLast !== undefined && sliceLast.time === storeLast.time;
  }

  #collectRuns(
    ctx: SeriesRenderContext,
    args: { layerIndex: number; data: readonly BandPoint[]; grown: Map<number, BandVertex> | null },
  ): BandVertex[][] {
    const { layerIndex, data, grown } = args;
    const runs: BandVertex[][] = [];
    let current: BandVertex[] | null = null;

    for (const point of data) {
      const vertex = grown?.get(point.time) ?? this.#vertex(ctx, layerIndex, point);
      if (vertex === null) {
        current = null;
        continue;
      }

      if (current === null) {
        current = [];
        runs.push(current);
      }
      current.push(vertex);
    }

    return runs;
  }

  #paintRuns(args: { ctx: SeriesRenderContext; runs: BandVertex[][]; color: string; growing: boolean }): void {
    const { ctx, runs, color, growing } = args;
    const { context, verticalPixelRatio } = ctx.scope;
    const curve = this.#options.curve;

    // The live tail is always the last run. While it grows, its trailing
    // segment stays straight so a smooth curve can't wobble at the moving head.
    const paths: RunPath[] = [];
    const orphans: BandVertex[] = [];
    for (let r = 0; r < runs.length; r++) {
      const run = runs[r];
      if (run.length < 2) {
        orphans.push(run[0]);
        continue;
      }

      const settledOnly = growing && r === runs.length - 1;
      const upper = run.map((v) => ({ x: v.x, y: v.top }));
      const lower = run.map((v) => ({ x: v.x, y: v.bottom }));
      const path: RunPath = {
        upper,
        lower,
        upperSegs: buildCurveSegments(upper, curve, settledOnly),
        lowerSegs: buildCurveSegments(lower, curve, settledOnly),
      };
      orderEdgeSegments(path);
      paths.push(path);
    }

    if (!this.#ghostPass && paths.length > 0) {
      context.fillStyle = this.#fillStyle({ context, paths, color });
      for (const path of paths) {
        context.beginPath();
        context.moveTo(path.upper[0].x, path.upper[0].y);
        replaySegmentsForward(context, path.upperSegs);
        const lowerLast = path.lower[path.lower.length - 1];
        context.lineTo(lowerLast.x, lowerLast.y);
        replaySegmentsReversed(context, path.lower, path.lowerSegs);
        context.closePath();
        context.fill();
      }
    }

    const stroke = this.#options.stroke;
    const strokeColor = stroke.color ?? hexToRgba(color, DEFAULT_STROKE_ALPHA);
    const lineWidth = Math.max(1, Math.round(stroke.width * verticalPixelRatio));
    const hasStroke = stroke.visible && stroke.width > 0;

    if (hasStroke && paths.length > 0) {
      context.beginPath();
      for (const path of paths) {
        context.moveTo(path.upper[0].x, path.upper[0].y);
        replaySegmentsForward(context, path.upperSegs);
        context.moveTo(path.lower[0].x, path.lower[0].y);
        replaySegmentsForward(context, path.lowerSegs);
      }
      context.strokeStyle = strokeColor;
      context.lineWidth = lineWidth;
      context.lineJoin = 'round';
      context.lineCap = 'round';
      context.stroke();
    }

    // A lone sample between two gaps has no area — draw its range as a tick so it doesn't vanish.
    if (orphans.length > 0) {
      context.beginPath();
      for (const vertex of orphans) {
        context.moveTo(vertex.x, vertex.top);
        context.lineTo(vertex.x, vertex.bottom);
      }
      context.strokeStyle = hasStroke ? strokeColor : hexToRgba(color, DEFAULT_STROKE_ALPHA);
      context.lineWidth = lineWidth;
      context.lineCap = 'round';
      context.stroke();
    }
  }

  /** A gradient fill spans the layer's drawn extent this frame; a degenerate extent paints solid. */
  #fillStyle(args: { context: CanvasRenderingContext2D; paths: RunPath[]; color: string }): string | CanvasGradient {
    const { context, paths, color } = args;
    const fill = this.#options.fill;
    if (typeof fill === 'string') return fill;

    const [topColor, bottomColor] = fill ?? [
      hexToRgba(color, DEFAULT_FILL_TOP_ALPHA),
      hexToRgba(color, DEFAULT_FILL_BOTTOM_ALPHA),
    ];

    let top = Infinity;
    let bottom = -Infinity;
    for (const path of paths) {
      for (const point of path.upper) {
        if (point.y < top) top = point.y;
      }
      for (const point of path.lower) {
        if (point.y > bottom) bottom = point.y;
      }
    }

    if (!(bottom > top + 0.5)) return topColor;

    const gradient = context.createLinearGradient(0, top, 0, bottom);
    gradient.addColorStop(0, topColor);
    gradient.addColorStop(1, bottomColor);

    return gradient;
  }

  // --- Intro frames ---------------------------------------------------------

  #buildIntroFrame(ctx: SeriesRenderContext): LineIntroFrame {
    return this.#buildFrame(ctx, {
      progress: this.#introWave.linear(),
      range: ctx.timeScale.getRange(),
      // Plot-area extent — the canvas bitmap also carries the axis strips.
      width: ctx.timeScale.getMediaWidth() * ctx.scope.horizontalPixelRatio,
    });
  }

  #buildHistoryFrame(ctx: SeriesRenderContext, range: { from: number; to: number }): LineIntroFrame {
    const { timeScale } = ctx;

    return this.#buildFrame(ctx, {
      progress: this.#historyWave.linear(),
      range,
      width: Math.abs(timeScale.timeToBitmapXExact(range.to) - timeScale.timeToBitmapXExact(range.from)),
    });
  }

  /**
   * The line intro contract, fed each band's center: `layerData` maps every
   * sample to the midpoint of its edges on the Y axis (geometric on log), so
   * `layerMean` is the center the default unfold opens the band out of.
   */
  #buildFrame(
    ctx: SeriesRenderContext,
    opts: { progress: number; range: { from: number; to: number }; width: number },
  ): LineIntroFrame {
    const { timeScale, yScale, scope } = ctx;
    const { progress, range, width } = opts;
    const layerCount = this.#layers.length;

    const centerCache: Array<readonly TimePoint[] | undefined> = new Array(layerCount);
    const meanCache: Array<number | null | undefined> = new Array(layerCount);
    let pathCache: Array<{ x: number; y: number; time: number }> | null | undefined;

    const layerData = (layerIndex: number): readonly TimePoint[] => {
      const cached = centerCache[layerIndex];
      if (cached !== undefined) return cached;

      const points = this.#layers[layerIndex]?.store.getVisibleData(range.from, range.to) ?? [];
      const centers = points.map((p) => ({
        time: p.time,
        value: isGap(p) ? Number.NaN : yScale.lerpValue(p.low, p.high, 0.5),
      }));
      centerCache[layerIndex] = centers;

      return centers;
    };

    const layerMean = (layerIndex: number): number | null => {
      const cached = meanCache[layerIndex];
      if (cached !== undefined) return cached;

      const mean = scaleMean(layerData(layerIndex), yScale);
      meanCache[layerIndex] = mean;

      return mean;
    };

    const primaryPath = (): ReadonlyArray<{ x: number; y: number; time: number }> | null => {
      if (pathCache !== undefined) return pathCache;

      pathCache = null;
      for (let li = 0; li < layerCount; li++) {
        if (this.getLayerAlpha(li) <= 0 || !this.isLayerVisible(li)) continue;

        const drawable = layerData(li).filter((d) => yScale.isPlottable(d.value));
        if (drawable.length < 2) continue;

        pathCache = drawable.map((d) => ({
          x: timeScale.timeToBitmapXExact(d.time),
          y: yScale.valueToBitmapYExact(d.value),
          time: d.time,
        }));
        break;
      }

      return pathCache;
    };

    return {
      progress,
      range,
      width,
      height: yScale.getMediaHeight() * scope.verticalPixelRatio,
      stacking: 'off',
      timeToX: (time) => timeScale.timeToBitmapXExact(time),
      xToTime: (x) => timeScale.xToTime(x / scope.horizontalPixelRatio),
      valueToY: (value) => yScale.valueToBitmapYExact(value),
      lerpValue: (from, to, t) => yScale.lerpValue(from, to, t),
      layerCount,
      layerData,
      layerMean,
      primaryPath,
    };
  }

  // --- Overlay --------------------------------------------------------------

  /** Crosshair dots on both edges of every visible band at the hovered sample. */
  drawOverlay(ctx: OverlayRenderContext): void {
    this.#tick(performance.now());

    const { crosshair, scope } = ctx;
    if (crosshair === null) return;

    const { context, horizontalPixelRatio } = scope;
    const radius = 3 * horizontalPixelRatio;
    const halo = radius + 3 * horizontalPixelRatio;

    for (let li = 0; li < this.#layers.length; li++) {
      const layer = this.#layers[li];
      const layerAlpha = layer.alpha.current;
      if (layerAlpha <= 0) continue;

      const nearest = layer.store.findNearest(crosshair.time, ctx.dataInterval);
      if (nearest === null) continue;

      const vertex = this.#hoverVertex(ctx, li, nearest);
      if (vertex === null) continue;

      const color = this.#layerColor(li);
      context.save();
      context.globalAlpha *= layerAlpha;
      context.fillStyle = color;

      for (const y of [vertex.top, vertex.bottom]) {
        context.save();
        context.globalAlpha *= 0.25;
        context.beginPath();
        context.arc(vertex.x, y, halo, 0, Math.PI * 2);
        context.fill();
        context.restore();

        context.beginPath();
        context.arc(vertex.x, y, radius, 0, Math.PI * 2);
        context.fill();
      }

      context.restore();
    }
  }

  /** The hovered sample where the fill draws it: an entering tail point sits on its grown head. */
  #hoverVertex(ctx: OverlayRenderContext, layerIndex: number, point: BandPoint): BandVertex | null {
    const layer = this.#layers[layerIndex];
    const range = ctx.timeScale.getRange();
    const slice = layer.store.getVisibleData(range.from, range.to);
    const grown = this.#sliceEndsLive(layer, slice) ? this.#growTail(ctx, layerIndex) : null;

    return grown?.get(point.time) ?? this.#vertex(ctx, layerIndex, point);
  }

  // --- Data queries ---------------------------------------------------------

  /** A sample as a query reports it: the drawn (live-chased) edges, `null` for a gap. */
  #snapshot(layer: BandLayer, point: BandPoint): BandPoint | null {
    if (isGap(point)) return null;

    const live = this.#liveEdges(layer, point);

    return { ...point, low: Math.min(live.low, live.high), high: Math.max(live.low, live.high) };
  }

  getDataAtTime(time: number, interval: number): BandPoint | null {
    const layer = this.#layers[0];
    const point = layer.store.findNearest(time, interval);

    return point === null ? null : this.#snapshot(layer, point);
  }

  getLayerSnapshots(time: number, interval: number): LayerSnapshot[] | null {
    if (this.#layers.length <= 1) return null;

    return this.#collectLayerSnapshots((layer) => layer.store.findNearest(time, interval));
  }

  getLayerLastSnapshots(): LayerSnapshot[] | null {
    if (this.#layers.length <= 1) return null;

    return this.#collectLayerSnapshots((layer) => layer.store.last() ?? null);
  }

  #collectLayerSnapshots(pick: (layer: BandLayer) => BandPoint | null): LayerSnapshot[] | null {
    const results: LayerSnapshot[] = [];
    for (let li = 0; li < this.#layers.length; li++) {
      const layer = this.#layers[li];
      if (!layer.store.isVisible()) continue;

      const point = pick(layer);
      const snapshot = point === null ? null : this.#snapshot(layer, point);
      if (snapshot === null) continue;

      results.push({
        layerIndex: li,
        time: snapshot.time,
        value: (snapshot.low + snapshot.high) / 2,
        color: this.#layerColor(li),
        low: snapshot.low,
        high: snapshot.high,
      });
    }

    return results.length > 0 ? results : null;
  }

  getTotalLength(): number {
    let total = 0;
    for (const layer of this.#layers) {
      total += layer.store.length;
    }

    return total;
  }

  getTimeBounds(): { first: number; last: number } | null {
    let first = Infinity;
    let last = -Infinity;
    for (const layer of this.#layers) {
      const head = layer.store.first();
      const tail = layer.store.last();
      if (head === undefined || tail === undefined) continue;

      if (head.time < first) first = head.time;
      if (tail.time > last) last = tail.time;
    }

    return first === Infinity ? null : { first, last };
  }

  /** Last point of layer 0, like the line / bar renderers. */
  getLastDataPoint(): BandPoint | null {
    return this.#layers[0].store.last() ?? null;
  }

  getSecondLastDataPoint(): BandPoint | null {
    const all = this.#layers[0].store.getAll();

    return all.length < 2 ? null : all[all.length - 2];
  }

  sampleTimes(maxCount: number): number[] {
    for (const layer of this.#layers) {
      const all = layer.store.getAll();
      if (all.length === 0) continue;

      return all.slice(0, maxCount).map((p) => p.time);
    }

    return [];
  }

  getVisibleDataPoints(from: number, to: number): readonly BandPoint[] {
    return this.#layers[0].store.getVisibleData(from, to);
  }

  /** Union of every visible band's edges. A sample counts only when both edges are drawable. */
  getValueRange(from: number, to: number, opts?: ValueRangeOptions): { min: number; max: number } | null {
    const plottable = opts?.plottable;
    let min = Infinity;
    let max = -Infinity;

    for (const layer of this.#layers) {
      if (!layer.store.isVisible()) continue;

      for (const point of layer.store.getVisibleData(from, to)) {
        if (isGap(point)) continue;
        if (plottable && (!plottable(point.low) || !plottable(point.high))) continue;

        if (point.low < min) min = point.low;
        if (point.high > max) max = point.high;
      }
    }

    return min < Infinity ? { min, max } : null;
  }

  // --- Lifecycle ------------------------------------------------------------

  onDataChanged(listener: () => void): () => void {
    for (const layer of this.#layers) {
      layer.store.on('update', listener);
    }

    return () => {
      for (const layer of this.#layers) {
        layer.store.off('update', listener);
      }
    };
  }

  dispose(): void {
    for (const layer of this.#layers) {
      layer.store.removeAllListeners();
    }
  }
}

/** One layer takes the theme's band color; several take the series palette, like the line. */
function themeColors(theme: ChartTheme, layerCount: number): ValueColor[] {
  return layerCount === 1 ? [theme.bands.upper] : theme.seriesColors.slice(0, layerCount);
}

/**
 * Bitmap X between the live run's last two vertices, snapped to a whole pixel
 * so the two clipped passes meet without an antialiased seam. `null` when the
 * last run has no trailing segment.
 */
function fadeSeam(runs: readonly BandVertex[][]): number | null {
  const run = runs[runs.length - 1];
  if (run.length < 2) return null;

  return Math.round(run[run.length - 2].x);
}

/** Series definition for `chart.addSeries` — keeps the chart renderer-agnostic. */
export const BandSeriesDef: SeriesDefinition<BandSeriesOptions> = {
  type: 'band',
  create: ({ theme, layerCount }, options) =>
    new BandRenderer(layerCount, { colors: themeColors(theme, layerCount), ...options }),
};

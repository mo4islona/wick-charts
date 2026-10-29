import { DEFAULT_BAR_ENTRY, DEFAULT_BAR_INTRO, DEFAULT_BAR_SMOOTH, DEFAULT_HISTORY_REVEAL } from '../animation/config';
import type { XScale } from '../scales/x-scale';
import type { YScale } from '../scales/y-scale';
import { resolveAxisFontSize } from '../theme/resolve';
import type { ChartTheme } from '../theme/types';
import type { BarSeriesOptions, TimePoint, ValueColor } from '../types';
import { type BarIntroDirectives, growIntro } from './bar-intro';
import { BaseMultiLayerSeries } from './base-multi-layer';
import type { SeriesDefinition } from './definition';
import { resolveBarPainter } from './painters/resolve';
import type { BarPaintArgs, BarPainter, CornerMask, PaintEnv } from './painters/types';
import { ScaleStack } from './scale-stack';
import type { StackTotals } from './stack-math';
import type { SeriesRenderContext, ValueRangeOptions } from './types';
import { fadeIntro } from './wave-intro';

/** Internal resolved shape: `entryMs` / `smoothMs` are concrete numbers
 *  (`false` from the public surface gets normalized to `0` at the merge
 *  boundary, so downstream reads never see the disable sentinel). */
type ResolvedBarOptions = Omit<BarSeriesOptions, 'entryMs' | 'smoothMs' | 'introMs' | 'historyRevealMs'> & {
  /** One resolver per layer; renderer-internal (theme default + `data` override), not a public option. */
  colors: ValueColor[];
  entryMs: number;
  smoothMs: number;
  introMs: number;
  historyRevealMs: number;
};

/** Caller-facing option input — the public surface plus the internal `colors`. */
type BarOptionsInput = Partial<BarSeriesOptions> & { colors?: ValueColor[] };

/** Default free-end corner radius in CSS px. `0` is byte-identical to the
 *  pre-rounding `fillRect` output (see {@link fillRoundedRect}). */
const DEFAULT_CORNER_RADIUS = 2;

const DEFAULT_OPTIONS: ResolvedBarOptions = {
  // Single fallback resolver; the definition's `create` swaps in `theme.bar.color`.
  colors: ['#26a69a'],
  barWidthRatio: 0.6,
  stacking: 'off',
  anchor: 'center',
  cornerRadius: DEFAULT_CORNER_RADIUS,
  entryMs: DEFAULT_BAR_ENTRY,
  smoothMs: DEFAULT_BAR_SMOOTH,
  introMs: DEFAULT_BAR_INTRO,
  historyRevealMs: DEFAULT_HISTORY_REVEAL,
};

function normalize(options: BarSeriesOptions & { colors: ValueColor[] }): ResolvedBarOptions {
  return {
    ...options,
    entryMs: options.entryMs === false ? 0 : (options.entryMs ?? DEFAULT_BAR_ENTRY),
    smoothMs: options.smoothMs === false ? 0 : (options.smoothMs ?? DEFAULT_BAR_SMOOTH),
    introMs: options.introMs === false ? 0 : (options.introMs ?? DEFAULT_BAR_INTRO),
    historyRevealMs: options.historyRevealMs === false ? 0 : (options.historyRevealMs ?? DEFAULT_HISTORY_REVEAL),
  };
}

/** Fallback intro when the option is unset — stateless, safe to share. */
const DEFAULT_INTRO = growIntro();

/** Fallback history reveal — a soft staggered fade from the data boundary.
 *  Calmer than the grow: load-more fires repeatedly while the user pans. */
const DEFAULT_HISTORY_REVEAL_FN = fadeIntro();

/** The free end the renderer decided to round for a given bar / segment. The
 *  renderer owns this — only it knows the draw mode (single / overlap / stacked /
 *  percent) — so a painter never infers sign from geometry. */
type RoundEdge = 'top' | 'bottom' | 'none';

/** Shared corner masks per free end. Reused across bars in a pass; painters must
 *  treat the mask as read-only (documented in {@link BarPaintArgs}). */
const CORNER_MASKS: Record<RoundEdge, CornerMask> = {
  top: { tl: true, tr: true, br: false, bl: false },
  bottom: { tl: false, tr: false, br: true, bl: true },
  none: { tl: false, tr: false, br: false, bl: false },
};

/** Per-render drawing context, resolved once in {@link BarRenderer.render} so
 *  the per-bar `drawAnimatedBar` doesn't re-resolve the painter or rebuild the
 *  env on every element. */
interface BarPass {
  painter: BarPainter;
  env: PaintEnv;
  /** Corner radius in bitmap px (CSS px × horizontalPixelRatio, matching the
   *  candlestick renderer), before the per-element clamp.
   *  {@link BarRenderer.drawAnimatedBar} clamps it to each bar's geometry so the
   *  value handed to a painter honors the pre-clamped `radius` contract. */
  radius: number;
  /** Presence 0 → 1 of the category band at a time coordinate; `1` off a category axis. */
  bandPresence: (time: number) => number;
}

/** Inset in CSS px on each side of a grouped bar, so neighbours in a band keep a gap. */
const GROUP_INSET = 1;

/** Gap in CSS px between a bar's free end and its value label. */
const LABEL_GAP = 3;

/** A bar that left the data, still fading out at its own time. */
interface ExitState {
  value: number;
  startTime: number;
}

/** One value label, placed at the free end of the drawn bar. */
interface ValueLabel {
  value: number;
  /** Horizontal centre of the bar, in bitmap px. */
  x: number;
  /** The bar's free end, in bitmap px. */
  y: number;
  /** A negative bar: the label hangs below its free end. */
  below: boolean;
  /** Width of the bar body — a wider text is skipped. */
  maxWidth: number;
  alpha: number;
}

/** Geometry and opacity a bar was painted with, after every transform. */
interface DrawnBar {
  x: number;
  topY: number;
  barWidth: number;
  barHeight: number;
  alpha: number;
}

/** Per-layer settled value and presence (fade × entrance) of one stacked column. */
interface ColumnShares {
  settled: number[];
  weights: number[];
}

/** Per-layer segment edges of one stacked column: `base` sits on the stack below, `end` is the outer edge. */
interface SegmentEdges {
  base: number[];
  end: number[];
}

/** Plain running sums — positive and negative segments stack away from 0 separately. */
function sumEdges(values: readonly number[]): SegmentEdges {
  const base: number[] = [];
  const end: number[] = [];
  let positive = 0;
  let negative = 0;
  for (const value of values) {
    const below = value > 0 ? positive : negative;
    base.push(below);
    end.push(below + value);

    if (value > 0) positive += value;
    else negative += value;
  }

  return { base, end };
}

/** One bar's draw spec for {@link BarRenderer.drawAnimatedBar} — grouped into
 *  a single object so call sites read by name instead of many positional
 *  args. */
interface AnimatedBar {
  context: CanvasRenderingContext2D;
  /** The bar's time coordinate — positions the intro's wave stagger. */
  time: number;
  /** Entrance progress 0→1; `>= 1` paints the settled bar with no transform. */
  progress: number;
  /** Y the bar grows from during entrance — the zero line, or the segment's
   *  own base for stacked bars. */
  baselineY: number;
  /** Top edge of the settled bar, in bitmap px. */
  topY: number;
  /** Settled bar height, in bitmap px. */
  barHeight: number;
  /** Left edge of the bar body, in bitmap px. */
  x: number;
  /** Bar body width, in bitmap px. */
  barWidth: number;
  color: string;
  /** Which edge to round — the renderer's per-mode free-end decision. */
  roundEdge: RoundEdge;
  /** Ghost / forecast bar (`time >= options.projectedFrom`). Skips the entrance
   *  transform so its only alpha source is the painter's translucent fill. */
  isProjected: boolean;
  /** Entrance growth is already baked into the geometry (stacked paths scale
   *  layer values by progress before stacking). The transform must skip its own
   *  grow so the segment isn't scaled twice; fade still applies. */
  growBaked?: boolean;
}

export class BarRenderer extends BaseMultiLayerSeries<TimePoint> {
  readonly kind = 'bar' as const;
  protected declare options: ResolvedBarOptions;

  /** Resolved drawing context for the in-flight render pass. Set at the top of
   *  {@link render}, read by {@link drawAnimatedBar}. */
  #pass: BarPass | null = null;

  /** Per-frame intro directives, resolved once per render while the wave
   *  runs; `null` when no intro is in flight. */
  #introDirectives: BarIntroDirectives | null = null;
  /** Visible range captured alongside {@link #introDirectives} — positions
   *  the per-bar wave stagger. */
  #introRange: { from: number; to: number } | null = null;
  /** Per-frame history-reveal directives; `null` when no reveal is in flight. */
  #historyDirectives: BarIntroDirectives | null = null;
  /** Bars a {@link morphData} removed, per layer and keyed by time, fading out over `entryMs`. */
  readonly #exits: Array<Map<number, ExitState>>;
  /** Value labels queued by the in-flight render pass; `null` while labels are off. */
  #labels: ValueLabel[] | null = null;

  constructor(layerCount: number, options?: BarOptionsInput) {
    super(layerCount);
    this.options = normalize({ ...DEFAULT_OPTIONS, ...options });
    this.#exits = Array.from({ length: layerCount }, () => new Map<number, ExitState>());
  }

  updateOptions(options: BarOptionsInput): void {
    this.options = normalize({ ...this.options, ...options });
  }

  /** As the base, and a bar whose time went away fades out where it stood. */
  morphData(data: unknown, layerIndex = 0): void {
    const store = this.stores[layerIndex];
    if (store === undefined) return;

    const left = new Map<number, number>();
    for (const point of store.getAll()) {
      left.set(point.time, this.liveValue(layerIndex, point.time, point.value));
    }

    super.morphData(data, layerIndex);

    const exits = this.#exits[layerIndex];
    for (const point of store.getAll()) {
      left.delete(point.time);
      exits.delete(point.time);
    }

    const exitOn = this.isEntryEnabled() && this.options.entryMs > 0;
    if (!exitOn) return;

    const startTime = performance.now();
    for (const [time, value] of left) {
      if (!Number.isFinite(value)) continue;

      exits.set(time, { value, startTime });
    }
  }

  /** Re-key the layer's fading bars; a re-seed keeps them, the chart moves them with their bands. */
  moveExits(args: { layerIndex: number; remap: (time: number) => number | undefined }): void {
    const exits = this.#exits[args.layerIndex];
    if (exits === undefined || exits.size === 0) return;

    const moved = new Map<number, ExitState>();
    for (const [time, exit] of exits) {
      const next = args.remap(time);
      if (next !== undefined) moved.set(next, exit);
    }

    this.#exits[args.layerIndex] = moved;
  }

  /** Whether a bar that left the data is still fading out at `time`. */
  isExiting(time: number): boolean {
    for (let li = 0; li < this.#exits.length; li++) {
      const remaining = this.#exitRemaining(li, time);
      if (remaining !== null && remaining > 0) return true;
    }

    return false;
  }

  get needsAnimation(): boolean {
    if (super.needsAnimation) return true;

    return this.#exits.some((exits) => exits.size > 0);
  }

  /** An exiting bar plays its entrance backwards. */
  protected entranceProgress(layerIndex: number, time: number): number {
    const remaining = this.#exitRemaining(layerIndex, time);
    if (remaining !== null) return remaining;

    return super.entranceProgress(layerIndex, time);
  }

  /** Presence `1 → 0` of a bar fading out at `time`, or `null` when none is. */
  #exitRemaining(layerIndex: number, time: number): number | null {
    const exit = this.#exits[layerIndex]?.get(time);
    if (exit === undefined) return null;

    const entryMs = this.options.entryMs;
    if (entryMs <= 0) return 0;

    const elapsed = performance.now() - exit.startTime;

    return Math.min(1, Math.max(0, 1 - elapsed / entryMs));
  }

  #pruneExits(now: number): void {
    const entryMs = this.options.entryMs;
    for (const exits of this.#exits) {
      for (const [time, exit] of exits) {
        if (now - exit.startTime >= entryMs) exits.delete(time);
      }
    }
  }

  /**
   * A layer's visible points plus its bars still fading out, which the store no longer holds.
   * On a category axis every bar: one sliding to a band past the range still draws, and the clip trims it.
   */
  #drawnPoints(args: { layerIndex: number; timeScale: XScale }): readonly TimePoint[] {
    const { layerIndex, timeScale } = args;
    const store = this.stores[layerIndex];
    const range = timeScale.getDrawRange();
    const visible = timeScale.getType() === 'category' ? store.getAll() : store.getVisibleData(range.from, range.to);
    const exits = this.#exits[layerIndex];
    if (exits.size === 0) return visible;

    const points = [...visible];
    for (const [time, exit] of exits) {
      points.push({ time, value: exit.value });
    }

    return points;
  }

  getValueRange(from: number, to: number, opts?: ValueRangeOptions): { min: number; max: number } | null {
    if (this.options.stacking === 'percent') return this.#percentRange(from, to);

    const range = super.getValueRange(from, to, opts);
    const zeroPlottable = opts?.plottable?.(0) ?? true;
    if (range === null || !zeroPlottable) return range;

    // A bar is read by its length from zero, so zero stays on the axis; stacked ranges already hold it.
    return { min: Math.min(0, range.min), max: Math.max(0, range.max) };
  }

  /** The signed shares a percent stack reaches: 0..100 for positive data, down to -100 for an all-negative column. */
  #percentRange(from: number, to: number): { min: number; max: number } {
    const columns = new Map<number, StackTotals>();
    for (const store of this.stores) {
      if (!store.isVisible()) continue;

      for (const point of store.getVisibleData(from, to)) {
        if (!Number.isFinite(point.value)) continue;

        const column = columns.get(point.time) ?? { positive: 0, negative: 0 };
        if (point.value > 0) column.positive += point.value;
        else column.negative += point.value;
        columns.set(point.time, column);
      }
    }

    let min = 0;
    let max = 0;
    for (const { positive, negative } of columns.values()) {
      const total = positive - negative;
      if (total <= 0) continue;

      max = Math.max(max, (positive / total) * 100);
      min = Math.min(min, (negative / total) * 100);
    }

    // No column yet: the familiar 0..100 frame.
    return max === 0 && min === 0 ? { min: 0, max: 100 } : { min, max };
  }

  protected isEntryEnabled(): boolean {
    return (this.options.entryAnimation ?? 'fade-grow') !== 'none';
  }

  /**
   * Normalized x-position + eased wave progress for the intro's callbacks.
   * `null` when no intro is in flight this frame.
   */
  #introWaveAt(time: number): { position: number; progress: number } | null {
    const range = this.#introRange;
    if (range === null) return null;

    const span = range.to - range.from;
    const raw = span > 0 ? (time - range.from) / span : 0;
    const position = Math.min(1, Math.max(0, raw));

    return { position, progress: this.introWave.progressAt(position) };
  }

  /**
   * Stagger position + eased wave progress for the history reveal's
   * callbacks — position anchored at the data boundary (`0` there, `1` at
   * the deepest prepended point). `null` for bars outside the prepended
   * span or when no reveal is in flight this frame.
   */
  #historyWaveAt(time: number): { position: number; progress: number } | null {
    const range = this.historyRange;
    if (this.#historyDirectives === null || range === null || time >= range.to) return null;

    const span = range.to - range.from;
    const raw = span > 0 ? (range.to - time) / span : 0;
    const position = Math.min(1, Math.max(0, raw));

    return { position, progress: this.historyWave.progressAt(position) };
  }

  /**
   * Apply the intro's `value` directive to one rendered value. Scaling here
   * (before geometry and stacking) grows the bar from the baseline on every
   * render path — off / stacked / percent — without touching their geometry
   * code. Projected (forecast) bars stay settled, like streaming entrances.
   * A bar inside an in-flight history reveal is owned by the reveal's value
   * directive instead.
   */
  private introValue(args: { layerIndex: number; time: number; value: number }): number {
    if (this.isProjectedTime(args.time)) return args.value;

    const historyValue = this.#historyDirectives?.value;
    if (historyValue !== undefined) {
      const wave = this.#historyWaveAt(args.time);
      if (wave !== null) return historyValue({ ...args, ...wave });
    }

    const value = this.#introDirectives?.value;
    if (value === undefined) return args.value;

    const wave = this.#introWaveAt(args.time);
    if (wave === null) return args.value;

    return value({ ...args, ...wave });
  }

  applyTheme(theme: ChartTheme, _prev: ChartTheme): void {
    // Reset the theme base only; per-layer `data` color overrides are held
    // separately (setColorOverrides) and ride through a theme swap untouched. A
    // single-layer bar defaults to the theme's `bar.color` (a sign value-fn), so
    // bars get green-up / red-down with no option; multi-layer uses the palette.
    const single = this.stores.length === 1;
    const fallback = theme.seriesColors[0] ?? '#26a69a';
    const colors: ValueColor[] = single
      ? [theme.bar?.color ?? fallback]
      : theme.seriesColors.slice(0, this.stores.length);

    this.updateOptions({ colors });
  }

  /** True when `time` is at/after the configured `projectedFrom` forecast cut. */
  /**
   * The bar stack's reading of a percent column (see `renderStacked`): each
   * layer's sample at `time` as drawn — smoothed, faded, growing in, intro applied — as a
   * signed share of the column's absolute sum; `null` when the column draws nothing.
   */
  protected percentShares(time: number): Map<number, number> | null {
    const style = this.options.entryAnimation ?? 'fade-grow';
    const growsIn = (style === 'grow' || style === 'fade-grow') && !this.isProjectedTime(time);

    const values = new Map<number, number>();
    let positive = 0;
    let negative = 0;
    for (let li = 0; li < this.stores.length; li++) {
      const alpha = this.getLayerAlpha(li);
      if (alpha <= 0) continue;

      const point = this.stores[li].findNearest(time, 0);
      if (point === null || !Number.isFinite(point.value)) continue;

      const entrance = growsIn ? this.entranceProgress(li, time) : 1;
      const settled = this.liveValue(li, time, point.value) * alpha * entrance;
      const value = this.introValue({ layerIndex: li, time, value: settled });
      values.set(li, value);
      if (value > 0) positive += value;
      if (value < 0) negative += value;
    }
    if (positive === 0 && negative === 0) return null;

    const total = positive - negative;
    const shares = new Map<number, number>();
    for (const [li, value] of values) {
      shares.set(li, (value / total) * 100);
    }

    return shares;
  }

  /** A percent column's drawn head: its positive share, or its negative one when it has no positives. */
  protected percentTop(totals: StackTotals): number {
    const total = totals.positive - totals.negative;
    if (total <= 0) return 0;

    const side = totals.positive > 0 ? totals.positive : totals.negative;

    return (side / total) * 100;
  }

  private isProjectedTime(time: number): boolean {
    const from = this.options.projectedFrom;

    return from !== undefined && time >= from;
  }

  /**
   * Shape of the per-bar entrance transform. Centralized so the entrance style
   * is a single switch; new styles like 'slide' drop in here without touching
   * each render path.
   */
  private applyBarTransform(
    bar: AnimatedBar,
    progress: number,
  ): { topY: number; barHeight: number; x: number; barWidth: number; alpha: number } {
    const { baselineY, topY, barHeight, x, barWidth } = bar;

    const style = this.options.entryAnimation ?? 'fade-grow';
    if (progress >= 1 || style === 'none') {
      return { topY, barHeight, x, barWidth, alpha: 1 };
    }

    let tY = topY;
    let h = barHeight;
    let xx = x;
    let alpha = 1;

    if (style === 'fade' || style === 'fade-grow') alpha = progress;
    if ((style === 'grow' || style === 'fade-grow') && !bar.growBaked) {
      // Anchor at baseline: bar grows from zeroY upward/downward.
      const scaled = barHeight * progress;
      if (topY < baselineY) {
        // positive bar — top is above baseline; grow downward from baseline.
        tY = baselineY - scaled;
      } else {
        // negative bar — topY is at baseline; grow downward from baseline.
        tY = baselineY;
      }
      h = Math.max(1, scaled);
    }
    if (style === 'slide') {
      // Translate in from the right edge of the bar slot.
      xx = x + (1 - progress) * barWidth;
      alpha = progress;
    }

    return { topY: tY, barHeight: h, x: xx, barWidth, alpha };
  }

  render(ctx: SeriesRenderContext): void {
    const now = performance.now();
    this.tickAnimations(now);
    this.#pruneExits(now);

    const { scope, timeScale, yScale } = ctx;

    this.#pass = {
      painter: resolveBarPainter(this.options.barPainter),
      env: {
        ctx: scope.context,
        theme: ctx.theme,
        horizontalPixelRatio: scope.horizontalPixelRatio,
        verticalPixelRatio: scope.verticalPixelRatio,
      },
      radius: (this.options.cornerRadius ?? DEFAULT_CORNER_RADIUS) * scope.horizontalPixelRatio,
      bandPresence: timeScale.getType() === 'category' ? (time: number) => timeScale.bandEnterProgress(time) : () => 1,
    };

    const valueAxis = {
      baseline: yScale.baselineValue(),
      lerpValue: (from: number, to: number, t: number) => yScale.lerpValue(from, to, t),
    };

    // Resolve the intro's per-frame directives while the wave is in flight.
    // The intro function owns the choreography (clip window, per-value
    // transform, per-bar transform); the render paths below apply it on top
    // of the streaming entry animation.
    this.#introDirectives = null;
    this.#introRange = null;
    if (this.introWave.active) {
      const intro = this.options.introAnimation ?? DEFAULT_INTRO;
      const range = timeScale.getRange();
      this.#introRange = range;
      this.#introDirectives = intro({
        progress: this.introWave.linear(),
        // Plot-area extent, not the canvas bitmap — the canvas also carries
        // the axis strips, so a width-based front (wipeIntro) would overshoot
        // the data area.
        width: timeScale.getMediaWidth() * scope.horizontalPixelRatio,
        height: yScale.getMediaHeight() * scope.verticalPixelRatio,
        range,
        timeToX: (time) => timeScale.timeToBitmapX(time),
        ...valueAxis,
      });
    }

    // History-reveal directives — same contract, localized frame: `range` is
    // the prepended span, `width` its bitmap width. Stagger and clip both
    // anchor at the data boundary.
    this.#historyDirectives = null;
    const historyRange = this.historyRange;
    if (this.historyWave.active && historyRange !== null) {
      const reveal = this.options.historyReveal ?? DEFAULT_HISTORY_REVEAL_FN;
      if (reveal !== 'none') {
        this.#historyDirectives = reveal({
          progress: this.historyWave.linear(),
          width: Math.abs(timeScale.timeToBitmapX(historyRange.to) - timeScale.timeToBitmapX(historyRange.from)),
          height: yScale.getMediaHeight() * scope.verticalPixelRatio,
          range: historyRange,
          timeToX: (time) => timeScale.timeToBitmapX(time),
          ...valueAxis,
        });
      }
    }

    // Intro clip directive (e.g. `wipeIntro()`): bars pop in fully formed
    // as the front crosses them.
    const introClip = this.#introDirectives?.clip;
    if (introClip !== undefined) {
      const fromX = introClip.fromX ?? 0;
      const toX = introClip.toX ?? scope.bitmapSize.width;
      scope.context.save();
      scope.context.beginPath();
      scope.context.rect(fromX, 0, Math.max(0, toX - fromX), scope.bitmapSize.height);
      scope.context.clip();
    }

    // History-reveal clip directive, interpreted in reveal space: local
    // x = 0 at the data boundary, increasing toward the older (prepended)
    // end. Everything at or after the boundary always draws; the pad keeps
    // bar bodies straddling either end from being sliced.
    const historyClip = this.#historyDirectives?.clip;
    let historyClipApplied = false;
    if (historyClip !== undefined && historyRange !== null) {
      const boundaryX = timeScale.timeToBitmapX(historyRange.to);
      const spanWidth = Math.abs(boundaryX - timeScale.timeToBitmapX(historyRange.from));
      const pad = timeScale.barWidthBitmap(ctx.dataInterval);
      const fromLocal = historyClip.fromX ?? 0;
      const toLocal = historyClip.toX ?? spanWidth;

      scope.context.save();
      scope.context.beginPath();
      scope.context.rect(boundaryX - toLocal - pad, 0, Math.max(0, toLocal - fromLocal + pad), scope.bitmapSize.height);
      scope.context.rect(boundaryX, 0, Math.max(0, scope.bitmapSize.width - boundaryX), scope.bitmapSize.height);
      scope.context.clip();
      historyClipApplied = true;
    }

    const labelsOn = Boolean(this.options.valueLabels) && this.options.stacking !== 'percent';
    this.#labels = labelsOn ? [] : null;

    switch (this.options.stacking) {
      case 'normal':
        this.renderStacked(ctx, false);
        break;
      case 'percent':
        this.renderStacked(ctx, true);
        break;
      default:
        this.renderOff(ctx);
        break;
    }

    if (this.#labels !== null) this.#drawValueLabels(ctx, this.#labels);
    this.#labels = null;

    if (historyClipApplied) scope.context.restore();
    if (introClip !== undefined) scope.context.restore();
  }

  /**
   * Bar body width in bitmap px. On a category axis a bar fills its band;
   * elsewhere it takes `barWidthRatio` of the slot, capped only when the
   * visible range is sparse (≤ 2 points on the most-populated layer) — dense
   * zooms must keep wide bars. See the matching comment in candlestick.ts.
   */
  #bodyWidth(ctx: SeriesRenderContext): number {
    const { scope, timeScale, dataInterval } = ctx;
    if (timeScale.getType() === 'category') return timeScale.bandWidthBitmap();

    const range = timeScale.getRange();
    let maxVisibleCount = 0;
    for (const store of this.stores) {
      if (!store.isVisible()) continue;
      const count = store.getVisibleData(range.from, range.to).length;
      if (count > maxVisibleCount) maxVisibleCount = count;
      if (maxVisibleCount > 2) break;
    }

    const naturalBarWidth = timeScale.barWidthBitmap(dataInterval);
    const sparseCap = Math.round(30 * scope.horizontalPixelRatio);
    const barWidth = maxVisibleCount <= 2 ? Math.min(sparseCap, naturalBarWidth) : naturalBarWidth;

    return Math.max(1, Math.round(barWidth * this.options.barWidthRatio));
  }

  /** Stacking off — each layer drawn from zero: grouped on a category axis, overlapping elsewhere. */
  private renderOff(ctx: SeriesRenderContext): void {
    const { scope, timeScale, yScale } = ctx;
    const { context } = scope;
    const range = timeScale.getDrawRange();

    const bodyWidth = this.#bodyWidth(ctx);
    const halfBody = Math.floor(bodyWidth / 2);
    // anchor='right' draws the body so its right edge sits on the time tick,
    // letting the rightmost bar fit on canvas with padding.right = 0.
    const anchorOffset = this.options.anchor === 'right' ? bodyWidth : halfBody;

    const yRange = yScale.getRange();
    const hasNegative = yRange.min < 0;
    const zeroY = hasNegative ? yScale.valueToBitmapY(0) : scope.bitmapSize.height;

    const isSingleLayer = this.stores.length === 1;
    const grouped = !isSingleLayer && timeScale.getType() === 'category';

    if (isSingleLayer) {
      if (!this.stores[0].isVisible()) return;

      for (const d of this.#drawnPoints({ layerIndex: 0, timeScale })) {
        // Skip poisoned values (null / NaN / ±Infinity / undefined) — the
        // renderer must not draw a NaN-height bar — and, on a log scale, values ≤ 0.
        if (!yScale.isPlottable(d.value)) continue;

        // The intro's value directive scales the drawn value (growth from
        // the baseline); color resolves from the settled value so a
        // threshold value-fn doesn't flicker hues while the bar grows.
        const raw = this.effectiveValue(ctx, 0, d.time, d.value);
        const value = this.introValue({ layerIndex: 0, time: d.time, value: raw });
        // One resolver per layer: a value-fn (the theme default) paints by sign
        // / threshold, a string paints uniform — replaces the old colors[0]=up /
        // colors[1]=down pair.
        const color = this.resolveLayerColor(0, raw);

        const drawn = this.#drawFromZero({
          ctx,
          layerIndex: 0,
          time: d.time,
          value,
          zeroY,
          x: timeScale.timeToBitmapX(d.time) - anchorOffset,
          barWidth: bodyWidth,
          color,
        });
        this.#queueLabel({ drawn, value: raw, below: value < 0 });
      }
    } else if (grouped) {
      this.#renderGrouped(ctx, { zeroY, bandWidth: bodyWidth });
    } else {
      // Multi-layer: collect per-time, draw tallest first so shorter bars appear in front.
      // Drawn value moves from the baseline to effectiveValue by getLayerAlpha —
      // geometry shrinks toward the baseline as the layer fades, so the bar stays inside the Y range
      // that is simultaneously contracting to "without this layer". Without
      // the alpha-weight, a tall bar (value=500) keeps full height while the
      // Y axis eases to a much smaller max → topY goes negative and the bar
      // visibly flies off the top of the canvas during the toggle window.
      // Alpha=0 is fully excluded one step earlier so the timeMap stays clean.
      const layers = this.stores.map((store, li) =>
        this.getLayerAlpha(li) > 0 ? store.getVisibleData(range.from, range.to) : [],
      );
      const timeMap = new Map<number, { layer: number; value: number; colorValue: number }[]>();
      const baseline = yScale.baselineValue();
      for (let li = 0; li < layers.length; li++) {
        const alpha = this.getLayerAlpha(li);
        for (const d of layers[li]) {
          if (!yScale.isPlottable(d.value)) continue;
          let arr = timeMap.get(d.time);
          if (!arr) {
            arr = [];
            timeMap.set(d.time, arr);
          }

          const settled = this.effectiveValue(ctx, li, d.time, d.value);
          const scaled = alpha === 1 ? settled : yScale.lerpValue(baseline, settled, alpha);
          arr.push({
            layer: li,
            value: this.introValue({ layerIndex: li, time: d.time, value: scaled }),
            // Color resolves from the settled data value — same contract as
            // the single-layer path — so a threshold value-fn doesn't flicker
            // hues while the intro sweeps the drawn value from 0 to final.
            colorValue: d.value,
          });
        }
      }

      for (const [time, entries] of timeMap) {
        // Sort by |value| descending — tallest drawn first (behind). With
        // alpha-weighted values a fading layer naturally moves toward the
        // back of the stack as it shrinks, which is the correct paint order.
        entries.sort(
          (a: { layer: number; value: number }, b: { layer: number; value: number }) =>
            Math.abs(b.value) - Math.abs(a.value),
        );
        const cx = timeScale.timeToBitmapX(time);
        const isProjected = this.isProjectedTime(time);

        // Overlap mode: every bar rounds its free end — each bar's top (or
        // bottom, for negatives) pokes out above the shorter bars in front of
        // it, so a square edge on a back bar reads as a rendering glitch.
        for (let i = 0; i < entries.length; i++) {
          const { layer, value, colorValue } = entries[i];
          const color = this.resolveLayerColor(layer, colorValue);
          const progress = this.entranceProgress(layer, time);
          if (value >= 0) {
            const topY = yScale.valueToBitmapY(value);
            const barHeight = Math.max(1, zeroY - topY);
            this.drawAnimatedBar({
              context,
              time,
              progress,
              baselineY: zeroY,
              topY,
              barHeight,
              x: cx - anchorOffset,
              barWidth: bodyWidth,
              color,
              roundEdge: 'top',
              isProjected,
            });
          } else {
            const bottomY = yScale.valueToBitmapY(value);
            const barHeight = Math.max(1, bottomY - zeroY);
            this.drawAnimatedBar({
              context,
              time,
              progress,
              baselineY: zeroY,
              topY: zeroY,
              barHeight,
              x: cx - anchorOffset,
              barWidth: bodyWidth,
              color,
              roundEdge: 'bottom',
              isProjected,
            });
          }
        }
      }
    }

    if (hasNegative) {
      context.strokeStyle = ctx.theme.grid.color;
      context.lineWidth = 1;
      const y = Math.round(zeroY) + 0.5;
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(scope.bitmapSize.width, y);
      context.stroke();
    }
  }

  /**
   * Category axis, stacking off: each band splits into one slot per layer, in
   * layer order. A slot's width follows its layer's alpha, so a legend toggle
   * reflows the group instead of leaving a hole.
   */
  #renderGrouped(ctx: SeriesRenderContext, args: { zeroY: number; bandWidth: number }): void {
    const { scope, timeScale, yScale } = ctx;
    const { zeroY, bandWidth } = args;
    const baseline = yScale.baselineValue();

    const weights = this.stores.map((_, li) => this.getLayerAlpha(li));
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    if (totalWeight <= 0) return;

    const halfBand = Math.floor(bandWidth / 2);
    const inset = GROUP_INSET * scope.horizontalPixelRatio;
    let weightBefore = 0;
    for (let li = 0; li < this.stores.length; li++) {
      const alpha = weights[li];
      const slotFrom = (weightBefore / totalWeight) * bandWidth;
      weightBefore += alpha;
      const slotTo = (weightBefore / totalWeight) * bandWidth;
      if (alpha <= 0) continue;

      for (const d of this.#drawnPoints({ layerIndex: li, timeScale })) {
        if (!yScale.isPlottable(d.value)) continue;

        const bandLeft = timeScale.timeToBitmapX(d.time) - halfBand;
        const left = Math.round(bandLeft + slotFrom);
        const right = Math.round(bandLeft + slotTo);
        // A slot too thin for the gap keeps its full width rather than vanish.
        const gap = right - left > inset * 4 ? inset : 0;

        // As in the overlap mode, a fading layer's bar shrinks toward the baseline.
        const settled = this.effectiveValue(ctx, li, d.time, d.value);
        const scaled = alpha === 1 ? settled : yScale.lerpValue(baseline, settled, alpha);
        const value = this.introValue({ layerIndex: li, time: d.time, value: scaled });

        const drawn = this.#drawFromZero({
          ctx,
          layerIndex: li,
          time: d.time,
          value,
          zeroY,
          x: left + gap,
          barWidth: Math.max(1, right - left - 2 * gap),
          color: this.resolveLayerColor(li, d.value),
        });
        this.#queueLabel({ drawn, value: settled, below: value < 0 });
      }
    }
  }

  /** Paint one bar from the zero line to `value`; the free end is the one away from zero. */
  #drawFromZero(args: {
    ctx: SeriesRenderContext;
    layerIndex: number;
    time: number;
    value: number;
    zeroY: number;
    x: number;
    barWidth: number;
    color: string;
  }): DrawnBar | null {
    const { ctx, time, value, zeroY } = args;

    const endY = ctx.yScale.valueToBitmapY(value);
    const positive = value >= 0;
    const barHeight = Math.max(1, positive ? zeroY - endY : endY - zeroY);

    return this.drawAnimatedBar({
      context: ctx.scope.context,
      time,
      progress: this.entranceProgress(args.layerIndex, time),
      baselineY: zeroY,
      topY: positive ? endY : zeroY,
      barHeight,
      x: args.x,
      barWidth: args.barWidth,
      color: args.color,
      roundEdge: positive ? 'top' : 'bottom',
      isProjected: this.isProjectedTime(time),
    });
  }

  /** Queue a value label at the free end of a painted bar; a no-op while labels are off. */
  #queueLabel(args: { drawn: DrawnBar | null; value: number; below: boolean }): void {
    const labels = this.#labels;
    const { drawn, below } = args;
    if (labels === null || drawn === null) return;

    labels.push({
      value: args.value,
      x: drawn.x + drawn.barWidth / 2,
      y: below ? drawn.topY + drawn.barHeight : drawn.topY,
      below,
      maxWidth: drawn.barWidth,
      alpha: drawn.alpha,
    });
  }

  /** Label text: the option's format, else the Y scale's (which honors `<YAxis format>`). */
  #labelFormat(yScale: YScale): (value: number) => string {
    const option = this.options.valueLabels;
    const custom = typeof option === 'object' ? option.format : undefined;
    if (custom !== undefined) return custom;

    return (value) => yScale.formatY(value);
  }

  /** Drawn after every bar, so a neighbour's body never covers a label. */
  #drawValueLabels(ctx: SeriesRenderContext, labels: readonly ValueLabel[]): void {
    if (labels.length === 0) return;

    const { scope, theme } = ctx;
    const { context } = scope;
    const format = this.#labelFormat(ctx.yScale);
    const fontSize = resolveAxisFontSize(theme) * scope.verticalPixelRatio;
    const gap = LABEL_GAP * scope.verticalPixelRatio;

    context.save();
    const baseAlpha = context.globalAlpha;
    context.font = `${fontSize}px ${theme.typography.fontFamily}`;
    context.fillStyle = theme.bar?.labelColor ?? theme.tooltip.textColor;
    context.textAlign = 'center';

    for (const label of labels) {
      if (label.alpha <= 0) continue;

      const text = format(label.value);
      const fits = context.measureText(text).width <= label.maxWidth;
      if (!fits) continue;

      context.globalAlpha = baseAlpha * label.alpha;
      context.textBaseline = label.below ? 'top' : 'bottom';
      const y = label.below ? label.y + gap : label.y - gap;
      context.fillText(text, label.x, y);
    }

    context.restore();
  }

  /** Stacked (normal or percent) rendering */
  private renderStacked(ctx: SeriesRenderContext, percent: boolean): void {
    const { scope, timeScale, yScale } = ctx;
    const { context } = scope;

    const bodyWidth = this.#bodyWidth(ctx);
    const halfBody = Math.floor(bodyWidth / 2);
    // anchor='right' draws the body so its right edge sits on the time tick,
    // letting the rightmost bar fit on canvas with padding.right = 0.
    const anchorOffset = this.options.anchor === 'right' ? bodyWidth : halfBody;

    // Collect data per layer, gating on alpha (not the binary store flag) so
    // a layer mid-fade still contributes shrinking geometry to the stack
    // instead of disappearing the moment `setLayerVisible(false)` flips the
    // store. Alpha=0 layers are pre-filtered to keep the timeMap clean.
    const layers = this.stores.map((_, li) =>
      this.getLayerAlpha(li) > 0 ? this.#drawnPoints({ layerIndex: li, timeScale }) : [],
    );
    if (layers.every((l) => l.length === 0)) return;

    // Per-layer value × alpha. The cumulative built from these values shrinks
    // toward "without this layer" as the layer fades; the Y axis is easing to
    // the same final bounds over `toggleMs`, so geometry and axis converge on
    // the same frame instead of the binary `isVisible()` jump that produced
    // the visible "stack collapses instantly" artifact in stacked modes.
    // Entrance growth is baked into the stacked values themselves: scaling each
    // layer's contribution by its entrance progress makes every segment's base
    // ride on the *animated* top of the layers below it, so the column rises
    // from the zero line as one attached stack. Growing each segment from its
    // settled base instead leaves it floating mid-air while the layers under it
    // are still rising.
    const style = this.options.entryAnimation ?? 'fade-grow';
    const growEntrance = style === 'grow' || style === 'fade-grow';

    // Scaling a value doesn't move its edge evenly on a non-linear axis: there
    // the weights go through `ScaleStack`, and the intro moves the drawn edges.
    const scaleStacked = yScale.getTransform() !== null && !percent;
    const shares = new Map<number, ColumnShares>();
    // Signed column totals the value labels show — settled values, so a label doesn't count up with the entrance.
    const totals = new Map<number, { positive: number; negative: number }>();

    const timeMap = new Map<number, number[]>();
    for (let li = 0; li < layers.length; li++) {
      const alpha = this.getLayerAlpha(li);
      for (const d of layers[li]) {
        let arr = timeMap.get(d.time);
        if (!arr) {
          arr = new Array(layers.length).fill(0);
          timeMap.set(d.time, arr);
        }
        // Non-finite (or ≤ 0 on a log scale) → 0 in the stack so one gap
        // doesn't NaN-out the column.
        const raw = yScale.isPlottable(d.value) ? d.value : 0;
        const settled = this.effectiveValue(ctx, li, d.time, raw);
        let value = settled * alpha;
        let weight = alpha;

        let total = totals.get(d.time);
        if (!total) {
          total = { positive: 0, negative: 0 };
          totals.set(d.time, total);
        }
        if (value > 0) total.positive += value;
        else total.negative += value;

        if (growEntrance && !this.isProjectedTime(d.time)) {
          const entrance = this.entranceProgress(li, d.time);
          value *= entrance;
          weight *= entrance;
        }

        if (scaleStacked) {
          arr[li] = value;
          let share = shares.get(d.time);
          if (!share) {
            share = { settled: new Array(layers.length).fill(0), weights: new Array(layers.length).fill(0) };
            shares.set(d.time, share);
          }
          share.settled[li] = settled;
          share.weights[li] = weight;
          continue;
        }

        // The intro's value directive bakes growth into the stacked values
        // the same way — the whole column rises (or overshoots) as one
        // attached unit.
        arr[li] = this.introValue({ layerIndex: li, time: d.time, value });
      }
    }

    const edges = new Map<number, SegmentEdges>();
    if (!percent) {
      for (const [time, values] of timeMap) {
        const share = shares.get(time);
        edges.set(time, share === undefined ? sumEdges(values) : this.scaleEdges({ time, share, yScale }));
      }
    }

    // Per-column free-end layer: only the topmost positive segment rounds its
    // top, and only the bottommost negative segment rounds its bottom; interior
    // segments stay square where the next slice sits on them.
    const topPositiveLi = new Map<number, number>();
    const bottomNegativeLi = new Map<number, number>();
    for (const [time, values] of timeMap) {
      let topPos = -1;
      let botNeg = -1;
      for (let li = 0; li < values.length; li++) {
        if (values[li] > 0) topPos = li;
        if (values[li] < 0) botNeg = li;
      }
      if (topPos >= 0) topPositiveLi.set(time, topPos);
      if (botNeg >= 0) bottomNegativeLi.set(time, botNeg);
    }

    // Draw layer by layer, bottom to top. A fading layer shrinks via
    // alpha-weighted cumulative (its slice height goes to zero as alpha → 0) —
    // bars don't take an additional opacity fade because the geometry
    // collapse already reads cleanly as the layer leaving the stack.
    for (let li = 0; li < layers.length; li++) {
      // A stacked layer is one category — resolve a value-fn once at the layer's
      // last value rather than per segment.
      const color = this.resolveLayerColor(li, this.lastFinitePoint(li)?.value ?? 0);

      for (const [time, values] of timeMap) {
        const raw = values[li];
        if (raw === 0) continue;

        const cx = timeScale.timeToBitmapX(time);
        const progress = this.entranceProgress(li, time);
        const isProjected = this.isProjectedTime(time);
        const roundEdge: RoundEdge =
          raw > 0
            ? topPositiveLi.get(time) === li
              ? 'top'
              : 'none'
            : bottomNegativeLi.get(time) === li
              ? 'bottom'
              : 'none';

        if (percent) {
          // Sum of previous layers for stacking offset
          let basePositive = 0;
          let baseNegative = 0;
          for (let prev = 0; prev < li; prev++) {
            const v = values[prev];
            if (v > 0) basePositive += v;
            else baseNegative += v;
          }

          // Each segment's share of the column's absolute sum: the column spans 100% across zero.
          let total = 0;
          for (const v of values) {
            total += Math.abs(v);
          }

          if (raw > 0 && total > 0) {
            const pctBase = (basePositive / total) * 100;
            const pctTop = ((basePositive + raw) / total) * 100;
            const topY = yScale.valueToBitmapY(pctTop);
            const bottomY = yScale.valueToBitmapY(pctBase);
            const h = Math.max(1, bottomY - topY);
            this.drawAnimatedBar({
              context,
              time,
              progress,
              baselineY: bottomY,
              topY,
              barHeight: h,
              x: cx - anchorOffset,
              barWidth: bodyWidth,
              color,
              roundEdge,
              isProjected,
              growBaked: true,
            });
          } else if (raw < 0 && total > 0) {
            const pctBase = (baseNegative / total) * 100;
            const pctTop = ((baseNegative + raw) / total) * 100;
            const topY = yScale.valueToBitmapY(pctBase);
            const bottomY = yScale.valueToBitmapY(pctTop);
            const h = Math.max(1, bottomY - topY);
            this.drawAnimatedBar({
              context,
              time,
              progress,
              baselineY: topY,
              topY,
              barHeight: h,
              x: cx - anchorOffset,
              barWidth: bodyWidth,
              color,
              roundEdge,
              isProjected,
              growBaked: true,
            });
          }
        } else {
          const column = edges.get(time);
          if (column === undefined) continue;

          const base = column.base[li];
          const end = column.end[li];
          let drawn: DrawnBar | null;
          if (raw > 0) {
            const topY = yScale.valueToBitmapY(end);
            const bottomY = yScale.valueToBitmapY(base);
            const h = Math.max(1, bottomY - topY);
            drawn = this.drawAnimatedBar({
              context,
              time,
              progress,
              baselineY: bottomY,
              topY,
              barHeight: h,
              x: cx - anchorOffset,
              barWidth: bodyWidth,
              color,
              roundEdge,
              isProjected,
              growBaked: true,
            });
          } else {
            const topY = yScale.valueToBitmapY(base);
            const bottomY = yScale.valueToBitmapY(end);
            const h = Math.max(1, bottomY - topY);
            drawn = this.drawAnimatedBar({
              context,
              time,
              progress,
              baselineY: topY,
              topY,
              barHeight: h,
              x: cx - anchorOffset,
              barWidth: bodyWidth,
              color,
              roundEdge,
              isProjected,
              growBaked: true,
            });
          }

          // The outer segment of each signed stack — the one that rounds — carries the stack's label.
          const total = totals.get(time);
          if (roundEdge !== 'none' && total !== undefined) {
            const below = roundEdge === 'bottom';
            this.#queueLabel({ drawn, value: below ? total.negative : total.positive, below });
          }
        }
      }
    }
  }

  /**
   * Segment edges of one column on a non-linear axis. Fades and entrances
   * stack through {@link ScaleStack}; the intro then moves each drawn edge,
   * so the column grows from the floor as one unit at an even pixel speed.
   */
  private scaleEdges(args: { time: number; share: ColumnShares; yScale: YScale }): SegmentEdges {
    const { time, share, yScale } = args;

    const stacks = { positive: new ScaleStack(yScale), negative: new ScaleStack(yScale) };
    // The intro leaves the bottom edge alone, as on a linear axis.
    const drawn = { positive: stacks.positive.edge, negative: stacks.negative.edge };

    const base: number[] = [];
    const end: number[] = [];
    for (let li = 0; li < share.settled.length; li++) {
      const value = share.settled[li];
      const side = value < 0 ? 'negative' : 'positive';

      const top = stacks[side].push(value, share.weights[li]);
      const moved = this.introValue({ layerIndex: li, time, value: top });

      base.push(drawn[side]);
      end.push(moved);
      drawn[side] = moved;
    }

    return { base, end };
  }

  /**
   * Paint one bar through the resolved painter, applying any entrance transform
   * and per-bar alpha first. The painter owns the fill (and the rounded-corner
   * geometry); a projected bar is forced settled so its only alpha source is the
   * painter's translucent fill rather than a `globalAlpha` fade.
   */
  private drawAnimatedBar(bar: AnimatedBar): DrawnBar | null {
    const pass = this.#pass;
    if (pass === null) return null;

    const { context, baselineY, topY, barHeight, x, barWidth, color, roundEdge } = bar;
    const progress = bar.isProjected ? 1 : bar.progress;

    const style = this.options.entryAnimation ?? 'fade-grow';
    let t =
      progress >= 1 || style === 'none'
        ? { x, topY, barWidth, barHeight, alpha: 1 }
        : this.applyBarTransform(bar, progress);

    // A category entering beside sliding bands waits for its room; its value label follows `alpha`.
    const presence = pass.bandPresence(bar.time);
    if (presence < 1) t = { ...t, alpha: t.alpha * presence };

    // Element directives (translation / opacity) — growth arrives via the
    // value directive upstream, so geometry here only shifts and fades. A
    // bar inside an in-flight history reveal is owned by the reveal's
    // element callback; the initial-load intro keeps the rest.
    if (!bar.isProjected) {
      const historyElement = this.#historyDirectives?.element;
      const historyWave = historyElement !== undefined ? this.#historyWaveAt(bar.time) : null;
      const element = historyWave !== null ? historyElement : this.#introDirectives?.element;
      const wave = historyWave ?? (element !== undefined ? this.#introWaveAt(bar.time) : null);

      if (element !== undefined && wave !== null) {
        const directive = element({
          ...wave,
          time: bar.time,
          x: t.x,
          topY: t.topY,
          barHeight: t.barHeight,
          baselineY,
          barWidth: t.barWidth,
        });
        t = {
          ...t,
          x: t.x + (directive.offsetX ?? 0),
          topY: t.topY + (directive.offsetY ?? 0),
          alpha: t.alpha * (directive.alpha ?? 1),
        };
      }
    }

    const args: BarPaintArgs = {
      geom: { x: t.x, y: t.topY, width: t.barWidth, height: t.barHeight, baselineY },
      color,
      corners: CORNER_MASKS[roundEdge],
      // Clamp to this bar's geometry so `radius` honors its pre-clamped contract
      // for custom painters; `fillRoundedRect` re-clamps to the same bound, so
      // the built-in output is unchanged.
      radius: Math.min(pass.radius, t.barWidth / 2, t.barHeight / 2),
      progress,
      isProjected: bar.isProjected,
    };

    if (t.alpha < 1) {
      context.save();
      context.globalAlpha = t.alpha;
      pass.painter(pass.env, args);
      context.restore();

      return t;
    }

    pass.painter(pass.env, args);

    return t;
  }
}

/** Series definition for `chart.addSeries` — keeps the chart renderer-agnostic
 *  so hosts that never render bars don't bundle this module. */
export const BarSeriesDef: SeriesDefinition<BarSeriesOptions> = {
  type: 'bar',
  xTypes: ['time', 'numeric', 'category'],
  create: ({ theme, layerCount }, options) => {
    // Single-layer bars default to the theme's sign value-fn (green-up /
    // red-down); multi-layer bars to the palette.
    const colors: ValueColor[] =
      layerCount === 1
        ? [theme.bar?.color ?? theme.seriesColors[0] ?? '#26a69a']
        : theme.seriesColors.slice(0, layerCount);

    return new BarRenderer(layerCount, { colors, ...options });
  },
};

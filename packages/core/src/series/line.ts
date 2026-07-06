import {
  DEFAULT_HISTORY_REVEAL,
  DEFAULT_LINE_ENTRY,
  DEFAULT_LINE_INTRO,
  DEFAULT_LINE_PULSE,
  DEFAULT_LINE_SMOOTH,
} from '../animation/config';
import { easeOutCubic } from '../animation/easing';
import { decimateLineData } from '../data/decimation';
import type { ChartTheme } from '../theme/types';
import type { LineSeriesOptions, TimePoint, ValueColor } from '../types';
import { hexToRgba } from '../utils/color';
import { lerp } from '../utils/math';
import { BaseMultiLayerSeries } from './base-multi-layer';
import type { SeriesDefinition } from './definition';
import {
  type LineIntroDirectives,
  type LineIntroFn,
  type LineIntroFrame,
  backfillSweepIntro,
  unfoldIntro,
} from './line-intro';
import type { CurveKind, PathSegment } from './painters/canvas-path';
import { buildCurveSegments } from './painters/canvas-path';
import { resolveLinePainter } from './painters/resolve';
import type { LinePoint, PaintEnv } from './painters/types';
import type { OverlayRenderContext, SeriesRenderContext } from './types';

/** Internal resolved shape: `entryMs` / `smoothMs` / `pulseMs` are concrete
 *  numbers (`false` from the public surface gets normalized to `0` at the
 *  merge boundary, so downstream reads never see the disable sentinel). `colors`
 *  is renderer-internal (one resolver per layer, sourced from the theme palette
 *  and per-layer `data` overrides) — it is no longer a public option. */
type ResolvedLineOptions = Omit<
  LineSeriesOptions,
  'entryMs' | 'smoothMs' | 'pulseMs' | 'introMs' | 'historyRevealMs'
> & {
  colors: ValueColor[];
  entryMs: number;
  smoothMs: number;
  pulseMs: number;
  introMs: number;
  historyRevealMs: number;
};

/** Caller-facing option input — the public surface plus the internal `colors`. */
type LineOptionsInput = Partial<LineSeriesOptions> & { colors?: ValueColor[] };

const DEFAULT_OPTIONS: ResolvedLineOptions = {
  colors: ['#2962FF'],
  strokeWidth: 1,
  area: { visible: true },
  pulse: true,
  stacking: 'off',
  curve: 'straight',
  entryMs: DEFAULT_LINE_ENTRY,
  smoothMs: DEFAULT_LINE_SMOOTH,
  pulseMs: DEFAULT_LINE_PULSE,
  introMs: DEFAULT_LINE_INTRO,
  historyRevealMs: DEFAULT_HISTORY_REVEAL,
};

/**
 * Normalize caller-supplied line options. Folds the legacy flat `areaFill`
 * boolean (still used by `<Sparkline>` and React's `<LineSeries>` for
 * back-compat) into the structured `area` shape so the rest of the renderer
 * only reads the canonical field, and converts the `false` disable sentinel
 * on duration fields into `0`.
 */
function normalize(input: LineSeriesOptions & { colors: ValueColor[] }): ResolvedLineOptions {
  const legacyAreaFill = (input as { areaFill?: boolean }).areaFill;
  const area = legacyAreaFill !== undefined && input.area === undefined ? { visible: !!legacyAreaFill } : input.area;

  return {
    ...input,
    area,
    entryMs: input.entryMs === false ? 0 : (input.entryMs ?? DEFAULT_LINE_ENTRY),
    smoothMs: input.smoothMs === false ? 0 : (input.smoothMs ?? DEFAULT_LINE_SMOOTH),
    pulseMs: input.pulseMs === false ? 0 : (input.pulseMs ?? DEFAULT_LINE_PULSE),
    introMs: input.introMs === false ? 0 : (input.introMs ?? DEFAULT_LINE_INTRO),
    historyRevealMs: input.historyRevealMs === false ? 0 : (input.historyRevealMs ?? DEFAULT_HISTORY_REVEAL),
  };
}

/** Convert the stacked renderer's `[x, y]` tuples to {@link LinePoint}s. */
function toPoints(xy: readonly [number, number][]): LinePoint[] {
  return xy.map(([x, y]) => ({ x, y }));
}

/** Fraction of the intro window the head glow fades in/out over; the settled
 *  pulse dot cross-fades in over the same tail window so the handoff is
 *  seamless. */
const INTRO_HEAD_FADE = 0.15;

/** Fallback history reveal — the line back-fills itself from the data
 *  boundary behind a moving clip front. Stateless, safe to share. */
const DEFAULT_HISTORY_REVEAL_FN = backfillSweepIntro();

/**
 * Linearly interpolated series value at `time` between its bracketing
 * samples (binary search — `data` is time-sorted). Values are read through
 * `resolve`, so callers can substitute renderer-smoothed values while the
 * raw sample still gates finiteness. `null` when the bracket contains a
 * non-finite gap; edges clamp to the boundary sample.
 */
function valueAtTime(data: readonly TimePoint[], time: number, resolve: (point: TimePoint) => number): number | null {
  if (data.length === 0) return null;
  if (time <= data[0].time) return Number.isFinite(data[0].value) ? resolve(data[0]) : null;

  const last = data[data.length - 1];
  if (time >= last.time) return Number.isFinite(last.value) ? resolve(last) : null;

  let lo = 0;
  let hi = data.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (data[mid].time <= time) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  const a = data[lo];
  const b = data[hi];
  if (!Number.isFinite(a.value) || !Number.isFinite(b.value)) return null;

  const span = b.time - a.time;
  if (span <= 0) return resolve(a);

  return lerp(resolve(a), resolve(b), (time - a.time) / span);
}

/** Emit a pre-built segment list onto `ctx` left-to-right. The caller has
 *  already issued `moveTo(points[0])`. */
function replaySegmentsForward(ctx: CanvasRenderingContext2D, segments: readonly PathSegment[]): void {
  for (const seg of segments) {
    if (seg.kind === 'line') {
      ctx.lineTo(seg.x, seg.y);
    } else {
      ctx.bezierCurveTo(seg.cp1x, seg.cp1y, seg.cp2x, seg.cp2y, seg.x, seg.y);
    }
  }
}

/** Emit a segment list right-to-left; the caller is already at the last
 *  segment's endpoint. Each reversed step ends at the *start* of its segment —
 *  the previous segment's endpoint, or `points[0]` for the first segment — so
 *  this is correct for any segment count (`stepped` emits two segments per
 *  point, so it must NOT be indexed by point). A reversed cubic swaps its two
 *  control points, tracing the identical geometric curve the forward replay
 *  would — that is what lets an interior stacked boundary tile pixel-exactly
 *  with the slice below. Ends at `points[0]`. */
function replaySegmentsReversed(
  ctx: CanvasRenderingContext2D,
  points: readonly LinePoint[],
  segments: readonly PathSegment[],
): void {
  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i];
    const start = i > 0 ? segments[i - 1] : points[0];
    if (seg.kind === 'line') {
      ctx.lineTo(start.x, start.y);
    } else {
      ctx.bezierCurveTo(seg.cp2x, seg.cp2y, seg.cp1x, seg.cp1y, start.x, start.y);
    }
  }
}

export class LineRenderer extends BaseMultiLayerSeries<TimePoint> {
  readonly kind = 'line' as const;
  protected declare options: ResolvedLineOptions;
  private areaGradientCache = new Map<string, { gradient: CanvasGradient; bottomY: number; color: string }>();

  constructor(layerCount: number, options?: LineOptionsInput) {
    super(layerCount);
    this.options = normalize({ ...DEFAULT_OPTIONS, ...options });
  }

  updateOptions(options: LineOptionsInput): void {
    this.options = normalize({ ...this.options, ...options });
  }

  getStacking(): string {
    return this.options.stacking;
  }

  applyTheme(theme: ChartTheme, prev: ChartTheme): void {
    // Reset the theme base only; per-layer `data` color overrides are held
    // separately (setColorOverrides) and ride through a theme swap untouched, so
    // there is no user color to preserve here.
    const colors = this.stores.length === 1 ? [theme.line.color] : theme.seriesColors.slice(0, this.stores.length);
    this.updateOptions({ colors });

    // Stroke width follows theme unless the user pinned it with an explicit option.
    if (this.options.strokeWidth === prev.line.width) {
      this.updateOptions({ strokeWidth: theme.line.width });
    }
  }

  protected isEntryEnabled(): boolean {
    return (this.options.entryAnimation ?? 'grow') !== 'none';
  }

  get hasPulse(): boolean {
    return this.options.pulse && this.options.pulseMs > 0 && this.stores.some((s) => s.isVisible() && s.length > 0);
  }

  get overlayNeedsAnimation(): boolean {
    // `hasPulse` already factors in `pulseMs > 0`, so a disabled pulse
    // halts the overlay RAF loop immediately — no 60 Hz tick for nothing.
    return this.hasPulse;
  }

  hasOverlayContentInRange(from: number, _to: number): boolean {
    // Only gate on the left bound. A zoom-in can briefly narrow `to` past
    // `last.time`; if we stopped the overlay loop there, the pulse would
    // vanish for a frame and flicker back once auto-scroll caught up. The
    // pulse is canvas-clipped (chart.ts restricts the overlay layer to the
    // chart rect), so drawing at an off-canvas X is harmless.
    for (let li = 0; li < this.stores.length; li++) {
      if (this.getLayerAlpha(li) <= 0) continue;

      const last = this.stores[li].last();
      if (last && last.time >= from) return true;
    }

    return false;
  }

  render(ctx: SeriesRenderContext): void {
    this.tickAnimations(performance.now());

    const { context } = ctx.scope;

    // History-prepend reveal — independent of the initial-load intro. The
    // fn gets a localized frame (`range` = the prepended span, `width` = its
    // bitmap width); its clip is interpreted in reveal space anchored at the
    // data boundary.
    this.historyDirectives = null;
    const historyRange = this.historyRange;
    if (this.historyWave.active && historyRange !== null) {
      const reveal = this.options.historyReveal ?? DEFAULT_HISTORY_REVEAL_FN;
      if (reveal !== 'none') {
        this.historyDirectives = reveal(this.buildHistoryFrame(ctx, historyRange));
      }
    }
    const history = this.historyDirectives;

    // History ghost pre-pass (trace-style backfill) under everything —
    // shows through only where the history clip hides the main pass.
    const historyGhost = history?.ghostAlpha ?? 0;
    if (historyGhost > 0) {
      context.save();
      context.globalAlpha *= historyGhost;
      this.introGhostPass = true;
      this.renderBody(ctx);
      this.introGhostPass = false;
      context.restore();
    }

    const historyClipApplied = this.applyHistoryClip(ctx, history, historyRange);

    if (!this.introWave.active) {
      this.introDirectives = null;
      this.renderBody(ctx);
    } else {
      this.renderWithIntro(ctx);
    }

    if (historyClipApplied) context.restore();

    if (history?.heads !== undefined && history.heads.length > 0) {
      this.drawIntroHeads(ctx, history.heads, this.historyWave.linear());
    }
  }

  /**
   * Initial-load intro pass: the resolved LineIntroFn describes this frame
   * declaratively (clip window / ghost pass / heads / value transform); the
   * renderer executes the directives around the untouched body pass.
   */
  private renderWithIntro(ctx: SeriesRenderContext): void {
    const directives = this.resolveIntro()(this.buildIntroFrame(ctx));
    this.introDirectives = directives;

    const { context } = ctx.scope;
    const { width, height } = ctx.scope.bitmapSize;

    // Ghost pre-pass: a faint stroke-only skeleton under the main pass, so
    // the chart never reads as empty while a clip reveal runs. Area fill is
    // left to the main pass — a translucent full-width fill would pre-spoil
    // it.
    const ghostAlpha = directives.ghostAlpha ?? 0;
    if (ghostAlpha > 0) {
      context.save();
      context.globalAlpha *= ghostAlpha;
      this.introGhostPass = true;
      this.renderBody(ctx);
      this.introGhostPass = false;
      context.restore();
    }

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

    this.renderBody(ctx);

    if (hasClip) context.restore();

    if (directives.heads !== undefined && directives.heads.length > 0) {
      this.drawIntroHeads(ctx, directives.heads, this.introWave.linear());
    }
  }

  /**
   * Apply the history reveal's clip directive, mapped from reveal space
   * (`x = 0` at the data boundary, increasing into the prepended history)
   * to bitmap space. Everything at or after the boundary always draws; a
   * small pad keeps the stroke cap at the reveal front from being shaved.
   */
  private applyHistoryClip(
    ctx: SeriesRenderContext,
    directives: LineIntroDirectives | null,
    range: { from: number; to: number } | null,
  ): boolean {
    const clip = directives?.clip;
    if (clip === undefined || range === null) return false;
    if (clip.fromX === undefined && clip.toX === undefined) return false;

    const { context } = ctx.scope;
    const { width, height } = ctx.scope.bitmapSize;
    const boundaryX = ctx.timeScale.timeToBitmapX(range.to);
    const spanWidth = Math.abs(boundaryX - ctx.timeScale.timeToBitmapX(range.from));
    const pad = Math.max(2, (this.options.strokeWidth ?? 1) * ctx.scope.horizontalPixelRatio);
    const fromLocal = clip.fromX ?? 0;
    const toLocal = clip.toX ?? spanWidth;

    context.save();
    context.beginPath();
    context.rect(boundaryX - toLocal - pad, 0, Math.max(0, toLocal - fromLocal + pad), height);
    context.rect(boundaryX, 0, Math.max(0, width - boundaryX), height);
    context.clip();

    return true;
  }

  private renderBody(ctx: SeriesRenderContext): void {
    if (this.options.stacking === 'off') {
      this.renderOff(ctx);
    } else {
      this.renderStacked(ctx, this.options.stacking === 'percent');
    }
  }

  /** True while a ghost pre-pass is drawing — skips the area fill so the
   *  translucent pass shows only the stroke skeleton. */
  private introGhostPass = false;

  /**
   * Directives produced for the current intro frame. Kept between passes so
   * the overlay (pulse dot) applies the same value transform the main pass
   * drew with; `null` once the wave settles.
   */
  private introDirectives: LineIntroDirectives | null = null;

  /** Per-frame history-reveal directives; `null` when no reveal is in flight. */
  private historyDirectives: LineIntroDirectives | null = null;

  /** Default intro, built lazily — one instance per renderer. */
  private defaultIntro: LineIntroFn | null = null;

  private resolveIntro(): LineIntroFn {
    const custom = this.options.introAnimation;
    if (custom !== undefined) return custom;

    if (this.defaultIntro === null) this.defaultIntro = unfoldIntro();

    return this.defaultIntro;
  }

  /**
   * Frame context handed to the intro fn — progress plus memoized data
   * accessors, so a directive-producing fn stays pure and cheap.
   */
  private buildIntroFrame(ctx: SeriesRenderContext): LineIntroFrame {
    return this.buildFrame(ctx, {
      progress: this.introWave.linear(),
      range: ctx.timeScale.getRange(),
      // Plot-area extent, not the canvas bitmap — the canvas also carries the
      // axis strips, so `bitmapSize` would make `width / 2` land right of the
      // data center and any width-based x→time mapping sample the wrong time.
      width: ctx.timeScale.getMediaWidth() * ctx.scope.horizontalPixelRatio,
    });
  }

  /**
   * Localized frame for the history reveal fn: `range` is the prepended
   * span (boundary at `range.to`), `width` its bitmap width, and the data
   * accessors are scoped to that span — `layerMean` anchors an unfold to
   * the new history, not the whole window.
   */
  private buildHistoryFrame(ctx: SeriesRenderContext, historyRange: { from: number; to: number }): LineIntroFrame {
    return this.buildFrame(ctx, {
      progress: this.historyWave.linear(),
      range: historyRange,
      width: Math.abs(ctx.timeScale.timeToBitmapX(historyRange.to) - ctx.timeScale.timeToBitmapX(historyRange.from)),
    });
  }

  private buildFrame(
    ctx: SeriesRenderContext,
    opts: { progress: number; range: { from: number; to: number }; width: number },
  ): LineIntroFrame {
    const { timeScale, yScale, scope } = ctx;
    const { progress, range, width } = opts;

    const dataCache: Array<readonly TimePoint[] | undefined> = new Array(this.stores.length);
    const meanCache: Array<number | null | undefined> = new Array(this.stores.length);
    let pathCache: Array<{ x: number; y: number; time: number }> | null | undefined;

    const layerData = (layerIndex: number): readonly TimePoint[] => {
      let data = dataCache[layerIndex];
      if (data === undefined) {
        data = this.stores[layerIndex]?.getVisibleData(range.from, range.to) ?? [];
        dataCache[layerIndex] = data;
      }

      return data;
    };

    return {
      progress,
      range,
      width,
      height: yScale.getMediaHeight() * scope.verticalPixelRatio,
      stacking: this.options.stacking,
      timeToX: (time) => timeScale.timeToBitmapX(time),
      xToTime: (x) => timeScale.xToTime(x / scope.horizontalPixelRatio),
      valueToY: (value) => yScale.valueToBitmapY(value),
      layerCount: this.stores.length,
      layerData,
      layerMean: (layerIndex) => {
        let mean = meanCache[layerIndex];
        if (mean === undefined) {
          let sum = 0;
          let count = 0;
          for (const d of layerData(layerIndex)) {
            if (Number.isFinite(d.value)) {
              sum += d.value;
              count++;
            }
          }
          mean = count > 0 ? sum / count : null;
          meanCache[layerIndex] = mean;
        }

        return mean;
      },
      primaryPath: () => {
        if (pathCache === undefined) {
          pathCache = null;
          for (let li = 0; li < this.stores.length; li++) {
            if (this.getLayerAlpha(li) <= 0 || !this.stores[li].isVisible()) continue;

            const finite = layerData(li).filter((d) => Number.isFinite(d.value));
            if (finite.length < 2) continue;

            pathCache = finite.map((d) => ({
              x: timeScale.timeToBitmapX(d.time),
              y: yScale.valueToBitmapY(d.value),
              time: d.time,
            }));
            break;
          }
        }

        return pathCache;
      },
    };
  }

  /**
   * A custom/built-in intro's value transform rides this hook: every
   * rendered value (stroke, area, stacked cumulative, trailing endpoint,
   * overlay pulse) already flows through `effectiveValue`, so one override
   * animates the whole geometry.
   */
  protected effectiveValue(
    ctx: SeriesRenderContext | OverlayRenderContext,
    layerIndex: number,
    time: number,
    rawValue: number,
  ): number {
    const value = super.effectiveValue(ctx, layerIndex, time, rawValue);

    // History reveal owns the prepended points — position anchored at the
    // data boundary (`0` there, `1` at the deepest new point).
    const historyTransform = this.historyWave.active ? this.historyDirectives?.value : undefined;
    const historyRange = this.historyRange;
    if (historyTransform !== undefined && historyRange !== null && time < historyRange.to) {
      const span = historyRange.to - historyRange.from;
      const position = span > 0 ? Math.min(1, Math.max(0, (historyRange.to - time) / span)) : 0;

      return historyTransform({ layerIndex, time, value, position });
    }

    const transform = this.introWave.active ? this.introDirectives?.value : undefined;
    if (transform === undefined) return value;

    const range = ctx.timeScale.getRange();
    const span = range.to - range.from;
    const position = span > 0 ? Math.min(1, Math.max(0, (time - range.from) / span)) : 0;

    return transform({ layerIndex, time, value, position });
  }

  /**
   * Extends the base last-value query with the 'grow' entrance's value-space
   * equivalent of {@link chainedTailPositions}'s eased position lerp — the Y
   * scale is affine, so lerping the *value* by the same eased progress and
   * mapping it through `yScale` afterward lands on the identical pixel the
   * renderer paints. Without this, a tooltip/YLabel query would report a
   * freshly-appended point's raw value the instant it lands, `entryMs`
   * before the marker visually arrives there.
   */
  protected snapshotValue(layerIndex: number, time: number, rawValue: number): number {
    const base = super.snapshotValue(layerIndex, time, rawValue);
    if ((this.options.entryAnimation ?? 'grow') !== 'grow') return base;

    return this.chainedTailValues(layerIndex)?.get(time) ?? base;
  }

  /** Value-space counterpart of {@link chainedTailPositions} — see {@link snapshotValue}. */
  private chainedTailValues(layerIndex: number): Map<number, number> | null {
    const chain = this.unsettledTail(layerIndex);
    if (chain.length === 0) return null;

    const all = this.stores[layerIndex].getAll();
    const anchorIdx = all.length - 1 - chain.length;
    if (anchorIdx < 0) return null;

    const anchor = all[anchorIdx];
    if (!Number.isFinite(anchor.value)) return null;

    let prevValue = this.liveValue(layerIndex, anchor.time, anchor.value);
    const values = new Map<number, number>();
    for (let k = 0; k < chain.length; k++) {
      const point = all[anchorIdx + 1 + k];
      if (!Number.isFinite(point.value)) return null;

      const eased = easeOutCubic(chain[k].progress);
      const targetValue = this.liveValue(layerIndex, point.time, point.value);
      const value = lerp(prevValue, targetValue, eased);
      values.set(point.time, value);
      prevValue = value;
    }

    return values;
  }

  /**
   * Glowing pulse dots riding the intro's head anchors — the line reads as
   * being plotted live, and hands off to the regular pulse dot the frame
   * the reveal lands. Off-mode only: recomputing the stacked cumulative at
   * an arbitrary head time isn't worth it for a one-second decoration.
   */
  private drawIntroHeads(
    ctx: SeriesRenderContext,
    heads: ReadonlyArray<{ x: number; time: number }>,
    linear: number,
  ): void {
    if (this.options.stacking !== 'off') return;

    // Bell alpha: in over the first ~15% of the intro window, out over the
    // last ~15% — the settled pulse dot cross-fades in over that same tail
    // window (see drawOverlay), so the handoff never pops.
    const fadeIn = Math.min(1, linear / INTRO_HEAD_FADE);
    const fadeOut = Math.min(1, (1 - linear) / INTRO_HEAD_FADE);
    const alpha = Math.max(0, Math.min(fadeIn, fadeOut));
    if (alpha <= 0) return;

    const { scope } = ctx;

    for (const head of heads) {
      for (let li = 0; li < this.stores.length; li++) {
        const layerAlpha = this.getLayerAlpha(li);
        if (layerAlpha <= 0 || !this.stores[li].isVisible()) continue;

        const anchor = this.introHeadAnchor(ctx, li, head);
        if (anchor === null) continue;

        // Two pulse cycles over the whole intro — the head breathes while
        // it travels, then the settled pulse dot takes over.
        this.drawPulse({
          ctx: scope.context,
          x: anchor.x,
          y: anchor.y,
          color: this.resolveLayerColor(li, anchor.value),
          pixelRatio: scope.horizontalPixelRatio,
          phase: linear * 2,
          alpha: alpha * layerAlpha,
        });
      }
    }
  }

  /**
   * Where a head dot sits for one layer: pinned to the polyline as it is
   * actually drawn this frame. Interior anchors interpolate through
   * {@link effectiveValue}, so live smoothing and the intro's own value
   * transform are honored while data streams during the reveal. Past the
   * last point the head parks on the trailing endpoint — the exact spot the
   * settled pulse dot takes over — and before the first point it parks on
   * the line's start. Without the clamps the head slides into the
   * right-padding region beyond the line's end (the sweep front travels the
   * visible range, not the data span) and jumps back on settle.
   */
  private introHeadAnchor(
    ctx: SeriesRenderContext,
    layerIndex: number,
    head: { x: number; time: number },
  ): { x: number; y: number; value: number } | null {
    const { timeScale, yScale } = ctx;
    const range = timeScale.getRange();
    const data = this.stores[layerIndex].getVisibleData(range.from, range.to);
    if (data.length === 0) return null;

    const last = this.stores[layerIndex].last();
    if (last !== undefined && head.time >= last.time) {
      if (!Number.isFinite(last.value)) return null;

      const endpoint = this.trailingEndpoint(ctx, layerIndex);
      if (endpoint === null) return null;

      return { x: endpoint.x, y: endpoint.y, value: last.value };
    }

    const first = data[0];
    if (head.time <= first.time) {
      if (!Number.isFinite(first.value)) return null;

      const startValue = this.effectiveValue(ctx, layerIndex, first.time, first.value);

      return { x: timeScale.timeToBitmapX(first.time), y: yScale.valueToBitmapY(startValue), value: first.value };
    }

    const value = valueAtTime(data, head.time, (p) => this.effectiveValue(ctx, layerIndex, p.time, p.value));
    if (value === null) return null;

    return { x: head.x, y: yScale.valueToBitmapY(value), value };
  }

  /**
   * Rendered positions of the layer's still-unsettled trailing points, keyed
   * by time. Each chain link lerps from the *previous link's rendered
   * position* toward its own target — so when appends arrive faster than
   * `entryMs` and several entrances overlap, the older heads keep unfurling
   * instead of snapping to their raw spots the frame a new point lands.
   *
   * Targets read {@link BaseMultiLayerSeries.effectiveValue}, so the pinned
   * live chase and the entrance compose. Returns `null` when nothing is
   * unsettled or any value in the chain (anchor included) is non-finite —
   * callers fall back to raw geometry, mirroring the old NaN guard.
   */
  /**
   * Stacked cumulative value for `layerIndex` at `queryT`, alpha-weighted
   * and reduced through {@link effectiveValue} — the single source of truth
   * shared by {@link renderStacked}'s geometry and the overlay's crosshair /
   * pulse dots, so they can never disagree. Any OTHER layer without a
   * sample exactly at `queryT` holds its nearest earlier value forward
   * instead of contributing 0: ragged streams tick independently, so a
   * lagging sibling shouldn't zero out the moment another layer ticks past
   * it (see `renderStacked`'s `valueMaps` comment for the full rationale).
   */
  private stackedValueAt(ctx: SeriesRenderContext | OverlayRenderContext, layerIndex: number, queryT: number): number {
    const percent = this.options.stacking === 'percent';
    const valueAt = (lj: number): number => {
      const alpha = this.getLayerAlpha(lj);
      if (alpha <= 0) return 0;

      const data = this.stores[lj].getAll();
      if (data.length === 0 || queryT < data[0].time) return 0;

      const v = valueAtTime(data, queryT, (p) => this.effectiveValue(ctx, lj, p.time, p.value));

      return v === null ? 0 : v * alpha;
    };

    let total = 0;
    if (percent) {
      for (let lj = 0; lj < this.stores.length; lj++) total += valueAt(lj);
    }

    let running = 0;
    for (let lj = 0; lj <= layerIndex; lj++) {
      const v = valueAt(lj);
      running += percent && total > 0 ? (v / total) * 100 : v;
    }

    return running;
  }

  /**
   * Bitmap position for layer `li`'s stacked boundary at time `t`, chain-
   * lerped through that layer's own still-unsettled trailing entries when
   * `t` is its current live tip — a single dot has no shared edge to tear,
   * so (unlike `renderStacked`'s polygon boundaries) gating off the layer's
   * own entrance state is enough. Falls back to the raw settled position
   * for historical points or when the 'grow' entrance is disabled.
   */
  private stackedPositionAt(
    ctx: SeriesRenderContext | OverlayRenderContext,
    li: number,
    t: number,
  ): { x: number; y: number } {
    const { timeScale, yScale } = ctx;
    const x = timeScale.timeToBitmapX(t);
    const y = yScale.valueToBitmapY(this.stackedValueAt(ctx, li, t));

    const lastT = this.stores[li].last()?.time;
    if ((this.options.entryAnimation ?? 'grow') !== 'grow' || t !== lastT) return { x, y };

    const chain = this.unsettledTail(li);
    const all = this.stores[li].getAll();
    const anchorIdx = all.length - 1 - chain.length;
    if (chain.length === 0 || anchorIdx < 0) return { x, y };

    const anchor = all[anchorIdx];
    let px = timeScale.timeToBitmapX(anchor.time);
    let py = yScale.valueToBitmapY(this.stackedValueAt(ctx, li, anchor.time));
    for (let k = 0; k < chain.length; k++) {
      const point = all[anchorIdx + 1 + k];
      const eased = easeOutCubic(chain[k].progress);
      const targetX = timeScale.timeToBitmapX(point.time);
      const targetY = yScale.valueToBitmapY(this.stackedValueAt(ctx, li, point.time));
      px = lerp(px, targetX, eased);
      py = lerp(py, targetY, eased);
    }

    return { x: px, y: py };
  }

  private chainedTailPositions(
    ctx: SeriesRenderContext | OverlayRenderContext,
    layerIndex: number,
  ): Map<number, { x: number; y: number }> | null {
    const chain = this.unsettledTail(layerIndex);
    if (chain.length === 0) return null;

    const all = this.stores[layerIndex].getAll();
    const anchorIdx = all.length - 1 - chain.length;
    if (anchorIdx < 0) return null;

    const { timeScale, yScale } = ctx;
    const anchor = all[anchorIdx];
    if (!Number.isFinite(anchor.value)) return null;

    let prevX = timeScale.timeToBitmapX(anchor.time);
    let prevY = yScale.valueToBitmapY(this.effectiveValue(ctx, layerIndex, anchor.time, anchor.value));

    const positions = new Map<number, { x: number; y: number }>();
    for (let k = 0; k < chain.length; k++) {
      const point = all[anchorIdx + 1 + k];
      if (!Number.isFinite(point.value)) return null;

      // Ease the unfurl so each head decelerates into its resting spot
      // instead of hard-stopping at settle. Linear `progress` still drives
      // the fade-alpha path elsewhere — only the geometry is eased.
      const eased = easeOutCubic(chain[k].progress);
      const targetX = timeScale.timeToBitmapX(point.time);
      const targetY = yScale.valueToBitmapY(this.effectiveValue(ctx, layerIndex, point.time, point.value));
      const x = lerp(prevX, targetX, eased);
      const y = lerp(prevY, targetY, eased);
      positions.set(point.time, { x, y });
      prevX = x;
      prevY = y;
    }

    return positions;
  }

  /**
   * Bitmap coordinates for the trailing endpoint of a layer — i.e. where the
   * last visible point should be drawn *right now*. Accounts for live-tracking
   * smoothing on Y (via {@link BaseMultiLayerSeries.effectiveValue}) and the
   * `'grow'` entrance animation via the chained tail lerp.
   *
   * Shared between `renderOff` (last `lineTo` of the polyline) and `drawOverlay`
   * (pulse dot) so the pulse glides in sync with the trailing segment instead
   * of teleporting to the raw last.time while the line still unfurls.
   */
  private trailingEndpoint(
    ctx: SeriesRenderContext | OverlayRenderContext,
    layerIndex: number,
  ): { x: number; y: number } | null {
    const store = this.stores[layerIndex];
    const last = store.last();
    if (!last) return null;

    const { timeScale, yScale } = ctx;
    const lastRawX = timeScale.timeToBitmapX(last.time);
    const lastRawY = yScale.valueToBitmapY(this.effectiveValue(ctx, layerIndex, last.time, last.value));

    const style = this.options.entryAnimation ?? 'grow';
    if (style !== 'grow') {
      return { x: lastRawX, y: lastRawY };
    }

    const chained = this.chainedTailPositions(ctx, layerIndex);

    return chained?.get(last.time) ?? { x: lastRawX, y: lastRawY };
  }

  /**
   * Vertical stroke + area gradients for `options.threshold`, pinned to the
   * threshold value's pixel row so the series reads calm below the level and hot
   * above it. Returns `null` when no threshold is configured.
   *
   * Recomputed per frame: `createLinearGradient` is cheap, and the row drifts as
   * the Y-axis autoscales (and during the spike's entrance), so a cache keyed on
   * the row would miss almost every frame anyway.
   */
  private buildThresholdPaint(
    ctx: SeriesRenderContext,
    seriesColor: string,
  ): { stroke: CanvasGradient; area: CanvasGradient } | null {
    const threshold = this.options.threshold;
    if (!threshold) return null;

    const { scope, yScale } = ctx;
    const { context } = scope;
    const height = scope.bitmapSize.height;
    const above = threshold.above;
    const below = threshold.below ?? seriesColor;

    // The threshold value's pixel row as a 0..1 gradient offset, with a small
    // blend band so the switch reads as a transition rather than an aliased edge.
    const row = Math.min(1, Math.max(0, yScale.valueToBitmapY(threshold.value) / height));
    const band = Math.min(6 * scope.verticalPixelRatio, height * 0.02) / height;
    const top = Math.max(0, row - band);
    const bottom = Math.min(1, row + band);

    const stroke = context.createLinearGradient(0, 0, 0, height);
    stroke.addColorStop(0, above);
    stroke.addColorStop(top, above);
    stroke.addColorStop(bottom, below);
    stroke.addColorStop(1, below);

    const area = context.createLinearGradient(0, 0, 0, height);
    area.addColorStop(0, hexToRgba(above, 0.26));
    area.addColorStop(top, hexToRgba(above, 0.14));
    area.addColorStop(bottom, hexToRgba(below, 0.1));
    area.addColorStop(1, hexToRgba(below, 0.01));

    return { stroke, area };
  }

  /**
   * Dot markers at each data point (`options.points`). Callers pass the same
   * animated vertices the stroke was built from, so the dots glide with the
   * entrance unfurl and live-value smoothing instead of snapping to raw
   * geometry. Skipped for the frame when the average horizontal spacing falls
   * under ~1.5 dot diameters — dots that dense melt into a fat line and hide
   * the stroke.
   */
  private drawPointMarkers(params: {
    context: CanvasRenderingContext2D;
    points: readonly LinePoint[];
    pixelRatio: number;
    color: string;
  }): void {
    const config = this.options.points;
    if (!config?.visible) return;

    const { context, points, pixelRatio, color } = params;
    if (points.length === 0) return;

    const radius = Math.max(1, (config.radius ?? 3) * pixelRatio);
    if (points.length > 1) {
      const spacing = (points[points.length - 1].x - points[0].x) / (points.length - 1);
      if (spacing < radius * 3) return;
    }

    context.beginPath();
    for (const point of points) {
      context.moveTo(point.x + radius, point.y);
      context.arc(point.x, point.y, radius, 0, Math.PI * 2);
    }
    context.fillStyle = config.color ?? color;
    context.fill();
  }

  /** Each layer drawn independently */
  private renderOff(ctx: SeriesRenderContext): void {
    const { scope, timeScale, yScale } = ctx;
    const { context } = scope;
    const range = timeScale.getRange();
    const { verticalPixelRatio } = scope;
    const hasStroke = this.options.strokeWidth > 0;
    const lineWidth = Math.max(1, Math.round(this.options.strokeWidth * verticalPixelRatio));
    const style = this.options.entryAnimation ?? 'grow';
    // Resolve the path builder once. A custom `linePainter` overrides `curve`;
    // both fall back to the straight polyline (zero visual change by default).
    const builder = resolveLinePainter(this.options.linePainter ?? this.options.curve ?? 'straight');
    const paintEnv: PaintEnv = {
      ctx: context,
      theme: ctx.theme,
      horizontalPixelRatio: scope.horizontalPixelRatio,
      verticalPixelRatio,
    };

    for (let li = 0; li < this.stores.length; li++) {
      const layerAlpha = this.getLayerAlpha(li);
      if (layerAlpha <= 0) continue;

      let data = this.stores[li].getVisibleData(range.from, range.to);
      const pixelWidth = scope.mediaSize.width;
      if (data.length > pixelWidth * 2) {
        data = decimateLineData(data, Math.round(pixelWidth * 1.5));
      }
      if (data.length < 2) continue;

      // A value-fn color is resolved once per line, at the layer's last value —
      // the whole stroke / area takes that one color (per-segment coloring is a
      // bar-only feature). A plain string resolves to itself.
      const layerLastValue = this.stores[li].last()?.value ?? data[data.length - 1].value;
      const color = this.resolveLayerColor(li, layerLastValue);

      // Positional threshold gradient (calm below the level, hot above it). Null
      // unless `options.threshold` is set, in which case it drives both the
      // stroke and the area fill in place of the flat series color.
      const thresholdPaint = this.buildThresholdPaint(ctx, color);

      // Trailing-segment entrance: the new segment appears to unfurl from the
      // penultimate point to the new one. 'grow' interpolates both axes (via
      // {@link trailingEndpoint}), 'fade' keeps geometry fixed and ramps stroke
      // alpha. Sharing `trailingEndpoint` with the overlay pulse keeps the dot
      // in sync with the line head instead of teleporting during entrance.
      //
      // All of it applies only when the visible slice actually ends at the
      // store's live last point. Panned into history, `data`'s last is an
      // interior sample — substituting the store-last endpoint there would
      // draw a bogus segment shooting off toward the live edge.
      const last = data[data.length - 1];
      const storeLast = this.stores[li].last();
      const lastIsLive = storeLast !== undefined && last.time === storeLast.time;
      const progress = lastIsLive ? this.entranceProgress(li, last.time) : 1;
      const trailingFade = lastIsLive && style === 'fade' && progress < 1;
      const endpoint = (lastIsLive ? this.trailingEndpoint(ctx, li) : null) ?? {
        x: timeScale.timeToBitmapX(last.time),
        y: yScale.valueToBitmapY(this.effectiveValue(ctx, li, last.time, last.value)),
      };
      const trailingX = endpoint.x;
      const trailingY = endpoint.y;
      // Chained positions for tail points whose entrance is still unsettled —
      // when appends outpace entryMs, the older heads keep unfurling instead
      // of snapping to their raw spots the frame a new point lands.
      const chained = lastIsLive && style === 'grow' ? this.chainedTailPositions(ctx, li) : null;

      // Single save/restore composes per-layer alpha (setLayerVisible fade)
      // with the per-point entrance alpha (trailing fade). Chart already set
      // globalAlpha = seriesAlpha around this render call; we multiply on top.
      const layerFaded = layerAlpha < 1;
      if (layerFaded || trailingFade) {
        context.save();
        if (layerFaded) context.globalAlpha *= layerAlpha;
        if (trailingFade) context.globalAlpha *= progress;
      }

      // Line — break the path at any non-finite value (null / NaN / Infinity /
      // undefined). A naive single-path draw would either stroke through NaN
      // coordinates or leak the area-fill polygon across gaps, so we collect
      // finite *runs* and render each independently: stroke = one subpath per
      // run, fill = one closed polygon per run anchored to the chart bottom.

      const bodyEnd = data.length - 1;
      const runs: { x: number; y: number }[][] = [];
      let current: { x: number; y: number }[] | null = null;
      for (let i = 0; i < bodyEnd; i++) {
        const v = data[i].value;
        if (!Number.isFinite(v)) {
          current = null;
          continue;
        }
        if (!current) {
          current = [];
          runs.push(current);
        }
        // Chained tail positions win (overlapping entrances mid-unfurl);
        // otherwise effectiveValue picks up the pinned chase on the
        // penultimate point — the vertex keeps gliding to its final stored
        // value after an append instead of snapping there in one frame.
        const override = chained?.get(data[i].time);
        if (override) {
          current.push({ x: override.x, y: override.y });
        } else {
          const y = yScale.valueToBitmapY(this.effectiveValue(ctx, li, data[i].time, v));
          current.push({ x: timeScale.timeToBitmapX(data[i].time), y });
        }
      }
      // Attach the trailing endpoint only if it's finite AND the last data
      // point is finite. A poisoned last value would produce a NaN trailing
      // endpoint; skip it instead of contaminating the polygon.
      const lastValue = data[bodyEnd]?.value;
      const trailingFinite = Number.isFinite(trailingX) && Number.isFinite(trailingY) && Number.isFinite(lastValue);
      // The trailing endpoint moves every frame only during a 'grow' entrance;
      // a smooth builder keeps that run's last segment straight (grew=true) so
      // the head can't wobble. Other runs / styles are fully settled.
      const growing = style === 'grow' && progress < 1;
      let growingRun: { x: number; y: number }[] | null = null;
      if (trailingFinite) {
        if (current) {
          current.push({ x: trailingX, y: trailingY });
          growingRun = current;
        } else {
          runs.push([{ x: trailingX, y: trailingY }]);
        }
      }

      // Stroke — one beginPath covering all multi-point runs. Breaks render
      // as gaps. Single-finite-point runs (a finite value sandwiched
      // between two non-finite neighbors, or the trailing endpoint alone
      // after a poisoned penultimate) are handled separately below — they
      // can't be stroked as a segment but must not vanish.
      if (hasStroke && runs.some((run) => run.length >= 2)) {
        context.beginPath();
        for (const run of runs) {
          if (run.length < 2) continue;
          builder(paintEnv, { points: run, color, lineWidth, closing: false, grew: growing && run === growingRun });
        }
        context.strokeStyle = thresholdPaint ? thresholdPaint.stroke : color;
        context.lineWidth = lineWidth;
        context.lineJoin = 'round';
        context.lineCap = 'round';
        context.stroke();
      }

      // Orphaned single-finite-point runs → visible dots. Without this, a
      // finite point sandwiched between two NaN neighbors would silently
      // disappear, which is worse than the original "crash on NaN" bug.
      if (hasStroke) {
        const orphanRadius = Math.max(1, lineWidth / 2);
        let dotPathOpen = false;
        for (const run of runs) {
          if (run.length !== 1) continue;
          if (!dotPathOpen) {
            context.beginPath();
            dotPathOpen = true;
          }
          context.moveTo(run[0].x + orphanRadius, run[0].y);
          context.arc(run[0].x, run[0].y, orphanRadius, 0, Math.PI * 2);
        }
        if (dotPathOpen) {
          context.fillStyle = color;
          context.fill();
        }
      }

      // Area fill — one closed polygon per run, each dropped to the chart
      // baseline. Without per-run polygons, a single shared path would bleed
      // fill across the gaps. The 'trace' ghost pass draws stroke-only.
      if (this.options.area.visible && !this.introGhostPass) {
        const bottomY = scope.bitmapSize.height;
        let grad: CanvasGradient;
        if (thresholdPaint) {
          grad = thresholdPaint.area;
        } else {
          const cacheKey = String(li);
          const cached = this.areaGradientCache.get(cacheKey);
          if (cached && cached.bottomY === bottomY && cached.color === color) {
            grad = cached.gradient;
          } else {
            grad = context.createLinearGradient(0, 0, 0, bottomY);
            grad.addColorStop(0, hexToRgba(color, 0.12));
            grad.addColorStop(1, hexToRgba(color, 0.01));
            this.areaGradientCache.set(cacheKey, { gradient: grad, bottomY, color });
          }
        }
        context.fillStyle = grad;
        for (const run of runs) {
          if (run.length < 2) continue;
          context.beginPath();
          // Same builder as the stroke → the area's curved top edge is identical
          // to the stroked line above it.
          builder(paintEnv, { points: run, color, lineWidth, closing: true, grew: growing && run === growingRun });
          // Close the polygon: drop from the last point to the baseline, run
          // back to the first point's x on the baseline, and closePath snaps
          // the final edge back up to (first.x, first.y).
          context.lineTo(run[run.length - 1].x, bottomY);
          context.lineTo(run[0].x, bottomY);
          context.closePath();
          context.fill();
        }
      }

      // Per-point dot markers on top of the stroke and fill. `runs` already
      // carries the chained-tail / smoothed vertices and excludes non-finite
      // points, so the dots animate with the line and never land on NaN.
      if (this.options.points?.visible) {
        const flat: LinePoint[] = [];
        for (const run of runs) {
          for (const point of run) flat.push(point);
        }
        this.drawPointMarkers({ context, points: flat, pixelRatio: scope.horizontalPixelRatio, color });
      }

      if (trailingFade || layerFaded) context.restore();
    }
  }

  /** Stacked area rendering */
  private renderStacked(ctx: SeriesRenderContext, percent: boolean): void {
    const { scope, timeScale, yScale } = ctx;
    const { context } = scope;
    const range = timeScale.getRange();
    const { verticalPixelRatio } = scope;
    const hasStroke = this.options.strokeWidth > 0;
    const lineWidth = Math.max(1, Math.round(this.options.strokeWidth * verticalPixelRatio));
    // Stacked tiling needs segment-level access (to replay a shared boundary
    // forward then reversed), so it uses the built-in `curve` kind directly; a
    // custom `linePainter` isn't applied here and falls back to 'straight'.
    const curveKind: CurveKind = this.options.curve ?? 'straight';

    // Collect per-layer data, gating on alpha so a layer mid-fade still
    // contributes shrinking geometry to the stack instead of disappearing the
    // moment `setLayerVisible(false)` flips the store. Alpha=0 is filtered out.
    const pixelWidth = scope.mediaSize.width;
    const layers = this.stores.map((s, li) => {
      if (this.getLayerAlpha(li) <= 0) return [];

      let data = s.getVisibleData(range.from, range.to);
      if (data.length > pixelWidth * 2) {
        data = decimateLineData(data, Math.round(pixelWidth * 1.5));
      }

      return data;
    });
    // Get all unique times, sorted
    const timeSet = new Set<number>();
    for (const layer of layers) {
      for (const d of layer) timeSet.add(d.time);
    }
    const times = Array.from(timeSet).sort((a, b) => a - b);
    if (times.length < 2) return;

    // Value × alpha per layer, evaluated at every shared time column — not
    // just the columns the layer itself has a sample at. Layers stream
    // independently (a "ragged" feed: each series ticks on its own cadence),
    // so a layer that hasn't reached the newest column yet must hold its
    // last known value there instead of contributing 0 — zero-filling would
    // momentarily collapse the whole stack toward whichever single layer
    // just ticked, then snap back out once the others catch up. Times before
    // a layer's own first point still contribute 0 — that layer genuinely
    // hasn't started. effectiveValue keeps updateLastPoint smoothing for the
    // trailing edge even inside the stack; layers mid-fade shrink their
    // contribution smoothly over `toggleMs` via alpha.
    const valueMaps: Map<number, number>[] = layers.map((layer, li) => {
      const m = new Map<number, number>();
      if (layer.length === 0) return m;

      const alpha = this.getLayerAlpha(li);
      const firstTime = layer[0].time;
      for (const t of times) {
        if (t < firstTime) continue;

        const v = valueAtTime(layer, t, (p) => this.effectiveValue(ctx, li, p.time, p.value));
        if (v !== null) m.set(t, v * alpha);
      }

      return m;
    });

    // Stacked Y values per time. valueMaps already account for alpha (=0 for
    // fully faded layers, =rawValue for fully visible), so the cumulative
    // collapses to "without this layer" exactly when alpha reaches 0.
    const cumulative: number[][] = Array.from({ length: this.stores.length }, () => new Array(times.length).fill(0));
    for (let ti = 0; ti < times.length; ti++) {
      const t = times[ti];
      let total = 0;
      if (percent) {
        for (let li = 0; li < this.stores.length; li++) {
          const v = valueMaps[li].get(t);
          if (Number.isFinite(v)) total += v as number;
        }
      }
      let running = 0;
      for (let li = 0; li < this.stores.length; li++) {
        const v = valueMaps[li].get(t);
        const raw = Number.isFinite(v) ? (v as number) : 0;
        running += percent && total > 0 ? (raw / total) * 100 : raw;
        cumulative[li][ti] = running;
      }
    }

    // Per-layer chained entrance progress — drives the 'fade' alpha ramp
    // only, so gating it off each layer's own unsettled tail is fine (fade
    // never repositions geometry, so there's no shared edge to tear).
    //
    // Animation only fires when the layer's still-unsettled tail points (see
    // {@link BaseMultiLayerSeries.unsettledTail}) occupy the trailing slots of
    // the visible `times` window, with the chain's anchor immediately before
    // them. Anywhere else, lerping the tail would distort an already-superseded
    // segment or pull an off-screen point into the on-screen tail.
    const style = this.options.entryAnimation ?? 'grow';
    const timeIdx = new Map<number, number>();
    for (let i = 0; i < times.length; i++) timeIdx.set(times[i], i);
    // Raw progress of each layer's newest unsettled link — drives the
    // 'fade' alpha ramp.
    const layerHeadProgress: number[] = new Array(this.stores.length).fill(1);
    for (let li = 0; li < this.stores.length; li++) {
      if (this.getLayerAlpha(li) <= 0) continue;

      const chain = this.unsettledTail(li);
      const len = chain.length;
      if (len === 0) continue;

      let gated = true;
      for (let j = 0; j < len; j++) {
        if (timeIdx.get(chain[j].time) !== times.length - len + j) {
          gated = false;
          break;
        }
      }
      if (!gated) continue;

      layerHeadProgress[li] = chain[len - 1].progress;
    }

    // Shared per-column 'grow' entrance progress, oldest first. A stacked
    // boundary is drawn twice — once as the layer above it's lower edge,
    // once as the layer below it's upper edge — so gating growth off
    // whichever single layer happens to own the new point (the old
    // per-layer approach) tears the shared edge apart the instant a
    // sibling's mirrored edge is still growing while this layer's own edge
    // already sits at its raw final position (visible as a diagonal seam at
    // the live edge in a ragged multi-layer stream). A time column is
    // "growing" if ANY visible layer has a real, still-unsettled entry
    // there; every layer's geometry at that column eases in lockstep using
    // the slowest (minimum) progress among them, so no boundary ever tears.
    const growChain: number[] = [];
    if (style === 'grow') {
      for (let ti = times.length - 1; ti >= 0; ti--) {
        const t = times[ti];
        let minProgress = 1;
        let found = false;
        for (let li = 0; li < this.stores.length; li++) {
          if (this.getLayerAlpha(li) <= 0) continue;
          if (this.entries[li]?.get(t) === undefined) continue;

          const progress = this.entranceProgress(li, t);
          if (progress >= 1) continue;

          found = true;
          if (progress < minProgress) minProgress = progress;
        }
        if (!found) break;

        growChain.unshift(easeOutCubic(minProgress));
      }
    }

    // Chain-lerp the trailing entries of an XY array: each link lerps from
    // the previous (already-lerped) vertex toward its own target — mirrors
    // renderOff's chained tail, so when appends outpace entryMs the older
    // heads keep unfurling instead of snapping the frame a new point lands.
    const applyGrowChain = (xy: [number, number][], easedChain: readonly number[]): void => {
      const len = easedChain.length;
      if (len === 0 || xy.length < len + 1) return;

      for (let j = 0; j < len; j++) {
        const idx = xy.length - len + j;
        const prev = xy[idx - 1];
        const target = xy[idx];
        xy[idx] = [lerp(prev[0], target[0], easedChain[j]), lerp(prev[1], target[1], easedChain[j])];
      }
    };

    // Find the lowest visible layer — that slice anchors its lower edge to
    // the canvas baseline (through padding) so the stacked fill always
    // reaches the X-axis. The NEXT visible slice above it (which may be
    // several layers up when intermediate layers are hidden) also has to
    // lerp its lower toward the baseline as the current bottom fades —
    // otherwise the moment we hit alpha=0 and the bottom is dropped, the
    // new bottom would jump down by `padding.bottom` pixels.
    const bitmapBottom = scope.bitmapSize.height;
    let bottomVisibleLi = -1;
    let secondBottomVisibleLi = -1;
    for (let li = 0; li < this.stores.length; li++) {
      if (this.getLayerAlpha(li) <= 0) continue;

      if (bottomVisibleLi < 0) {
        bottomVisibleLi = li;
      } else {
        secondBottomVisibleLi = li;
        break;
      }
    }
    const bottomAlpha = bottomVisibleLi >= 0 ? this.getLayerAlpha(bottomVisibleLi) : 1;

    // Draw from top layer to bottom so lower layers fill correctly. Use
    // alpha as the "is this layer contributing geometry" gate — store flag
    // alone would skip a fading-out layer mid-transition.
    for (let li = this.stores.length - 1; li >= 0; li--) {
      const layerAlpha = this.getLayerAlpha(li);
      if (layerAlpha <= 0) continue;

      const lastValue = this.stores[li].last()?.value ?? 0;
      const color = this.resolveLayerColor(li, lastValue);

      const isBottomVisible = li === bottomVisibleLi;
      // The next visible slice above the bottom-most smoothly hands off
      // baseline anchoring as that bottom fades: lerp its lower from the
      // natural cumulative position toward bitmapBottom by `1 - bottomAlpha`.
      // Uses `secondBottomVisibleLi` instead of `bottomVisibleLi + 1` so
      // hidden intermediate layers (alpha=0) don't break the handoff —
      // otherwise toggling between, say, layer 0 and layer 2 (with layer 1
      // hidden) would leave layer 2 unwrapped and visibly jump at alpha=0.
      const isHandoffSlice = secondBottomVisibleLi >= 0 && li === secondBottomVisibleLi && bottomAlpha < 1;

      // Lower edge. Bottom-most visible anchors to bitmapBottom (drops through
      // padding to the X-axis). Handoff slice lerps. Other slices use the
      // natural alpha-weighted cumulative for their predecessor.
      const lowerXY: [number, number][] = [];
      for (let ti = 0; ti < times.length; ti++) {
        const naturalLowerY = li > 0 ? yScale.valueToBitmapY(cumulative[li - 1][ti]) : bitmapBottom;
        let lowerY = naturalLowerY;
        if (isBottomVisible) {
          lowerY = bitmapBottom;
        } else if (isHandoffSlice) {
          lowerY = naturalLowerY + (bitmapBottom - naturalLowerY) * (1 - bottomAlpha);
        }
        lowerXY.push([timeScale.timeToBitmapX(times[ti]), lowerY]);
      }
      // The bottom-most visible slice's lower edge is the constant canvas
      // baseline (Y never varies with data), not a shared data boundary —
      // lerping its X would animate a seam that isn't actually growing.
      if (style === 'grow' && !isBottomVisible) applyGrowChain(lowerXY, growChain);

      // Upper edge = alpha-weighted cumulative. For the bottom-most slice
      // during a fade we additionally lerp it down to bitmapBottom so the
      // slice collapses through the padding region — otherwise it leaves a
      // residual padding-tall strip until alpha hits exactly 0.
      const upperXY: [number, number][] = [];
      for (let ti = 0; ti < times.length; ti++) {
        let upperY = yScale.valueToBitmapY(cumulative[li][ti]);
        if (isBottomVisible && layerAlpha < 1) {
          upperY = bitmapBottom + (upperY - bitmapBottom) * layerAlpha;
        }
        upperXY.push([timeScale.timeToBitmapX(times[ti]), upperY]);
      }
      if (style === 'grow') applyGrowChain(upperXY, growChain);

      // Upper-edge curve segments, shared by the area fill and the stroke so the
      // stroked line sits exactly on the filled slice's top edge.
      const upperPoints = toPoints(upperXY);
      const upperSegs = buildCurveSegments(upperPoints, curveKind, style === 'grow' && growChain.length > 0);

      const useFade = style === 'fade' && layerHeadProgress[li] < 1;
      if (useFade) {
        context.save();
        // Multiply, don't assign — an outer pass (ghost pre-pass, series
        // alpha) may already hold a reduced globalAlpha this fade composes
        // with.
        context.globalAlpha *= layerHeadProgress[li];
      }

      // Fill area between upper and lower with a per-slice vertical gradient
      // — solid at the slice's top edge, fades toward its lower edge. Mirrors
      // the visual language of renderOff (canvas-wide gradient from line to
      // baseline) but scoped to each slice so colors stay distinguishable and
      // every layer reads as its own "filled curve". Bounds are recomputed
      // per frame; CanvasGradient creation is cheap and slice bounds drift
      // every streaming tick so a cache wouldn't hit. The intro ghost pass
      // draws stroke-only, same as renderOff.
      if (this.options.area.visible && !this.introGhostPass) {
        let upperMinY = upperXY[0][1];
        let lowerMaxY = lowerXY[0][1];
        for (let i = 1; i < upperXY.length; i++) {
          if (upperXY[i][1] < upperMinY) upperMinY = upperXY[i][1];
        }
        for (let i = 1; i < lowerXY.length; i++) {
          if (lowerXY[i][1] > lowerMaxY) lowerMaxY = lowerXY[i][1];
        }
        // Degenerate slice (single pixel tall after alpha shrink) — skip the
        // gradient stop math and paint solid; createLinearGradient with
        // collapsed endpoints renders unpredictably across browsers.
        let fillStyle: string | CanvasGradient = hexToRgba(color, 0.25);
        if (lowerMaxY > upperMinY + 0.5) {
          const grad = context.createLinearGradient(0, upperMinY, 0, lowerMaxY);
          grad.addColorStop(0, hexToRgba(color, 0.25));
          grad.addColorStop(1, hexToRgba(color, 0.05));
          fillStyle = grad;
        }
        context.beginPath();
        context.moveTo(upperPoints[0].x, upperPoints[0].y);
        replaySegmentsForward(context, upperSegs);
        if (isBottomVisible) {
          // True canvas baseline — a straight drop and run-back, not a shared
          // data boundary, so nothing to curve or tile.
          for (let i = lowerXY.length - 1; i >= 0; i--) {
            context.lineTo(lowerXY[i][0], lowerXY[i][1]);
          }
        } else {
          // Interior boundary: trace the lower edge as the reversed curve so it
          // shares the exact path with the slice below's upper edge (no sliver
          // gap between adjacent fills).
          const lowerPoints = toPoints(lowerXY);
          const lowerSegs = buildCurveSegments(lowerPoints, curveKind, style === 'grow' && growChain.length > 0);
          const lowerLast = lowerPoints[lowerPoints.length - 1];
          context.lineTo(lowerLast.x, lowerLast.y);
          replaySegmentsReversed(context, lowerPoints, lowerSegs);
        }
        context.closePath();
        context.fillStyle = fillStyle;
        context.fill();
      }

      // Stroke the upper edge. As the layer fades, the slice's height
      // collapses (alpha-weighted cumulative) and the gradient fill thins,
      // but a 2 px stroke at full color still reads as a hard line that
      // pops out the moment we cut the layer at alpha=0. Composing
      // layerAlpha into globalAlpha just on the stroke fades it in lockstep
      // with the geometry collapse — fill stays at its gradient intensity
      // so the slice shape remains visible while shrinking.
      const strokeFaded = hasStroke && layerAlpha < 1;
      if (strokeFaded) {
        context.save();
        context.globalAlpha *= layerAlpha;
      }
      if (hasStroke) {
        context.beginPath();
        context.moveTo(upperPoints[0].x, upperPoints[0].y);
        replaySegmentsForward(context, upperSegs);
        context.strokeStyle = color;
        context.lineWidth = lineWidth;
        context.lineJoin = 'round';
        context.lineCap = 'round';
        context.stroke();
      }
      if (strokeFaded) context.restore();

      // Per-point dot markers on the slice's upper edge — the layer's own
      // visual boundary in a stack. Fades with layerAlpha in lockstep with
      // the stroke so the dots don't pop out while the slice collapses.
      if (this.options.points?.visible) {
        const dotsFaded = layerAlpha < 1;
        if (dotsFaded) {
          context.save();
          context.globalAlpha *= layerAlpha;
        }
        this.drawPointMarkers({ context, points: upperPoints, pixelRatio: scope.horizontalPixelRatio, color });
        if (dotsFaded) context.restore();
      }

      if (useFade) context.restore();
    }
  }

  /**
   * Overlay hook: draws crosshair nearest-point dots and last-point pulse dots.
   * Chart invokes this during the overlay pass for any renderer that implements it.
   */
  drawOverlay(ctx: OverlayRenderContext): void {
    this.tickAnimations(performance.now());

    const { scope, timeScale, yScale, crosshair, dataInterval } = ctx;
    const size = scope;
    const pulseMs = this.options.pulseMs;
    // Closed-form pulse phase ∈ [0, 1). One full cycle per `pulseMs * 2π`
    // wall-clock window — kept inline here (rather than routed through the
    // viewport engine) so the renderer carries no cross-module state for a
    // value derivable from `performance.now()`.
    const pulsePhase = pulseMs > 0 ? (performance.now() / (pulseMs * 2 * Math.PI)) % 1 : 0;

    // Crosshair nearest-point dots
    if (crosshair) {
      const stacking = this.options.stacking;
      const r = 4 * size.horizontalPixelRatio;

      for (let li = 0; li < this.stores.length; li++) {
        const layerAlpha = this.getLayerAlpha(li);
        if (layerAlpha <= 0) continue;

        const closest = this.stores[li].findNearest(crosshair.time, dataInterval);
        if (!closest) continue;

        // Resolve the dot at the layer's raw value under the cursor so a
        // value-fn color matches the segment the crosshair is on.
        const color = this.resolveLayerColor(li, closest.value);

        // Routes through `effectiveValue` / the entrance chain (via
        // `stackedPositionAt`) so the dot lands exactly where the
        // stroke/fill is actually drawn this frame — not the raw target,
        // `entryMs` before the geometry visually catches up to it.
        const { x: px, y: py } =
          stacking === 'off'
            ? {
                x: timeScale.timeToBitmapX(closest.time),
                y: yScale.valueToBitmapY(this.effectiveValue(ctx, li, closest.time, closest.value)),
              }
            : this.stackedPositionAt(ctx, li, closest.time);

        const dotFaded = layerAlpha < 1;
        if (dotFaded) {
          scope.context.save();
          scope.context.globalAlpha *= layerAlpha;
        }

        // Halo: the series color at reduced alpha via globalAlpha rather than
        // splicing an alpha into the color string — the old regex/concat path
        // produced an invalid fillStyle for shorthand hex, 8-digit hex, hsl()
        // and named colors (it only handled #rrggbb / rgb()).
        scope.context.save();
        scope.context.globalAlpha *= 0.25;
        scope.context.beginPath();
        scope.context.arc(px, py, r + 3 * size.horizontalPixelRatio, 0, Math.PI * 2);
        scope.context.fillStyle = color;
        scope.context.fill();
        scope.context.restore();

        scope.context.beginPath();
        scope.context.arc(px, py, r, 0, Math.PI * 2);
        scope.context.fillStyle = color;
        scope.context.fill();

        if (dotFaded) scope.context.restore();
      }
    }

    // Pulse dots for line series (runs on overlay, not main layer).
    // Keep live-tracking in sync with the overlay pass — otherwise the pulse dot
    // would lag the smoothed line head by a frame.
    // `pulseMs <= 0` at the chart level (`animations.series.line.pulse: false`
    // or `animations: false`) disables the halo entirely; per-series `pulse`
    // still controls whether the dot is ever drawn.
    // Suppressed while a clip-front intro is in flight — the head glow owns
    // the dot until the reveal reaches the line's end, then the pulse
    // cross-fades in over the same tail window the head bell-fades out
    // (both anchored to the trailing endpoint by then, so the handoff is
    // seamless instead of a pop the frame the wave settles).
    // Value-transform-only intros (unfold) keep the pulse: the whole line
    // is visible and the dot rides the transformed endpoint via the
    // effectiveValue hook.
    const clipIntro = this.introWave.active && this.introDirectives?.clip !== undefined;
    let introHandoff = 1;
    if (clipIntro) {
      introHandoff = Math.max(0, (this.introWave.linear() - (1 - INTRO_HEAD_FADE)) / INTRO_HEAD_FADE);
    }
    if (this.hasPulse && pulseMs > 0 && introHandoff > 0) {
      const stacking = this.options.stacking;
      for (let li = 0; li < this.stores.length; li++) {
        const layerAlpha = this.getLayerAlpha(li);
        if (layerAlpha <= 0) continue;

        const lastValue = this.stores[li].last()?.value ?? 0;
        const color = this.resolveLayerColor(li, lastValue);

        if (stacking === 'off') {
          // `trailingEndpoint` returns the interpolated (x, y) during a 'grow'
          // entrance so the dot glides from penultimate toward the new point in
          // lockstep with the line's trailing segment.
          const endpoint = this.trailingEndpoint(ctx, li);
          if (!endpoint) continue;

          this.drawPulse({
            ctx: scope.context,
            x: endpoint.x,
            y: endpoint.y,
            color,
            pixelRatio: size.horizontalPixelRatio,
            phase: pulsePhase,
            alpha: layerAlpha * introHandoff,
          });
          continue;
        }

        // Stacked: pulse position must match renderStacked's cumulative at
        // this layer's last time, chain-lerped in lockstep with the
        // rendered trailing segment during a 'grow' entrance.
        const last = this.stores[li].last();
        if (!last) continue;

        const { x: pulseX, y: pulseY } = this.stackedPositionAt(ctx, li, last.time);

        this.drawPulse({
          ctx: scope.context,
          x: pulseX,
          y: pulseY,
          color,
          pixelRatio: size.horizontalPixelRatio,
          phase: pulsePhase,
          alpha: layerAlpha * introHandoff,
        });
      }
    }
  }

  private drawPulse({
    ctx,
    x,
    y,
    color,
    pixelRatio,
    phase,
    alpha = 1,
  }: {
    ctx: CanvasRenderingContext2D;
    x: number;
    y: number;
    color: string;
    pixelRatio: number;
    /** Engine-driven pulse phase ∈ [0, 1). `Math.abs(Math.sin(phase·2π))` ramps the halo at one full visible cycle per period. */
    phase: number;
    /** Per-layer alpha applied via save/restore. Defaults to 1 (no fade). */
    alpha?: number;
  }): void {
    const dotRadius = 3 * pixelRatio;
    const pulse = 0.4 + 0.6 * Math.abs(Math.sin(phase * 2 * Math.PI));
    const glowRadius = dotRadius + 4 * pixelRatio * pulse;

    const faded = alpha < 1;
    if (faded) {
      ctx.save();
      ctx.globalAlpha *= alpha;
    }

    ctx.beginPath();
    ctx.arc(x, y, glowRadius, 0, Math.PI * 2);
    ctx.fillStyle = hexToRgba(color, pulse * 0.3);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    if (faded) ctx.restore();
  }
}

/** Series definition for `chart.addSeries` — keeps the chart renderer-agnostic
 *  so hosts that never render lines don't bundle this module. */
export const LineSeriesDef: SeriesDefinition<LineSeriesOptions> = {
  type: 'line',
  create: ({ theme, layerCount }, options) =>
    new LineRenderer(layerCount, {
      colors: layerCount === 1 ? [theme.line.color] : theme.seriesColors.slice(0, layerCount),
      strokeWidth: theme.line.width,
      ...options,
    }),
};

import { DEFAULT_BAR_ENTRY, DEFAULT_BAR_SMOOTH } from '../animation/config';
import type { ChartTheme } from '../theme/types';
import type { BarSeriesOptions, TimePoint } from '../types';
import { BaseMultiLayerSeries } from './base-multi-layer';
import { resolveBarPainter } from './painters/resolve';
import type { BarPaintArgs, BarPainter, CornerMask, PaintEnv } from './painters/types';
import type { SeriesRenderContext } from './types';

/** Internal resolved shape: `entryMs` / `smoothMs` are concrete numbers
 *  (`false` from the public surface gets normalized to `0` at the merge
 *  boundary, so downstream reads never see the disable sentinel). */
type ResolvedBarOptions = Omit<BarSeriesOptions, 'entryMs' | 'smoothMs'> & {
  entryMs: number;
  smoothMs: number;
};

/** Default free-end corner radius in CSS px. `0` is byte-identical to the
 *  pre-rounding `fillRect` output (see {@link fillRoundedRect}). */
const DEFAULT_CORNER_RADIUS = 2;

const DEFAULT_OPTIONS: ResolvedBarOptions = {
  colors: ['#26a69a', '#ef5350'],
  barWidthRatio: 0.6,
  stacking: 'off',
  anchor: 'center',
  cornerRadius: DEFAULT_CORNER_RADIUS,
  entryMs: DEFAULT_BAR_ENTRY,
  smoothMs: DEFAULT_BAR_SMOOTH,
};

function normalize(options: BarSeriesOptions): ResolvedBarOptions {
  return {
    ...options,
    entryMs: options.entryMs === false ? 0 : (options.entryMs ?? DEFAULT_BAR_ENTRY),
    smoothMs: options.smoothMs === false ? 0 : (options.smoothMs ?? DEFAULT_BAR_SMOOTH),
  };
}

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
}

/** One bar's draw spec for {@link BarRenderer.drawAnimatedBar} — grouped into
 *  a single object so call sites read by name instead of many positional
 *  args. */
interface AnimatedBar {
  context: CanvasRenderingContext2D;
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
}

export class BarRenderer extends BaseMultiLayerSeries<TimePoint> {
  readonly kind = 'bar' as const;
  protected declare options: ResolvedBarOptions;

  /** Resolved drawing context for the in-flight render pass. Set at the top of
   *  {@link render}, read by {@link drawAnimatedBar}. */
  #pass: BarPass | null = null;

  constructor(layerCount: number, options?: Partial<BarSeriesOptions>) {
    super(layerCount);
    this.options = normalize({ ...DEFAULT_OPTIONS, ...options });
  }

  updateOptions(options: Partial<BarSeriesOptions>): void {
    this.options = normalize({ ...this.options, ...options });
  }

  protected isEntryEnabled(): boolean {
    return (this.options.entryAnimation ?? 'fade-grow') !== 'none';
  }

  applyTheme(theme: ChartTheme, prev: ChartTheme): void {
    // Only swap colors that still match the previous theme's defaults — that
    // preserves caller-supplied palettes (e.g. candlestick up/down for a P&L
    // bar) across theme switches, while still tracking the active theme for
    // colors the caller didn't override.
    const prevDefaults = prev.seriesColors;
    const current = this.options.colors;
    const next = current.map((c, i) => (c === prevDefaults[i] ? (theme.seriesColors[i] ?? c) : c));

    this.updateOptions({ colors: next });
  }

  /** True when `time` is at/after the configured `projectedFrom` forecast cut. */
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
    progress: number,
    baselineY: number,
    topY: number,
    barHeight: number,
    x: number,
    barWidth: number,
  ): { topY: number; barHeight: number; x: number; barWidth: number; alpha: number } {
    const style = this.options.entryAnimation ?? 'fade-grow';
    if (progress >= 1 || style === 'none') {
      return { topY, barHeight, x, barWidth, alpha: 1 };
    }

    let tY = topY;
    let h = barHeight;
    let xx = x;
    let alpha = 1;

    if (style === 'fade' || style === 'fade-grow') alpha = progress;
    if (style === 'grow' || style === 'fade-grow') {
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
    this.tickAnimations(performance.now());

    const { scope } = ctx;
    this.#pass = {
      painter: resolveBarPainter(this.options.barPainter),
      env: {
        ctx: scope.context,
        theme: ctx.theme,
        horizontalPixelRatio: scope.horizontalPixelRatio,
        verticalPixelRatio: scope.verticalPixelRatio,
      },
      radius: (this.options.cornerRadius ?? DEFAULT_CORNER_RADIUS) * scope.horizontalPixelRatio,
    };

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
  }

  /** Stacking off — each layer drawn independently from zero, overlapping */
  private renderOff(ctx: SeriesRenderContext): void {
    const { scope, timeScale, yScale, dataInterval } = ctx;
    const { context, horizontalPixelRatio } = scope;
    const range = timeScale.getRange();

    // Bar slot width — only cap when the visible range is sparse (≤ 2
    // points on the most-populated layer). Dense zooms must keep wide bars.
    // See the matching comment in candlestick.ts.
    let maxVisibleCount = 0;
    for (const store of this.stores) {
      if (!store.isVisible()) continue;
      const count = store.getVisibleData(range.from, range.to).length;
      if (count > maxVisibleCount) maxVisibleCount = count;
      if (maxVisibleCount > 2) break;
    }
    const naturalBarWidth = timeScale.barWidthBitmap(dataInterval);
    const sparseCap = Math.round(30 * horizontalPixelRatio);
    const barWidth = maxVisibleCount <= 2 ? Math.min(sparseCap, naturalBarWidth) : naturalBarWidth;
    const bodyWidth = Math.max(1, Math.round(barWidth * this.options.barWidthRatio) - 2);
    const halfBody = Math.floor(bodyWidth / 2);
    // anchor='right' draws the body so its right edge sits on the time tick,
    // letting the rightmost bar fit on canvas with padding.right = 0.
    const anchorOffset = this.options.anchor === 'right' ? bodyWidth : halfBody;

    const yRange = yScale.getRange();
    const hasNegative = yRange.min < 0;
    const zeroY = hasNegative ? yScale.valueToBitmapY(0) : scope.bitmapSize.height;

    const isSingleLayer = this.stores.length === 1;

    if (isSingleLayer) {
      if (!this.stores[0].isVisible()) return;

      // Single-layer: colors[0] = positive, colors[1] = negative
      const posColor = this.options.colors[0];
      const negColor = this.options.colors.length > 1 ? this.options.colors[1] : posColor;
      const visibleData = this.stores[0].getVisibleData(range.from, range.to);

      for (const d of visibleData) {
        // Skip poisoned values (null / NaN / ±Infinity / undefined) — the
        // renderer must not draw a NaN-height bar.
        if (!Number.isFinite(d.value)) continue;
        const value = this.effectiveValue(ctx, 0, d.time, d.value);
        const progress = this.entranceProgress(ctx, 0, d.time);
        const isProjected = this.isProjectedTime(d.time);
        const cx = timeScale.timeToBitmapX(d.time);
        if (value >= 0) {
          const topY = yScale.valueToBitmapY(value);
          const barHeight = Math.max(1, zeroY - topY);
          this.drawAnimatedBar({
            context,
            progress,
            baselineY: zeroY,
            topY,
            barHeight,
            x: cx - anchorOffset,
            barWidth: bodyWidth,
            color: posColor,
            roundEdge: 'top',
            isProjected,
          });
        } else {
          const bottomY = yScale.valueToBitmapY(value);
          const barHeight = Math.max(1, bottomY - zeroY);
          this.drawAnimatedBar({
            context,
            progress,
            baselineY: zeroY,
            topY: zeroY,
            barHeight,
            x: cx - anchorOffset,
            barWidth: bodyWidth,
            color: negColor,
            roundEdge: 'bottom',
            isProjected,
          });
        }
      }
    } else {
      // Multi-layer: collect per-time, draw tallest first so shorter bars appear in front.
      // Drawn value = effectiveValue × getLayerAlpha — geometry shrinks toward
      // the baseline as the layer fades, so the bar stays inside the Y range
      // that is simultaneously contracting to "without this layer". Without
      // the alpha-weight, a tall bar (value=500) keeps full height while the
      // Y axis eases to a much smaller max → topY goes negative and the bar
      // visibly flies off the top of the canvas during the toggle window.
      // Alpha=0 is fully excluded one step earlier so the timeMap stays clean.
      const layers = this.stores.map((store, li) =>
        this.getLayerAlpha(li) > 0 ? store.getVisibleData(range.from, range.to) : [],
      );
      const timeMap = new Map<number, { layer: number; value: number }[]>();
      for (let li = 0; li < layers.length; li++) {
        const alpha = this.getLayerAlpha(li);
        for (const d of layers[li]) {
          if (!Number.isFinite(d.value)) continue;
          let arr = timeMap.get(d.time);
          if (!arr) {
            arr = [];
            timeMap.set(d.time, arr);
          }
          arr.push({ layer: li, value: this.effectiveValue(ctx, li, d.time, d.value) * alpha });
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

        // Overlap mode: only the front-most (last-drawn, shortest) bar per time
        // rounds its free end; taller bars behind it stay square so no rounded
        // notch shows where a front bar overlaps a back one.
        for (let i = 0; i < entries.length; i++) {
          const { layer, value } = entries[i];
          const color = this.options.colors[layer % this.options.colors.length];
          const progress = this.entranceProgress(ctx, layer, time);
          const isFront = i === entries.length - 1;
          if (value >= 0) {
            const topY = yScale.valueToBitmapY(value);
            const barHeight = Math.max(1, zeroY - topY);
            this.drawAnimatedBar({
              context,
              progress,
              baselineY: zeroY,
              topY,
              barHeight,
              x: cx - anchorOffset,
              barWidth: bodyWidth,
              color,
              roundEdge: isFront ? 'top' : 'none',
              isProjected,
            });
          } else {
            const bottomY = yScale.valueToBitmapY(value);
            const barHeight = Math.max(1, bottomY - zeroY);
            this.drawAnimatedBar({
              context,
              progress,
              baselineY: zeroY,
              topY: zeroY,
              barHeight,
              x: cx - anchorOffset,
              barWidth: bodyWidth,
              color,
              roundEdge: isFront ? 'bottom' : 'none',
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

  /** Stacked (normal or percent) rendering */
  private renderStacked(ctx: SeriesRenderContext, percent: boolean): void {
    const { scope, timeScale, yScale, dataInterval } = ctx;
    const { context, horizontalPixelRatio } = scope;
    const range = timeScale.getRange();

    // Bar slot width — sparse-only cap, see renderOff above.
    let maxVisibleCount = 0;
    for (const store of this.stores) {
      if (!store.isVisible()) continue;
      const count = store.getVisibleData(range.from, range.to).length;
      if (count > maxVisibleCount) maxVisibleCount = count;
      if (maxVisibleCount > 2) break;
    }
    const naturalBarWidth = timeScale.barWidthBitmap(dataInterval);
    const sparseCap = Math.round(30 * horizontalPixelRatio);
    const barWidth = maxVisibleCount <= 2 ? Math.min(sparseCap, naturalBarWidth) : naturalBarWidth;
    const bodyWidth = Math.max(1, Math.round(barWidth * this.options.barWidthRatio) - 2);
    const halfBody = Math.floor(bodyWidth / 2);
    // anchor='right' draws the body so its right edge sits on the time tick,
    // letting the rightmost bar fit on canvas with padding.right = 0.
    const anchorOffset = this.options.anchor === 'right' ? bodyWidth : halfBody;

    // Collect data per layer, gating on alpha (not the binary store flag) so
    // a layer mid-fade still contributes shrinking geometry to the stack
    // instead of disappearing the moment `setLayerVisible(false)` flips the
    // store. Alpha=0 layers are pre-filtered to keep the timeMap clean.
    const layers = this.stores.map((store, li) =>
      this.getLayerAlpha(li) > 0 ? store.getVisibleData(range.from, range.to) : [],
    );
    if (layers.every((l) => l.length === 0)) return;

    // Per-layer value × alpha. The cumulative built from these values shrinks
    // toward "without this layer" as the layer fades; the Y axis is easing to
    // the same final bounds over `toggleMs`, so geometry and axis converge on
    // the same frame instead of the binary `isVisible()` jump that produced
    // the visible "stack collapses instantly" artifact in stacked modes.
    const timeMap = new Map<number, number[]>();
    for (let li = 0; li < layers.length; li++) {
      const alpha = this.getLayerAlpha(li);
      for (const d of layers[li]) {
        let arr = timeMap.get(d.time);
        if (!arr) {
          arr = new Array(layers.length).fill(0);
          timeMap.set(d.time, arr);
        }
        // Non-finite → 0 in the stack so one gap doesn't NaN-out the column.
        const raw = Number.isFinite(d.value) ? d.value : 0;
        arr[li] = this.effectiveValue(ctx, li, d.time, raw) * alpha;
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
      const color = this.options.colors[li % this.options.colors.length];

      for (const [time, values] of timeMap) {
        const raw = values[li];
        if (raw === 0) continue;

        const cx = timeScale.timeToBitmapX(time);

        // Sum of previous layers for stacking offset
        let basePositive = 0;
        let baseNegative = 0;
        for (let prev = 0; prev < li; prev++) {
          const v = values[prev];
          if (v > 0) basePositive += v;
          else baseNegative += v;
        }

        const progress = this.entranceProgress(ctx, li, time);
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
          // Normalize to 0–100%
          let totalPositive = 0;
          let totalNegative = 0;
          for (const v of values) {
            if (v > 0) totalPositive += v;
            else totalNegative += v;
          }

          if (raw > 0 && totalPositive > 0) {
            const pctBase = (basePositive / totalPositive) * 100;
            const pctTop = ((basePositive + raw) / totalPositive) * 100;
            const topY = yScale.valueToBitmapY(pctTop);
            const bottomY = yScale.valueToBitmapY(pctBase);
            const h = Math.max(1, bottomY - topY);
            this.drawAnimatedBar({
              context,
              progress,
              baselineY: bottomY,
              topY,
              barHeight: h,
              x: cx - anchorOffset,
              barWidth: bodyWidth,
              color,
              roundEdge,
              isProjected,
            });
          } else if (raw < 0 && totalNegative < 0) {
            const pctBase = (baseNegative / totalNegative) * -100;
            const pctTop = ((baseNegative + raw) / totalNegative) * -100;
            const topY = yScale.valueToBitmapY(pctBase);
            const bottomY = yScale.valueToBitmapY(pctTop);
            const h = Math.max(1, bottomY - topY);
            this.drawAnimatedBar({
              context,
              progress,
              baselineY: topY,
              topY,
              barHeight: h,
              x: cx - anchorOffset,
              barWidth: bodyWidth,
              color,
              roundEdge,
              isProjected,
            });
          }
        } else {
          if (raw > 0) {
            const topY = yScale.valueToBitmapY(basePositive + raw);
            const bottomY = yScale.valueToBitmapY(basePositive);
            const h = Math.max(1, bottomY - topY);
            this.drawAnimatedBar({
              context,
              progress,
              baselineY: bottomY,
              topY,
              barHeight: h,
              x: cx - anchorOffset,
              barWidth: bodyWidth,
              color,
              roundEdge,
              isProjected,
            });
          } else {
            const topY = yScale.valueToBitmapY(baseNegative);
            const bottomY = yScale.valueToBitmapY(baseNegative + raw);
            const h = Math.max(1, bottomY - topY);
            this.drawAnimatedBar({
              context,
              progress,
              baselineY: topY,
              topY,
              barHeight: h,
              x: cx - anchorOffset,
              barWidth: bodyWidth,
              color,
              roundEdge,
              isProjected,
            });
          }
        }
      }
    }
  }

  /**
   * Paint one bar through the resolved painter, applying any entrance transform
   * and per-bar alpha first. The painter owns the fill (and the rounded-corner
   * geometry); a projected bar is forced settled so its only alpha source is the
   * painter's translucent fill rather than a `globalAlpha` fade.
   */
  private drawAnimatedBar(bar: AnimatedBar): void {
    const pass = this.#pass;
    if (pass === null) return;

    const { context, baselineY, topY, barHeight, x, barWidth, color, roundEdge } = bar;
    const progress = bar.isProjected ? 1 : bar.progress;

    const style = this.options.entryAnimation ?? 'fade-grow';
    const t =
      progress >= 1 || style === 'none'
        ? { x, topY, barWidth, barHeight, alpha: 1 }
        : this.applyBarTransform(progress, baselineY, topY, barHeight, x, barWidth);

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

      return;
    }

    pass.painter(pass.env, args);
  }
}

import type { ChartTheme } from '../theme/types';
import type { PieLabelsOptions, PieSeriesOptions, PieSliceData } from '../types';
import { clamp, smoothToward } from '../utils/math';
import type { HoverInfo, RenderPadding, SeriesRenderContext, SeriesRenderer, SliceInfo } from './types';

const DEFAULT_LABELS: Required<PieLabelsOptions> = {
  mode: 'outside',
  content: 'both',
  fontSize: 11,
  // 0.05 rad ≈ 2.86°, i.e. slices down to ~0.8% of the pie still get
  // labeled. The de-cluster pass handles the resulting vertical crowding.
  // Raise via options when labels-per-slice becomes too dense.
  minSliceAngle: 0.05,
  elbowLen: 12,
  legPad: 6,
  labelGap: 1.4,
  balanceSides: true,
};

const DEFAULT_OPTIONS: PieSeriesOptions = {
  innerRadiusRatio: 0,
  padAngle: 0.02,
  stroke: { color: 'transparent', widthPx: 0 },
  sliceLabels: { ...DEFAULT_LABELS },
};

function mergeLabelOpts(existing: PieLabelsOptions | undefined, incoming: PieLabelsOptions): PieLabelsOptions {
  return { ...(existing ?? {}), ...incoming };
}

/** Resolve a `PieLabelsOptions` partial against {@link DEFAULT_LABELS}. */
function resolveLabels(labels: PieLabelsOptions | undefined): Required<PieLabelsOptions> {
  return { ...DEFAULT_LABELS, ...(labels ?? {}) };
}

const TWO_PI = Math.PI * 2;

/**
 * Inputs to {@link computePieGeometry}. Grouped into an object so the helper
 * stays within the project's 3-arg function budget even as outside labels
 * introduce a horizontal `labelReserve`.
 */
interface PieGeometryInput {
  bitmapWidth: number;
  bitmapHeight: number;
  padTop: number;
  padBottom: number;
  /**
   * Horizontal bitmap pixels reserved on each side for outside labels.
   * Subtracted from the width the pie is allowed to consume. Default 0.
   */
  labelReserve?: number;
}

/**
 * Pie-edge aesthetic margin. Keeps the painted disk from touching the canvas
 * edges even when the caller passes `labelReserve = 0`. The outside-label
 * reserve formula compensates for this by dividing by `PIE_FIT_FACTOR`, so
 * labels line up against the canvas edge rather than being eaten by the margin.
 */
const PIE_FIT_FACTOR = 0.85;

/**
 * Compute pie geometry inside an area shrunk by `padTop` / `padBottom`. The
 * pie is centered horizontally on the full width and vertically inside the
 * usable band — that's how it shifts down when a Title overlay reserves space.
 *
 * When `labelReserve > 0` the outer radius shrinks so leader-line labels fit
 * on either side. Inputs and outputs are all in bitmap pixels so the same
 * helper drives both `render` and `hitTest`.
 */
function computePieGeometry(input: PieGeometryInput): { cx: number; cy: number; maxR: number } {
  const { bitmapWidth, bitmapHeight, padTop, padBottom } = input;
  const reserve = Math.max(0, input.labelReserve ?? 0);

  // Clamp padding so it never exceeds the bitmap. Without the upper bound a
  // malformed setPadding can push `cy` past the bottom edge — the resulting
  // pie has zero radius and would render off-screen anyway, but keeping `cy`
  // inside the bitmap avoids surprising downstream math (shadows, gradients,
  // future overlays that read the center).
  const top = Math.min(Math.max(0, padTop), bitmapHeight);
  const bottom = Math.min(Math.max(0, padBottom), bitmapHeight - top);
  const usableHeight = bitmapHeight - top - bottom;
  const usableWidth = Math.max(0, bitmapWidth - 2 * reserve);

  const cx = bitmapWidth / 2;
  const cy = top + usableHeight / 2;
  const maxR = Math.max(0, (Math.min(usableWidth, usableHeight) / 2) * PIE_FIT_FACTOR);

  return { cx, cy, maxR };
}

function isLightColor(hex: string): boolean {
  if (!hex.startsWith('#')) return false;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return r * 0.299 + g * 0.587 + b * 0.114 > 150;
}

/**
 * Layout record for a single outside label. `anchorX/Y` is the dot on the
 * slice edge (never moves). `elbowX/Y` is the radial kink point out from the
 * anchor along the slice midangle (also never moves after layout). `labelY`
 * is the text / rail y **after** the de-cluster pass — may differ from
 * `elbowY` when neighbors on the same side got pushed apart. Used only
 * during a render pass; not persisted between frames.
 */
interface OutsideLabelLayout {
  anchorX: number;
  anchorY: number;
  elbowX: number;
  elbowY: number;
  side: 1 | -1;
  labelY: number;
  text: string;
  color: string;
}

function lightenColor(hex: string, amount: number): string {
  if (!hex.startsWith('#')) return hex;
  const r = Math.min(255, parseInt(hex.slice(1, 3), 16) + Math.round(255 * amount));
  const g = Math.min(255, parseInt(hex.slice(3, 5), 16) + Math.round(255 * amount));
  const b = Math.min(255, parseInt(hex.slice(5, 7), 16) + Math.round(255 * amount));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

export class PieRenderer implements SeriesRenderer {
  #data: PieSliceData[] = [];
  #options: PieSeriesOptions;
  /** Index of the hovered slice (-1 = none). Set via {@link setHoverIndex}. */
  #hoverIndex = -1;
  /** Animated offset per slice (0..1), smoothly interpolated toward target. */
  #sliceOffsets: number[] = [];
  #lastRenderTime = 0;
  /**
   * Outside-label reveal progress (0..1). Eased toward 1 on mount / data-swap,
   * drives the leader-line draw-in and label fade-in stagger. Only tweened
   * when `sliceLabels.mode === 'outside'`.
   */
  #labelReveal = 0;
  /**
   * Cached horizontal bitmap-pixel reserve for outside labels. Invalidated on
   * `setData` / `updateOptions`; computed lazily on first `render` call per
   * frame using the live canvas context for accurate `measureText`.
   */
  #labelReserveCache: { fontScale: number; font: string; reserve: number } | null = null;
  /** Subscribers notified on setData (pie has no TimeSeriesStore to piggy-back on). */
  #dataListeners: Array<() => void> = [];

  constructor(options?: Partial<PieSeriesOptions>) {
    this.#options = this.#mergeOptions(DEFAULT_OPTIONS, options ?? {});
  }

  /**
   * Merge partial options onto a base, deep-merging `sliceLabels` so callers
   * can override one field (e.g. `mode`) without dropping sibling defaults.
   */
  #mergeOptions(base: PieSeriesOptions, incoming: Partial<PieSeriesOptions>): PieSeriesOptions {
    const merged: PieSeriesOptions = { ...base, ...incoming };
    if (incoming.sliceLabels !== undefined) {
      merged.sliceLabels = mergeLabelOpts(base.sliceLabels, incoming.sliceLabels);
    }

    return merged;
  }

  getData(): PieSliceData[] {
    return this.#data;
  }

  setData(data: unknown): void {
    const slices = (data ?? []) as PieSliceData[];
    this.#data = slices;
    this.#sliceOffsets = new Array(slices.length).fill(0);
    this.#labelReveal = 0;
    this.#labelReserveCache = null;
    for (const listener of this.#dataListeners) {
      listener();
    }
  }

  onDataChanged(listener: () => void): () => void {
    this.#dataListeners.push(listener);
    return () => {
      const i = this.#dataListeners.indexOf(listener);
      if (i >= 0) this.#dataListeners.splice(i, 1);
    };
  }

  updateOptions(options: Partial<PieSeriesOptions>): void {
    const prevMode = this.#options.sliceLabels?.mode;
    this.#options = this.#mergeOptions(this.#options, options ?? {});
    const nextMode = this.#options.sliceLabels?.mode;

    // Reveal animation restarts when outside-mode is newly engaged so the
    // leader lines draw in, rather than popping into place.
    if (nextMode === 'outside' && prevMode !== 'outside') {
      this.#labelReveal = 0;
    }

    this.#labelReserveCache = null;
  }

  getColor(): string {
    return this.#data[0]?.color ?? this.#options.colors?.[0] ?? '#888';
  }

  getLayerCount(): number {
    return 1;
  }

  setLayerVisible(_index: number, _visible: boolean): void {
    // Pie doesn't have layers.
  }

  isLayerVisible(_index: number): boolean {
    return true;
  }

  getLayerColors(): string[] {
    return [this.getColor()];
  }

  applyTheme(theme: ChartTheme, prev: ChartTheme): void {
    // Pie derives colors from the active theme at render time via the palette,
    // so no cached paint state to rewrite. But the outside-label reserve is
    // measured against the live font and cached — typography changes must
    // invalidate it so hitTest (which reads the cache ahead of the next render)
    // doesn't use a stale reserve from the previous theme.
    if (theme.typography.fontFamily !== prev.typography.fontFamily) {
      this.#labelReserveCache = null;
    }
  }

  /** Hit-test: which slice is at this bitmap coordinate? Returns index or -1. */
  hitTest(bx: number, by: number, bitmapWidth: number, bitmapHeight: number, padding?: RenderPadding): number {
    if (this.#data.length === 0) return -1;

    const total = this.#data.reduce((sum, d) => sum + d.value, 0);
    if (total <= 0) return -1;

    // Fall back to the cached reserve if `render` has run at least once.
    // Before the first render the reserve is 0 — hit-testing against a
    // slightly-larger pie is harmless for the single frame it takes the
    // renderer to prime.
    const labelReserve = this.#labelReserveCache?.reserve ?? 0;
    const { cx, cy, maxR } = computePieGeometry({
      bitmapWidth,
      bitmapHeight,
      padTop: padding?.top ?? 0,
      padBottom: padding?.bottom ?? 0,
      labelReserve,
    });
    const outerR = maxR;
    const innerR = outerR * this.#options.innerRadiusRatio;

    const dx = bx - cx;
    const dy = by - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > outerR || dist < innerR) return -1;

    // Angle from top (matching render start)
    let mouseAngle = Math.atan2(dy, dx) + Math.PI / 2;
    if (mouseAngle < 0) mouseAngle += TWO_PI;

    let angle = 0;
    for (let i = 0; i < this.#data.length; i++) {
      const sliceAngle = (this.#data[i].value / total) * TWO_PI;
      if (mouseAngle >= angle && mouseAngle < angle + sliceAngle) return i;

      angle += sliceAngle;
    }

    return -1;
  }

  setHoverIndex(index: number): boolean {
    if (this.#hoverIndex === index) return false;

    this.#hoverIndex = index;

    return true;
  }

  getHoverIndex(): number {
    return this.#hoverIndex;
  }

  getHoverInfo(theme: ChartTheme): HoverInfo | null {
    if (this.#hoverIndex < 0) return null;

    const slice = this.#data[this.#hoverIndex];
    if (!slice) return null;

    const total = this.#data.reduce((sum, d) => sum + d.value, 0);
    const palette = this.#options.colors ?? theme.seriesColors;

    return {
      label: slice.label,
      value: slice.value,
      percent: total > 0 ? (slice.value / total) * 100 : 0,
      color: slice.color ?? palette[this.#hoverIndex % palette.length],
    };
  }

  getSliceInfo(theme: ChartTheme): SliceInfo[] | null {
    if (this.#data.length === 0) return null;

    const total = this.#data.reduce((sum, d) => sum + d.value, 0);
    const palette = this.#options.colors ?? theme.seriesColors;

    return this.#data.map((d, i) => ({
      label: d.label,
      value: d.value,
      percent: total > 0 ? (d.value / total) * 100 : 0,
      color: d.color ?? palette[i % palette.length],
    }));
  }

  /** Returns true if animation is still in progress. */
  get needsAnimation(): boolean {
    for (let i = 0; i < this.#sliceOffsets.length; i++) {
      const target = i === this.#hoverIndex ? 1 : 0;
      if (Math.abs(this.#sliceOffsets[i] - target) > 0.01) return true;
    }
    if (this.#options.sliceLabels?.mode === 'outside' && this.#labelReveal < 0.99) return true;

    return false;
  }

  dispose(): void {
    this.#dataListeners = [];
    this.#data = [];
    this.#sliceOffsets = [];
    this.#lastRenderTime = 0;
  }

  /**
   * @internal Test-only accessor for the animated slice offsets. The backing
   * `#sliceOffsets` field is ECMAScript-private and can't be reached via a
   * type-cast escape hatch, so the pie-animation regression tests use this
   * method to assert convergence behavior. Do not call from production code.
   */
  _inspectSliceOffsets(): readonly number[] {
    return this.#sliceOffsets;
  }

  /** Build the text shown for one slice given the resolved content mode. */
  #formatSliceLabel(slice: PieSliceData, total: number, content: Required<PieLabelsOptions>['content']): string {
    const percent = total > 0 ? (slice.value / total) * 100 : 0;
    const pctText = `${percent.toFixed(percent >= 10 ? 0 : 1)}%`;

    if (content === 'percent') return pctText;
    if (content === 'label') return slice.label;

    return `${slice.label}  ${pctText}`;
  }

  /**
   * Bitmap-pixel horizontal reserve needed for outside labels. Measured using
   * the live `context` so font metrics match the paint path exactly. Cached
   * until `setData` / `updateOptions` fires (`#labelReserveCache` is cleared).
   *
   * Keyed by both `fontScale` (= `horizontalPixelRatio` — HiDPI changes) and
   * the active `context.font` string so a theme swap that changes the font
   * family / size busts the cache and triggers a fresh measurement.
   */
  #computeLabelReserve(
    context: CanvasRenderingContext2D,
    labels: Required<PieLabelsOptions>,
    total: number,
    fontScale: number,
  ): number {
    const font = context.font;
    if (
      this.#labelReserveCache &&
      this.#labelReserveCache.fontScale === fontScale &&
      this.#labelReserveCache.font === font
    ) {
      return this.#labelReserveCache.reserve;
    }

    let maxWidth = 0;
    for (const slice of this.#data) {
      const text = this.#formatSliceLabel(slice, total, labels.content);
      const w = context.measureText(text).width;
      if (w > maxWidth) maxWidth = w;
    }

    // A label's horizontal extent past the pie edge is:
    //   elbow radial leg (elbowLen) + horizontal rail (elbowLen) + legPad + text
    // Plus a small safety cushion so rounded line caps don't brush the edge.
    // Divide by PIE_FIT_FACTOR because `computePieGeometry` shrinks the final
    // radius by the same factor — without this compensation the reserve would
    // undershoot on narrow canvases and labels would clip at the edge.
    const extent = maxWidth + (2 * labels.elbowLen + labels.legPad + 4) * fontScale;
    const reserve = extent / PIE_FIT_FACTOR;

    this.#labelReserveCache = { fontScale, font, reserve };

    return reserve;
  }

  /**
   * Draw one outside label: anchor dot → radial elbow (per-slice, at slice
   * midangle) → short diagonal to the de-cluster-adjusted rail y → horizontal
   * rail → text. Keeping the elbow local to each slice is what stops leader
   * lines from cutting across the pie when several small slices cluster near
   * 12 o'clock or 6 o'clock.
   */
  #drawOutsideLabel(args: {
    context: CanvasRenderingContext2D;
    entry: OutsideLabelLayout;
    textColor: string;
    labels: Required<PieLabelsOptions>;
    hpr: number;
    progress: number;
  }): void {
    const { context, entry, textColor, labels, hpr, progress } = args;

    if (progress <= 0) return;

    const { anchorX, anchorY, elbowX, elbowY, side, text, color, labelY } = entry;
    // Horizontal rail departs from the local elbow and ends one `elbowLen`
    // further out, yielding a stable text column that sits just outside the
    // pie on each side. Text then sits `legPad` past the rail end.
    const railEndX = elbowX + side * labels.elbowLen * hpr;
    const textX = railEndX + side * labels.legPad * hpr;

    // Progress drives a three-segment draw-in: anchor dot → elbow → rail/text.
    // Weights 0.15 / 0.45 / 0.40 make the dot pop first, then the diagonal
    // grows, then the horizontal rail slides out with the text.
    const dotP = clamp(progress / 0.15, 0, 1);
    const elbowP = clamp((progress - 0.15) / 0.45, 0, 1);
    const railP = clamp((progress - 0.6) / 0.4, 0, 1);

    context.save();
    context.globalAlpha = dotP;
    context.fillStyle = color;
    context.beginPath();
    context.arc(anchorX, anchorY, 2.5 * hpr, 0, TWO_PI);
    context.fill();
    context.restore();

    if (elbowP > 0) {
      context.save();
      context.globalAlpha = elbowP;
      context.strokeStyle = color;
      context.lineWidth = 1 * hpr;
      context.lineCap = 'round';
      context.beginPath();
      context.moveTo(anchorX, anchorY);

      // Segment 1: anchor → local elbow (natural radial direction).
      const segAX = anchorX + (elbowX - anchorX) * elbowP;
      const segAY = anchorY + (elbowY - anchorY) * elbowP;
      context.lineTo(segAX, segAY);

      if (railP > 0) {
        // Segment 2: elbow → (railEndX, labelY). Single diagonal absorbs both
        // the horizontal reach and any vertical de-cluster shift — avoids a
        // visible vertical kink when `labelY` differs from `elbowY`.
        const segBX = elbowX + (railEndX - elbowX) * railP;
        const segBY = elbowY + (labelY - elbowY) * railP;
        context.lineTo(segBX, segBY);
      }

      context.stroke();
      context.restore();
    }

    if (railP > 0) {
      context.save();
      context.globalAlpha = railP;
      context.fillStyle = textColor;
      context.textAlign = side >= 0 ? 'left' : 'right';
      context.textBaseline = 'middle';
      context.fillText(text, textX, labelY);
      context.restore();
    }
  }

  /**
   * Lay out one outside label per eligible slice. Returns entries in original
   * slice order so the caller can map by index to reveal progress / explode.
   *
   * Three-stage pipeline:
   *
   * 1. **Near-pole side rebalance** (when `labels.balanceSides`). Slices
   *    whose midangle is within ~30° of the pole (|cos| < 0.3) have ambiguous
   *    geometric sides. Reassign them to whichever side has fewer committed
   *    (non-ambiguous) labels, then balance subsequent ambiguous ones against
   *    the running count. Avoids the "two small pole slices tangling on the
   *    already-crowded side" pattern.
   *
   * 2. **Pool-Adjacent-Violators (PAV) symmetric packing** per side. Sort
   *    labels by ideal y (the elbow y at slice midangle), then form groups:
   *    when a new label's top would overlap the previous group's bottom (at
   *    `minGap` spacing), merge. Merged group centers at the weighted mean
   *    of member ideals. Cascade-merge if the merged group now overlaps its
   *    predecessor. Classic O(n log n) due to the sort; merging is O(n).
   *    Minimises squared displacement from ideal — no top/bottom bias.
   *
   * 3. **Elbow re-anchor**. After PAV, set `elbowY := labelY` and recompute
   *    `elbowX` so the elbow still sits on a circle of radius `elbowLen*hpr`
   *    around the anchor. The rail segment is then pure horizontal, which
   *    removes the kink caused by the earlier two-pass algorithm's diagonal
   *    from `(elbowX, elbowY)` to `(railEndX, labelY)` when labels were
   *    pushed far from their ideal y.
   */
  #layoutOutsideLabels(args: {
    cx: number;
    cy: number;
    outerR: number;
    total: number;
    palette: readonly string[];
    labels: Required<PieLabelsOptions>;
    hpr: number;
    bitmapHeight: number;
  }): Array<OutsideLabelLayout | null> {
    const { cx, cy, outerR, total, palette, labels, hpr, bitmapHeight } = args;
    const entries: Array<OutsideLabelLayout | null> = new Array(this.#data.length).fill(null);
    const elbowRadial = labels.elbowLen * hpr;

    type Pending = { entry: OutsideLabelLayout; midCos: number };
    const pending: Pending[] = [];

    let angle = -Math.PI / 2;

    for (let i = 0; i < this.#data.length; i++) {
      const slice = this.#data[i];
      const sliceAngle = (slice.value / total) * TWO_PI;

      if (sliceAngle >= labels.minSliceAngle) {
        const midAngle = angle + sliceAngle / 2;
        const explodeOffset = this.#sliceOffsets[i] * (8 * hpr);
        const cos = Math.cos(midAngle);
        const sin = Math.sin(midAngle);
        const side: 1 | -1 = cos >= 0 ? 1 : -1;
        const anchorX = cx + cos * (outerR + explodeOffset);
        const anchorY = cy + sin * (outerR + explodeOffset);
        const elbowX = cx + cos * (outerR + explodeOffset + elbowRadial);
        const elbowY = cy + sin * (outerR + explodeOffset + elbowRadial);

        const entry: OutsideLabelLayout = {
          anchorX,
          anchorY,
          elbowX,
          elbowY,
          side,
          labelY: elbowY,
          text: this.#formatSliceLabel(slice, total, labels.content),
          color: slice.color ?? palette[i % palette.length],
        };
        entries[i] = entry;
        pending.push({ entry, midCos: cos });
      }

      angle += sliceAngle;
    }

    // Stage 1: near-pole rebalance. Keep anchor geometry intact — only the
    // `side` field flips. The re-anchor pass at the end computes a fresh
    // elbowX consistent with the new side.
    if (labels.balanceSides) {
      const POLE_COS = 0.3;
      let left = 0;
      let right = 0;
      for (const p of pending) {
        if (Math.abs(p.midCos) >= POLE_COS) {
          if (p.entry.side === 1) right++;
          else left++;
        }
      }

      for (const p of pending) {
        if (Math.abs(p.midCos) >= POLE_COS) continue;

        // Iterative balance: treat each ambiguous label as committed once
        // placed, so a run of pole slices distributes instead of all piling
        // onto the initially-thinner side.
        const preferred: 1 | -1 = left < right ? -1 : 1;
        p.entry.side = preferred;
        if (preferred === 1) right++;
        else left++;
      }
    }

    // Stage 2: PAV packing per side.
    const minGap = Math.max(1, labels.fontSize * labels.labelGap) * hpr;
    const topBound = labels.fontSize * hpr;
    const bottomBound = bitmapHeight - labels.fontSize * hpr;

    for (const side of [1, -1] as const) {
      const onSide: OutsideLabelLayout[] = [];
      for (const p of pending) {
        if (p.entry.side === side) onSide.push(p.entry);
      }
      if (onSide.length === 0) continue;

      onSide.sort((a, b) => a.elbowY - b.elbowY);

      // Each group covers onSide[startIdx..startIdx+count-1]. Center is the
      // weighted mean of member ideal y's (sumIdeal / count); members occupy
      // [center - (count-1)*minGap/2 .. center + (count-1)*minGap/2] at
      // minGap spacing.
      type Group = { count: number; sumIdeal: number; startIdx: number };
      const groups: Group[] = [];

      for (let i = 0; i < onSide.length; i++) {
        groups.push({ count: 1, sumIdeal: onSide[i].elbowY, startIdx: i });

        // Cascade-merge while the last group's top overlaps the previous
        // group's bottom at minGap spacing.
        while (groups.length >= 2) {
          const a = groups[groups.length - 2];
          const b = groups[groups.length - 1];
          const aCenter = a.sumIdeal / a.count;
          const bCenter = b.sumIdeal / b.count;
          const aBottom = aCenter + ((a.count - 1) * minGap) / 2;
          const bTop = bCenter - ((b.count - 1) * minGap) / 2;

          if (bTop >= aBottom + minGap) break;

          a.count += b.count;
          a.sumIdeal += b.sumIdeal;
          groups.pop();
        }
      }

      // Bound fixup. Shift the first group down if it pokes above topBound,
      // cascade-merging forward; then shift the last group up if it pokes
      // below bottomBound, cascade-merging backward. If the result is a
      // single group taller than the viewport, center it — a few labels at
      // the edges is the least-bad option for a fully-saturated side.
      if (groups.length > 0) {
        const first = groups[0];
        const fCenter = first.sumIdeal / first.count;
        const fTop = fCenter - ((first.count - 1) * minGap) / 2;
        if (fTop < topBound) {
          first.sumIdeal += (topBound - fTop) * first.count;

          while (groups.length >= 2) {
            const a = groups[0];
            const b = groups[1];
            const aCenter = a.sumIdeal / a.count;
            const bCenter = b.sumIdeal / b.count;
            const aBottom = aCenter + ((a.count - 1) * minGap) / 2;
            const bTop = bCenter - ((b.count - 1) * minGap) / 2;
            if (bTop >= aBottom + minGap) break;

            a.count += b.count;
            a.sumIdeal += b.sumIdeal;
            groups.splice(1, 1);
          }
        }
      }

      if (groups.length > 0) {
        const last = groups[groups.length - 1];
        const lCenter = last.sumIdeal / last.count;
        const lBottom = lCenter + ((last.count - 1) * minGap) / 2;
        if (lBottom > bottomBound) {
          last.sumIdeal -= (lBottom - bottomBound) * last.count;

          while (groups.length >= 2) {
            const a = groups[groups.length - 2];
            const b = groups[groups.length - 1];
            const aCenter = a.sumIdeal / a.count;
            const bCenter = b.sumIdeal / b.count;
            const aBottom = aCenter + ((a.count - 1) * minGap) / 2;
            const bTop = bCenter - ((b.count - 1) * minGap) / 2;
            if (bTop >= aBottom + minGap) break;

            a.count += b.count;
            a.sumIdeal += b.sumIdeal;
            groups.pop();
          }
        }
      }

      // Saturation fallback: a single oversized group gets centered.
      const viewCenter = (topBound + bottomBound) / 2;
      for (const g of groups) {
        const span = (g.count - 1) * minGap;
        const c = g.sumIdeal / g.count;
        if (span > bottomBound - topBound && c - span / 2 < topBound) {
          g.sumIdeal = viewCenter * g.count;
        }
      }

      // Emit final labelY per member.
      for (const g of groups) {
        const center = g.sumIdeal / g.count;
        for (let k = 0; k < g.count; k++) {
          const e = onSide[g.startIdx + k];
          e.labelY = center + (k - (g.count - 1) / 2) * minGap;
        }
      }
    }

    // Stage 3: re-anchor elbow so the rail segment is horizontal. Places the
    // elbow on a circle of radius elbowRadial around the anchor at the y
    // matching labelY; falls back to a half-radial horizontal nub when the
    // vertical offset exceeds the radial budget.
    for (const p of pending) {
      const e = p.entry;
      const dy = e.labelY - e.anchorY;
      let dx: number;
      if (Math.abs(dy) <= elbowRadial) {
        dx = e.side * Math.sqrt(Math.max(0, elbowRadial * elbowRadial - dy * dy));
      } else {
        dx = e.side * elbowRadial * 0.5;
      }
      e.elbowX = e.anchorX + dx;
      e.elbowY = e.labelY;
    }

    return entries;
  }

  render(ctx: SeriesRenderContext): void {
    if (this.#data.length === 0) return;

    const { scope, theme, padding } = ctx;
    const { context, bitmapSize, horizontalPixelRatio, verticalPixelRatio } = scope;

    const now = performance.now();
    // Clamp dt: when the renderer goes idle (animation finished, no markDirty),
    // `lastRenderTime` is stale by however long the user paused. An unclamped dt
    // makes the next hover snap to its target in one frame — which looks like
    // "animation stopped working" after the first burst of activity.
    const dt = this.#lastRenderTime ? Math.min(0.05, (now - this.#lastRenderTime) / 1000) : 0;
    this.#lastRenderTime = now;

    const total = this.#data.reduce((sum, d) => sum + d.value, 0);
    if (total <= 0) return;

    // Animate slice offsets toward 1 (hovered) or 0 (resting).
    const hoverRate = 12; // exponential decay rate; higher = snappier
    while (this.#sliceOffsets.length < this.#data.length) {
      this.#sliceOffsets.push(0);
    }
    for (let i = 0; i < this.#data.length; i++) {
      const target = i === this.#hoverIndex ? 1 : 0;
      this.#sliceOffsets[i] = smoothToward(this.#sliceOffsets[i], target, hoverRate, dt);
    }

    const labels = resolveLabels(this.#options.sliceLabels);

    // Tween reveal whenever outside-mode is active, even at progress=1, so the
    // branch stays inert (no-op) once converged. Font set before measuring so
    // `measureText` reports paint-accurate widths.
    context.font = `${labels.fontSize * horizontalPixelRatio}px ${theme.typography.fontFamily}`;
    if (labels.mode === 'outside') {
      this.#labelReveal = smoothToward(this.#labelReveal, 1, 6, dt);
    }

    const palette = this.#options.colors ?? theme.seriesColors;
    const labelReserve =
      labels.mode === 'outside' ? this.#computeLabelReserve(context, labels, total, horizontalPixelRatio) : 0;

    // Padding arrives in CSS pixels; geometry is in bitmap pixels.
    const { cx, cy, maxR } = computePieGeometry({
      bitmapWidth: bitmapSize.width,
      bitmapHeight: bitmapSize.height,
      padTop: padding.top * verticalPixelRatio,
      padBottom: padding.bottom * verticalPixelRatio,
      labelReserve,
    });
    const outerR = maxR;
    const innerR = outerR * this.#options.innerRadiusRatio;
    const pad = this.#options.padAngle;
    const { color: strokeColor, widthPx: strokeWidth } = this.#options.stroke;
    const explodeDistance = 8 * horizontalPixelRatio;

    let angle = -Math.PI / 2;

    // Draw slices
    for (let i = 0; i < this.#data.length; i++) {
      const slice = this.#data[i];
      const sliceAngle = (slice.value / total) * TWO_PI;
      const startAngle = angle + pad / 2;
      const endAngle = angle + sliceAngle - pad / 2;
      const midAngle = angle + sliceAngle / 2;
      const color = slice.color ?? palette[i % palette.length];

      // Degenerate slice — sliceAngle collapses below padAngle, leaving no
      // visible wedge once the two pad/2 gaps are carved out. Advance the
      // cursor and skip the fill; if we didn't, canvas.arc would interpret
      // the inverted start/end as an anticlockwise sweep and fill nearly
      // the whole disk with this slice's color.
      if (endAngle <= startAngle) {
        angle += sliceAngle;
        continue;
      }

      // Explode offset
      const offset = this.#sliceOffsets[i] * explodeDistance;
      const ox = Math.cos(midAngle) * offset;
      const oy = Math.sin(midAngle) * offset;
      const sliceCx = cx + ox;
      const sliceCy = cy + oy;

      context.beginPath();
      context.arc(sliceCx, sliceCy, outerR, startAngle, endAngle);
      if (innerR > 0) {
        context.arc(sliceCx, sliceCy, innerR, endAngle, startAngle, true);
      } else {
        context.lineTo(sliceCx, sliceCy);
      }
      context.closePath();

      // Radial gradient for depth
      const grad = context.createRadialGradient(sliceCx, sliceCy, innerR || 0, sliceCx, sliceCy, outerR);
      grad.addColorStop(0, lightenColor(color, 0.15));
      grad.addColorStop(1, color);
      context.fillStyle = grad;
      if (this.#sliceOffsets[i] > 0.01) {
        context.shadowColor = 'rgba(0,0,0,0.25)';
        context.shadowBlur = 12 * horizontalPixelRatio * this.#sliceOffsets[i];
        context.shadowOffsetX = ox * 0.3;
        context.shadowOffsetY = oy * 0.3;
      }
      context.fill();
      context.shadowColor = 'transparent';
      context.shadowBlur = 0;
      context.shadowOffsetX = 0;
      context.shadowOffsetY = 0;

      if (strokeWidth > 0 && strokeColor !== 'transparent') {
        context.strokeStyle = strokeColor;
        context.lineWidth = strokeWidth;
        context.stroke();
      }

      angle += sliceAngle;
    }

    if (labels.mode === 'none') return;

    // Labels pass — mode dispatches to either on-slice text (inside) or
    // leader-line layout (outside). `measureText` uses the font set above.
    angle = -Math.PI / 2;

    const textColor = theme.tooltip.textColor;

    if (labels.mode === 'outside') {
      const layout = this.#layoutOutsideLabels({
        cx,
        cy,
        outerR,
        total,
        palette,
        labels,
        hpr: horizontalPixelRatio,
        bitmapHeight: bitmapSize.height,
      });

      // Stagger step scales down at high slice counts so the last slice's
      // start never exceeds 0.9 of the reveal — fixes the ≥17-slice case
      // where a fixed 0.06 step pushed `staggerStart` past 1, making the
      // denominator `1 - staggerStart` go negative and slices 17+ pop to
      // full opacity on frame 1.
      const staggerStep = layout.length > 1 ? Math.min(0.06, 0.9 / (layout.length - 1)) : 0;

      for (let i = 0; i < layout.length; i++) {
        const entry = layout[i];
        if (entry === null) continue;

        const staggerStart = i * staggerStep;
        const progress = clamp((this.#labelReveal - staggerStart) / (1 - staggerStart), 0, 1);
        this.#drawOutsideLabel({
          context,
          entry,
          textColor,
          labels,
          hpr: horizontalPixelRatio,
          progress,
        });
      }

      return;
    }

    // inside mode
    const labelR = innerR > 0 ? (outerR + innerR) / 2 : outerR * 0.65;
    context.textAlign = 'center';
    context.textBaseline = 'middle';

    for (let i = 0; i < this.#data.length; i++) {
      const slice = this.#data[i];
      const sliceAngle = (slice.value / total) * TWO_PI;
      if (sliceAngle >= labels.minSliceAngle) {
        const midAngle = angle + sliceAngle / 2;
        const offset = this.#sliceOffsets[i] * explodeDistance;
        const sliceColor = slice.color ?? palette[i % palette.length];
        const text = this.#formatSliceLabel(slice, total, labels.content);

        // Skip when the text won't fit the slice chord at `labelR`, or when a
        // donut ring is too thin for the font. Only enforce the chord check
        // for slices narrower than a half-circle — `2 * labelR * sin(θ/2)`
        // is the chord between two points `θ` apart, which is a useful
        // width bound only while `θ < π`. Wide slices (> 180°) have more
        // than half the disk available and the chord formula would start
        // shrinking again, falsely reporting "no fit" for a slice that
        // visibly has tons of room.
        const textWidth = context.measureText(text).width;
        const minRing = labels.fontSize * 1.2 * horizontalPixelRatio;
        const chord = sliceAngle < Math.PI ? 2 * labelR * Math.sin(sliceAngle / 2) : 2 * labelR;
        const tooNarrow = textWidth > chord - 4 * horizontalPixelRatio;
        const tooThin = innerR > 0 && labelR - innerR < minRing;
        if (!tooNarrow && !tooThin) {
          const lx = cx + Math.cos(midAngle) * (labelR + offset);
          const ly = cy + Math.sin(midAngle) * (labelR + offset);
          context.fillStyle = isLightColor(sliceColor) ? '#000000' : '#ffffff';
          context.fillText(text, lx, ly);
        }
      }
      angle += sliceAngle;
    }
  }
}

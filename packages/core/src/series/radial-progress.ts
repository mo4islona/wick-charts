import { DEFAULT_RADIAL_PROGRESS_ENTRY, DEFAULT_RADIAL_PROGRESS_UPDATE } from '../animation/config';
import { easeInOutCubic } from '../animation/easing';
import { prefersReducedMotion } from '../animation/reduced-motion';
import type { ChartTheme } from '../theme/types';
import type { PieSliceData, PieSliceInput, RadialProgressSeriesOptions } from '../types';
import { clamp } from '../utils/math';
import { warnDataOnce } from '../utils/poisoned-data-reporter';
import type { SeriesDefinition } from './definition';
import type { PaintEnv } from './painters/types';
import {
  type Bounds,
  TRACK_FADE_SHARE,
  ValueTween,
  bearingToCanvas,
  drawingBox,
  includeArc,
  includePoint,
  resolveGaugeTheme,
} from './radial';
import {
  type RadialItem,
  type RadialLabelPainter,
  type RadialLayout,
  type RingPainter,
  type RingSlot,
  ringsLayout,
  solidRing,
} from './radial-progress-styles';
import type { RadialProgressSeriesRenderer, SeriesRenderContext, SliceInfo } from './types';

interface ResolvedRadialProgressOptions {
  max: number;
  startAngle: number;
  endAngle: number;
  layout: RadialLayout;
  painter: RingPainter;
  labels?: RadialLabelPainter;
  colors?: string[];
  trackColor?: string;
  entryMs: number;
  updateMs: number;
}

/** Room under an arc open at the bottom, in units of the outer radius: the end caps and a line of center text. */
const BASE_ROOM = 0.24;

const DEFAULT_OPTIONS: ResolvedRadialProgressOptions = {
  max: 100,
  startAngle: 0,
  endAngle: 360,
  layout: ringsLayout(),
  painter: solidRing(),
  entryMs: DEFAULT_RADIAL_PROGRESS_ENTRY,
  updateMs: DEFAULT_RADIAL_PROGRESS_UPDATE,
};

/** Merge `incoming` over `base`; a key set to `undefined` goes back to its default. */
function normalize(
  base: ResolvedRadialProgressOptions,
  incoming: Partial<RadialProgressSeriesOptions>,
): ResolvedRadialProgressOptions {
  const merged = { ...base, ...incoming };

  return {
    max: merged.max ?? DEFAULT_OPTIONS.max,
    startAngle: merged.startAngle ?? DEFAULT_OPTIONS.startAngle,
    endAngle: merged.endAngle ?? DEFAULT_OPTIONS.endAngle,
    layout: merged.layout ?? DEFAULT_OPTIONS.layout,
    painter: merged.painter ?? DEFAULT_OPTIONS.painter,
    labels: merged.labels,
    colors: merged.colors,
    trackColor: merged.trackColor,
    entryMs: Math.max(0, merged.entryMs ?? DEFAULT_OPTIONS.entryMs),
    updateMs: Math.max(0, merged.updateMs ?? DEFAULT_OPTIONS.updateMs),
  };
}

export class RadialProgressRenderer implements RadialProgressSeriesRenderer {
  readonly kind = 'radialProgress' as const;

  #options: ResolvedRadialProgressOptions;
  #theme: ChartTheme;
  #data: PieSliceData[] = [];
  /** One per ring, in data order. */
  #tweens: ValueTween[] = [];
  /** Opacity of the tracks; 0 → 1 on the first data. */
  #fade = new ValueTween(1);
  /** Per ring, the state its painter keeps between frames. */
  #memos: Record<string, unknown>[] = [];
  /** A painter asked for another frame on the last render. */
  #paintersAnimating = false;
  #dataListeners: Array<() => void> = [];

  constructor(args: { options?: Partial<RadialProgressSeriesOptions>; theme: ChartTheme }) {
    this.#options = normalize(DEFAULT_OPTIONS, args.options ?? {});
    this.#theme = args.theme;
  }

  getData(): PieSliceData[] {
    return this.#data;
  }

  /** Replace the rings. Each ring glides from what is on screen; the first data sweeps every ring up from 0. */
  setData(data: unknown): void {
    const rows = (data ?? []) as PieSliceInput[];
    // A `null` or non-finite value is no reading: an empty ring that the legend reports as 0.
    const next = rows.map((row) => {
      const value = typeof row.value === 'number' && Number.isFinite(row.value) ? row.value : 0;

      return { ...row, value };
    });
    this.#reportNegative(next);

    const first = this.#data.length === 0 && next.length > 0;
    const now = performance.now();

    if (first) {
      this.#fade = new ValueTween(0);
      this.#fade.retarget({ to: 1, durationMs: this.#options.entryMs * TRACK_FADE_SHARE, now });
    }

    this.#memos = next.map((_, i) => (first ? undefined : this.#memos[i]) ?? {});
    this.#tweens = next.map((row, i) => {
      const tween = (first ? undefined : this.#tweens[i]) ?? new ValueTween(0);
      if (tween.target === row.value) return tween;

      const durationMs = first ? this.#options.entryMs : this.#options.updateMs;
      tween.retarget({ to: row.value, durationMs, now, easing: first ? easeInOutCubic : undefined });

      return tween;
    });
    this.#data = next;

    for (const listener of this.#dataListeners) {
      listener();
    }
  }

  #reportNegative(rows: PieSliceData[]): void {
    const negative = rows.filter((row) => row.value < 0);
    if (negative.length === 0) return;

    const [first] = negative;
    warnDataOnce({
      token: this,
      topic: 'radial-negative',
      message:
        `radial progress: ${negative.length} ring(s) below 0, first "${first.label}" with value ${first.value}. ` +
        'A ring fills from 0 to `max`; a negative value draws an empty ring.',
    });
  }

  onDataChanged(listener: () => void): () => void {
    this.#dataListeners.push(listener);

    return () => {
      const index = this.#dataListeners.indexOf(listener);
      if (index >= 0) this.#dataListeners.splice(index, 1);
    };
  }

  updateOptions(options: Partial<RadialProgressSeriesOptions>): void {
    const wasAnimated = this.#options.updateMs > 0;
    this.#options = normalize(this.#options, options ?? {});

    // The data can change in the same render, before its options arrive; it must not glide then.
    const updatesTurnedOff = wasAnimated && this.#options.updateMs === 0;
    if (updatesTurnedOff) this.#settleRings();
  }

  applyTheme(theme: ChartTheme): void {
    this.#theme = theme;
  }

  getLayerCount(): number {
    return 1;
  }

  setLayerVisible(_index: number, _visible: boolean): void {
    // Radial progress has no layers.
  }

  isLayerVisible(_index: number): boolean {
    return true;
  }

  getLayerColors(): string[] {
    return [this.#ringColor(0, this.#theme)];
  }

  /** One entry per ring: its value, and its share of `max` as `percent`. */
  getSliceInfo(theme: ChartTheme): SliceInfo[] | null {
    if (this.#data.length === 0) return null;

    const { max } = this.#options;

    return this.#data.map((row, i) => ({
      label: row.label,
      value: row.value,
      percent: max > 0 ? (row.value / max) * 100 : 0,
      color: this.#ringColor(i, theme),
    }));
  }

  get needsAnimation(): boolean {
    return this.#fade.active || this.#paintersAnimating || this.#tweens.some((tween) => tween.active);
  }

  dispose(): void {
    this.#dataListeners = [];
    this.#data = [];
    this.#tweens = [];
    this.#memos = [];
    this.#paintersAnimating = false;
    this.#fade.settle();
  }

  #settleRings(): void {
    for (const tween of this.#tweens) {
      tween.settle();
    }
  }

  #ringColor(index: number, theme: ChartTheme): string {
    const own = this.#data[index]?.color;
    if (own !== undefined) return own;

    const palette = this.#options.colors ?? theme.seriesColors;

    return palette[index % palette.length] ?? '#888';
  }

  render(ctx: SeriesRenderContext): void {
    const { scope, theme, padding } = ctx;
    const { context, bitmapSize, horizontalPixelRatio: hpr, verticalPixelRatio: vpr } = scope;
    this.#theme = theme;

    const count = this.#data.length;
    const box = drawingBox({
      bitmapWidth: bitmapSize.width,
      bitmapHeight: bitmapSize.height,
      padding: { top: padding.top * vpr, bottom: padding.bottom * vpr },
      pixelRatio: hpr,
    });

    const { startAngle, endAngle, layout } = this.#options;
    const sweep = clamp(endAngle - startAngle, 0, 360);
    const start = bearingToCanvas(startAngle);
    const end = bearingToCanvas(startAngle + sweep);
    const fit = (bounds: Bounds) =>
      Math.min(box.width / (bounds.maxX - bounds.minX), box.height / (bounds.maxY - bounds.minY));

    // The round ends of the rings poke past the arc; a layout scales with the radius, so one refit holds them.
    const guess = fit(arcBounds({ start, end, slots: [], outer: 1 }));
    const guessSlots = layout({ count, outer: guess, pixelRatio: hpr });
    const bounds = arcBounds({ start, end, slots: guessSlots, outer: guess });
    const outer = fit(bounds);
    if (count === 0 || !(outer > 0) || sweep === 0) {
      this.#fade.settle();
      this.#settleRings();
      this.#paintersAnimating = false;

      return;
    }

    const cx = box.left + box.width / 2 - ((bounds.minX + bounds.maxX) / 2) * outer;
    const cy = box.top + box.height / 2 - ((bounds.minY + bounds.maxY) / 2) * outer;
    const slots = layout({ count, outer, pixelRatio: hpr });
    const trackColor = this.#options.trackColor ?? resolveGaugeTheme(theme).trackColor;
    const { max, painter, labels, entryMs, updateMs } = this.#options;
    const animate = (entryMs > 0 || updateMs > 0) && !prefersReducedMotion();
    const env: PaintEnv = { ctx: context, theme, horizontalPixelRatio: hpr, verticalPixelRatio: vpr };

    const now = performance.now();
    this.#fade.tick(now);
    const fade = this.#fade.valueAt(now);
    const baseAlpha = context.globalAlpha;
    let animating = false;

    const rings = this.#data.map((row, i) => {
      const tween = this.#tweens[i];
      tween.tick(now);

      const value = tween.valueAt(now);
      const fraction = max > 0 ? clamp(value / max, 0, 1) : 0;
      const slot = slots[i] ?? { radius: 0, width: 0 };
      const item: RadialItem = {
        label: row.label,
        value,
        percent: max > 0 ? (value / max) * 100 : 0,
        color: this.#ringColor(i, theme),
      };

      return { ...slot, item, fraction, valueAngle: start + (end - start) * fraction };
    });

    rings.forEach((ring, index) => {
      if (ring.radius <= 0 || ring.width <= 0) return;

      const args = {
        index,
        cx,
        cy,
        radius: ring.radius,
        width: ring.width,
        startAngle: start,
        endAngle: end,
        valueAngle: ring.valueAngle,
        fraction: ring.fraction,
        color: ring.item.color,
        trackColor,
        entrance: fade,
        animate,
        now,
        memo: this.#memos[index] ?? {},
      };

      context.globalAlpha = baseAlpha * fade;
      animating = painter(env, { ...args, element: 'track' }) || animating;
      context.globalAlpha = baseAlpha;
      animating = painter(env, { ...args, element: 'value' }) || animating;
    });

    if (labels) {
      context.globalAlpha = baseAlpha * fade;
      const hole = Math.max(0, Math.min(...rings.map((ring) => ring.radius - ring.width / 2)));
      labels(env, { cx, cy, hole, startAngle: start, endAngle: end, rings, area: box });
    }

    context.globalAlpha = baseAlpha;
    this.#paintersAnimating = animating;
  }
}

/**
 * The arc in units of the outer radius, with the round ends of `slots`, laid out at `outer`,
 * and room under it when it is open at the bottom.
 */
function arcBounds(args: { start: number; end: number; slots: RingSlot[]; outer: number }): Bounds {
  const { start, end, outer } = args;
  const bounds: Bounds = { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  includeArc(bounds, { start, end, radius: 1 });

  const openAtBottom = bounds.maxY < 1;
  if (openAtBottom) bounds.maxY = Math.max(bounds.maxY, BASE_ROOM);

  for (const slot of args.slots) {
    if (slot.radius <= 0 || slot.width <= 0) continue;

    const radius = slot.radius / outer;
    const cap = slot.width / 2 / outer;

    for (const angle of [start, end]) {
      const x = radius * Math.cos(angle);
      const y = radius * Math.sin(angle);
      includePoint(bounds, x - cap, y - cap);
      includePoint(bounds, x + cap, y + cap);
    }
  }

  return bounds;
}

/** Series definition for `chart.addSeries` — hosts that never draw radial progress don't bundle this module. */
export const RadialProgressSeriesDef: SeriesDefinition<RadialProgressSeriesOptions> = {
  type: 'radialProgress',
  create: (env, options) => new RadialProgressRenderer({ options: { ...options }, theme: env.theme }),
};

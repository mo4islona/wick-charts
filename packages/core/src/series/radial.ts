import { type Easing, easeOutCubic } from '../animation/easing';
import { prefersReducedMotion } from '../animation/reduced-motion';
import { resolveCandlestickBodyColor } from '../theme/resolve';
import type { ChartTheme } from '../theme/types';
import { deriveGaugeColors } from '../utils/color';
import { clamp, lerp } from '../utils/math';
import type { RenderPadding } from './types';

// Arc geometry, tween and paint code shared by the gauge and radial progress series.

const DEG_TO_RAD = Math.PI / 180;

/** Share of the entry over which the tracks and the labels fade in. */
export const TRACK_FADE_SHARE = 0.5;

/** Room kept between the drawing and the edges of its box, CSS px. */
const EDGE_MARGIN = 4;

/** An axis-aligned box in units of a radial drawing's outer radius, centered on (0, 0). */
export interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export function includePoint(bounds: Bounds, x: number, y: number): void {
  bounds.minX = Math.min(bounds.minX, x);
  bounds.maxX = Math.max(bounds.maxX, x);
  bounds.minY = Math.min(bounds.minY, y);
  bounds.maxY = Math.max(bounds.maxY, y);
}

/** Grow `bounds` by an arc of `radius` from `start` to `end` (canvas radians, clockwise). */
export function includeArc(bounds: Bounds, args: { start: number; end: number; radius: number }): void {
  const { start, end, radius } = args;
  const quarter = Math.PI / 2;

  includePoint(bounds, radius * Math.cos(start), radius * Math.sin(start));
  includePoint(bounds, radius * Math.cos(end), radius * Math.sin(end));
  for (let k = Math.ceil(start / quarter); k * quarter <= end; k++) {
    includePoint(bounds, radius * Math.cos(k * quarter), radius * Math.sin(k * quarter));
  }
}

/** Canvas angle in radians of a bearing in degrees clockwise from 12 o'clock. */
export function bearingToCanvas(degrees: number): number {
  return (degrees - 90) * DEG_TO_RAD;
}

/**
 * A value that glides from where it is drawn to each new target. The clock
 * starts on the first {@link tick} after a retarget, so a tween armed before
 * the first paint plays in full.
 */
export class ValueTween {
  #from: number;
  #to: number;
  #start: number | null = null;
  #durationMs = 0;
  #easing: Easing = easeOutCubic;

  constructor(value: number) {
    this.#from = value;
    this.#to = value;
  }

  get target(): number {
    return this.#to;
  }

  get active(): boolean {
    return this.#durationMs > 0;
  }

  /** Glide from the value drawn at `now` to `to`. A tween no frame has drawn yet keeps its timing. */
  retarget(args: { to: number; durationMs: number; now: number; easing?: Easing }): void {
    const pending = this.active && this.#start === null;
    if (pending) {
      this.#to = args.to;

      return;
    }

    this.#from = this.valueAt(args.now);
    this.#to = args.to;
    this.#start = null;
    this.#durationMs = prefersReducedMotion() ? 0 : Math.max(0, args.durationMs);
    this.#easing = args.easing ?? easeOutCubic;
  }

  /** Start the clock on the first call, and settle once the duration has passed. */
  tick(now: number): void {
    if (!this.active) return;

    if (this.#start === null) this.#start = now;
    if (now - this.#start >= this.#durationMs) this.#durationMs = 0;
  }

  valueAt(now: number): number {
    if (!this.active) return this.#to;

    return lerp(this.#from, this.#to, this.progressAt(now));
  }

  /** Eased share of the running glide at `now`: 0 at its start, 1 once it has settled. */
  progressAt(now: number): number {
    if (!this.active) return 1;
    if (this.#start === null) return 0;

    const t = clamp((now - this.#start) / this.#durationMs, 0, 1);

    return this.#easing(t);
  }

  /** Jump to the target. */
  settle(): void {
    this.#durationMs = 0;
  }
}

/** The theme's gauge colors, derived from the theme for a hand-built literal without the `gauge` block. */
export function resolveGaugeTheme(theme: ChartTheme): NonNullable<ChartTheme['gauge']> {
  if (theme.gauge) return theme.gauge;

  return deriveGaugeColors({
    background: theme.background,
    muted: theme.axis.textColor,
    up: resolveCandlestickBodyColor(theme.candlestick.up.body),
    down: resolveCandlestickBodyColor(theme.candlestick.down.body),
  });
}

/** Bitmap box a radial series lays out in: the canvas inside the chart padding, less a small margin. */
export function drawingBox(args: {
  bitmapWidth: number;
  bitmapHeight: number;
  padding: RenderPadding;
  pixelRatio: number;
}): { left: number; top: number; width: number; height: number } {
  const { bitmapWidth, bitmapHeight, padding, pixelRatio } = args;
  const margin = EDGE_MARGIN * pixelRatio;

  const top = clamp(padding.top, 0, bitmapHeight) + margin;
  const bottom = clamp(padding.bottom, 0, bitmapHeight) + margin;

  return {
    left: margin,
    top,
    width: Math.max(0, bitmapWidth - 2 * margin),
    height: Math.max(0, bitmapHeight - top - bottom),
  };
}

/** Stroke one arc clockwise from `from` to `to` (canvas radians). An arc of no length draws nothing. */
export function strokeArc(
  context: CanvasRenderingContext2D,
  args: {
    cx: number;
    cy: number;
    radius: number;
    from: number;
    to: number;
    width: number;
    color: string;
    cap: CanvasLineCap;
  },
): void {
  const { cx, cy, radius, from, to, width, color, cap } = args;
  if (to - from <= 1e-4 || radius <= 0 || width <= 0) return;

  context.strokeStyle = color;
  context.lineWidth = width;
  context.lineCap = cap;
  context.beginPath();
  context.arc(cx, cy, radius, from, to);
  context.stroke();
}

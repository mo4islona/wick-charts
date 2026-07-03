/**
 * Pluggable initial-load intro animations for the bar series.
 *
 * The renderer calls a {@link BarIntroFn} once per frame while the intro
 * wave is active. The function reads a {@link BarIntroFrame} and returns
 * {@link BarIntroDirectives}: a clip window, a per-value transform (applied
 * before geometry and stacking, so growth works identically across the
 * off / stacked / percent render paths), and/or a per-element transform.
 * Same philosophy as the line's `LineIntroFn`.
 *
 * The shipped styles are plain factories over this contract — the default
 * is exactly `growIntro()`. The shared factories `riseIntro()`,
 * `fadeIntro()`, and `wipeIntro()` (see `wave-intro.ts`) type-check here
 * too:
 *
 * ```ts
 * <BarSeries options={{ introAnimation: springIntro() }} />
 * <BarSeries options={{ introAnimation: wipeIntro() }} />
 * ```
 */

import { easeOutBack } from '../animation/easing';
import type { WaveIntroElement, WaveIntroFrame, WaveIntroTransform } from './wave-intro';

/** Read view of one bar intro frame. */
export interface BarIntroFrame extends WaveIntroFrame {
  /** Time → bitmap X through the live time scale. */
  timeToX(time: number): number;
}

/** Arguments handed to {@link BarIntroDirectives.value} for every rendered value. */
export interface BarIntroValueArgs {
  layerIndex: number;
  time: number;
  /** The value the renderer would draw without the intro (live smoothing included). */
  value: number;
  /** Normalized x-position across the visible window, clamped to `[0, 1]`. */
  position: number;
  /** Eased wave progress for this value, staggered left → right. */
  progress: number;
}

/** Arguments handed to {@link BarIntroDirectives.element} per drawn bar. */
export interface BarIntroElement extends WaveIntroElement {
  /** Settled left edge in bitmap px. */
  x: number;
  /** Settled top edge in bitmap px. */
  topY: number;
  /** Settled bar height in bitmap px. */
  barHeight: number;
  /** Y the bar grows from — the zero line, or the segment's own base for
   *  stacked bars. */
  baselineY: number;
  /** Bar body width in bitmap px. */
  barWidth: number;
}

/** Declarative per-bar transform — translation and opacity only; growth is
 *  expressed through {@link BarIntroDirectives.value} instead so stacked
 *  columns rise as one attached unit. */
export type BarElementTransform = WaveIntroTransform;

/** What one intro frame should look like. */
export interface BarIntroDirectives {
  /** Horizontal clip window in bitmap px applied to the whole pass.
   *  Omitted sides default to the pane edges. */
  clip?: { fromX?: number; toX?: number };
  /** Per-value transform applied before geometry and stacking. Scaling the
   *  value grows the bar from the baseline on every render path. */
  value?: (args: BarIntroValueArgs) => number;
  /** Per-bar transform applied after the geometry is resolved. */
  element?: (el: BarIntroElement) => BarElementTransform;
}

/** One frame of bar intro choreography. */
export type BarIntroFn = (frame: BarIntroFrame) => BarIntroDirectives;

/** Bars fade-grow up from the baseline in a left-to-right wave — the
 *  default intro. */
export function growIntro(): BarIntroFn {
  return () => ({
    value: ({ value, progress }) => value * progress,
    element: (el) => ({ alpha: el.progress }),
  });
}

/** `springIntro` fades in over the first 30% of an element's progress so
 *  the overshoot region (later in the curve) plays at full opacity. */
const SPRING_FADE_END = 0.3;

/** Bars grow from the baseline with a soft ease-out-back overshoot past
 *  their final height before settling. */
export function springIntro(): BarIntroFn {
  return () => ({
    value: ({ value, progress }) => value * easeOutBack(progress),
    element: (el) => ({ alpha: Math.min(1, el.progress / SPRING_FADE_END) }),
  });
}

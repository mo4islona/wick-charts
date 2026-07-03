/**
 * Shared contract pieces for the element-wave intro animations (bar and
 * candlestick series).
 *
 * Both renderers reveal their initial seed as a left-to-right wave driven by
 * the shared `IntroWave` clock. Their intro contracts (`BarIntroFn`,
 * `CandleIntroFn`) are per-frame functions returning declarative directives,
 * mirroring the line's `LineIntroFn`. The frame/element/transform shapes
 * below are the structural common denominator of the two contracts, which
 * lets one factory serve both series: `riseIntro()` handed to a bar series
 * type-checks as a `BarIntroFn`, handed to a candlestick as a
 * `CandleIntroFn`.
 */

import { easeInOutCubic } from '../animation/easing';
import type { VisibleRange } from '../types';

/** Frame fields common to the bar and candlestick intro contracts. */
export interface WaveIntroFrame {
  /** Linear intro progress in `[0, 1]` over the whole reveal window. */
  progress: number;
  /** Pane width in bitmap pixels. */
  width: number;
  /** Pane height in bitmap pixels. */
  height: number;
  /** Visible time range. */
  range: VisibleRange;
}

/** Per-element fields common to the bar and candlestick intro contracts. */
export interface WaveIntroElement {
  /** Eased wave progress for this element, staggered left → right. */
  progress: number;
  /** Normalized x-position across the visible window, clamped to `[0, 1]`. */
  position: number;
  /** The element's time coordinate. */
  time: number;
}

/** Declarative transform understood by both series' element callbacks. */
export interface WaveIntroTransform {
  /** Horizontal translation in bitmap px. */
  offsetX?: number;
  /** Vertical translation in bitmap px. */
  offsetY?: number;
  /** Opacity multiplier in `[0, 1]`. */
  alpha?: number;
}

/** Directives shape common to both series (each extends it with its own
 *  element/value callbacks). */
export interface WaveIntroDirectives {
  /**
   * Horizontal clip window in bitmap pixels applied to the whole series
   * pass. Omitted sides default to the pane edges, so `{ toX }` is a
   * left-to-right reveal.
   */
  clip?: { fromX?: number; toX?: number };
  element?: (el: WaveIntroElement) => WaveIntroTransform;
}

/** An intro function built only from the shared fields — assignable to both
 *  `BarIntroFn` and `CandleIntroFn`. */
export type WaveIntroFn = (frame: WaveIntroFrame) => WaveIntroDirectives;

/** Default `riseIntro` travel as a fraction of the pane height — a float
 *  into place, not a launch from off-screen. */
const RISE_TRAVEL_RATIO = 0.35;

/**
 * Elements float up into place from below, fading in along the wave.
 * Works for both bar and candlestick series.
 */
export function riseIntro(options: { travel?: number } = {}): WaveIntroFn {
  const travel = options.travel ?? RISE_TRAVEL_RATIO;

  return (frame) => ({
    element: (el) => ({
      offsetY: (1 - el.progress) * frame.height * travel,
      alpha: el.progress,
    }),
  });
}

/**
 * Plain staggered fade-in, no geometry motion. Works for both bar and
 * candlestick series.
 */
export function fadeIntro(): WaveIntroFn {
  return () => ({
    element: (el) => ({ alpha: el.progress }),
  });
}

/**
 * A hard reveal front sweeps left to right; elements appear fully formed
 * behind it. Works for both bar and candlestick series.
 */
export function wipeIntro(): WaveIntroFn {
  return (frame) => ({
    clip: { toX: easeInOutCubic(frame.progress) * frame.width },
  });
}

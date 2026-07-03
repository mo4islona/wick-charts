/**
 * Pluggable initial-load intro animations for the candlestick series.
 *
 * The renderer calls a {@link CandleIntroFn} once per frame while the intro
 * wave is active. The function reads a {@link CandleIntroFrame} and returns
 * {@link CandleIntroDirectives} — a clip window and/or a per-element
 * transform callback the renderer applies to every wick, body, and volume
 * bar. The renderer owns the drawing; the intro function owns the
 * choreography — same philosophy as the line's `LineIntroFn`.
 *
 * The shipped styles are plain factories over this contract — the default
 * is exactly `candleUnfoldIntro()` — so a custom intro is a peer of the
 * built-ins. The shared factories `riseIntro()`, `fadeIntro()`, and
 * `wipeIntro()` (see `wave-intro.ts`) type-check here too:
 *
 * ```ts
 * <CandlestickSeries options={{ introAnimation: wickBodyIntro() }} />
 * <CandlestickSeries options={{ introAnimation: riseIntro() }} />
 * ```
 */

import type { WaveIntroElement, WaveIntroFrame, WaveIntroTransform } from './wave-intro';

/** Read view of one candlestick intro frame. */
export interface CandleIntroFrame extends WaveIntroFrame {
  /** Time → bitmap X through the live time scale. */
  timeToX(time: number): number;
}

/** Arguments handed to {@link CandleIntroDirectives.element} per element. */
export interface CandleIntroElement extends WaveIntroElement {
  /** Which candle element is being transformed. */
  element: 'wick' | 'body' | 'volume';
  /** Settled left edge in bitmap px. */
  x: number;
  /** Settled top edge in bitmap px. */
  topY: number;
  /** Settled bottom edge in bitmap px. */
  bottomY: number;
  /** Y the element unfolds around — the open price for wick/body, the band
   *  baseline for volume. */
  anchorY: number;
  /** Element width in bitmap px. */
  barWidth: number;
}

/** What one element should look like this frame. Every field is optional —
 *  an empty object renders the element settled. */
export interface CandleElementTransform extends WaveIntroTransform {
  /** Lerp factor from `anchorY` toward the settled edges: `0` = collapsed
   *  at the anchor, `1` = settled. Applied before the offsets. */
  unfold?: number;
}

/** What one intro frame should look like. */
export interface CandleIntroDirectives {
  /** Horizontal clip window in bitmap px applied to the whole pass (volume
   *  band included). Omitted sides default to the pane edges. */
  clip?: { fromX?: number; toX?: number };
  /** Per-element transform — called for every wick, body, and volume bar. */
  element?: (el: CandleIntroElement) => CandleElementTransform;
}

/** One frame of candlestick intro choreography. */
export type CandleIntroFn = (frame: CandleIntroFrame) => CandleIntroDirectives;

function clamp01(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;

  return value;
}

/** Each candle unfolds from its open price in a left-to-right wave — the
 *  default intro. */
export function candleUnfoldIntro(): CandleIntroFn {
  return () => ({
    element: (el) => ({ unfold: el.progress }),
  });
}

/** `wickBodyIntro` phase split: wicks needle out over the first 55% of an
 *  element's progress, bodies (and volume) unfold over the last 55% — the
 *  10% overlap keeps the hand-off continuous. */
const WICK_PHASE_END = 0.55;
const BODY_PHASE_START = 0.45;

/** Two-phase reveal: wicks needle out first as a skeleton, then bodies (and
 *  volume) unfold over them from the open price. */
export function wickBodyIntro(): CandleIntroFn {
  return () => ({
    element: (el) => {
      if (el.element === 'wick') {
        return { unfold: clamp01(el.progress / WICK_PHASE_END) };
      }

      const local = clamp01((el.progress - BODY_PHASE_START) / (1 - BODY_PHASE_START));

      return { unfold: local, alpha: local };
    },
  });
}

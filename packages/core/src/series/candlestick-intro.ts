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

import { lerp } from '../utils/math';
import { type WaveIntroElement, type WaveIntroFrame, type WaveIntroTransform, fadeIntro } from './wave-intro';

/**
 * One placeholder shape a loading indicator painted at the data boundary,
 * mapped into bitmap space — what a morph-style history reveal grows the
 * real candles out of. Re-anchored to the boundary every frame, so the
 * morph stays glued while the user keeps panning.
 */
export interface MorphPlaceholder {
  /** Bar center X, bitmap px. */
  x: number;
  /** Bar center Y, bitmap px. */
  y: number;
  /** Half the body height, bitmap px. */
  halfHeight: number;
  /** Body width, bitmap px. */
  width: number;
}

/** Read view of one candlestick intro frame. */
export interface CandleIntroFrame extends WaveIntroFrame {
  /** Time → bitmap X through the live time scale. */
  timeToX(time: number): number;
  /**
   * Placeholder shapes the loading indicator was showing when this history
   * reveal armed — present only on a history-reveal frame that followed a
   * loading-indicator hand-off (see `skeletonMorphIntro`). Absent on
   * initial-load intro frames and on reveals with no hand-off.
   */
  placeholders?: readonly MorphPlaceholder[];
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
  /** Absolute top edge override in bitmap px — replaces the `unfold` math
   *  for this frame (the offsets still apply). Lets a morph start from
   *  arbitrary geometry instead of the anchor. */
  topY?: number;
  /** Absolute bottom edge override in bitmap px — see {@link topY}. */
  bottomY?: number;
  /** Blend of the element's fill toward the theme's muted placeholder gray
   *  (the axis text color): `0` = the candle's own color, `1` = fully
   *  placeholder-colored. Volume bars ignore it. */
  tint?: number;
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
 *  default intro. Alpha rides the same progress as the unfold so a candle
 *  still waiting for the wave front stays invisible instead of painting as
 *  a flat, min-height line at its open price. */
export function candleUnfoldIntro(): CandleIntroFn {
  return () => ({
    element: (el) => ({ unfold: el.progress, alpha: el.progress }),
  });
}

/** `wickBodyIntro` phase split: wicks needle out over the first 55% of an
 *  element's progress, bodies (and volume) unfold over the last 55% — the
 *  10% overlap keeps the hand-off continuous. */
const WICK_PHASE_END = 0.55;
const BODY_PHASE_START = 0.45;

/** Alpha a morphing candle starts at — matches how strongly the skeleton's
 *  translucent placeholder read against the background. */
const MORPH_START_ALPHA = 0.35;

/** A candle only morphs from a placeholder standing (nearly) where it lands;
 *  beyond this many placeholder-widths it plays the fallback reveal. */
const MORPH_MATCH_RATIO = 1.5;

/**
 * Skeleton morph: candles that land where the loading indicator's
 * placeholder bars stood grow out of those exact shapes — geometry eases
 * from the placeholder body to the real OHLC, fill blends from the muted
 * placeholder gray to the candle's own color. Candles outside the
 * placeholder zone (and any reveal with no hand-off, e.g. a custom
 * indicator that never reports its shapes) play the `fallback` instead —
 * `fadeIntro()` unless overridden.
 *
 * Meant for the `historyReveal` option, paired with an `EdgeLoader` whose
 * indicator reports placeholders (`skeletonLoadingIndicator` does).
 */
export function skeletonMorphIntro(options: { fallback?: CandleIntroFn } = {}): CandleIntroFn {
  const fallback: CandleIntroFn = options.fallback ?? fadeIntro();

  return (frame) => {
    const placeholders = frame.placeholders;
    if (placeholders === undefined || placeholders.length === 0) return fallback(frame);

    const base = fallback(frame);

    return {
      ...base,
      element: (el) => {
        // Wick args carry the thin wick's left edge (≈ the candle center);
        // body/volume args carry the body's left edge.
        const center = el.element === 'wick' ? el.x : el.x + el.barWidth / 2;

        let nearest: MorphPlaceholder | null = null;
        let bestDist = Infinity;
        for (const ph of placeholders) {
          const dist = Math.abs(ph.x - center);
          if (dist < bestDist) {
            bestDist = dist;
            nearest = ph;
          }
        }
        if (nearest === null || bestDist > nearest.width * MORPH_MATCH_RATIO) {
          return base.element?.(el) ?? {};
        }

        // The placeholder zone sits nearest the boundary, so these candles
        // ride the front of the reveal wave — `progress` starts moving
        // immediately while deeper history waits its stagger turn.
        const progress = el.progress;
        if (el.element === 'volume') return { alpha: progress };

        return {
          topY: lerp(nearest.y - nearest.halfHeight, el.topY, progress),
          bottomY: lerp(nearest.y + nearest.halfHeight, el.bottomY, progress),
          offsetX: (nearest.x - center) * (1 - progress),
          alpha: MORPH_START_ALPHA + (1 - MORPH_START_ALPHA) * progress,
          tint: 1 - progress,
        };
      },
    };
  };
}

/** Two-phase reveal: wicks needle out first as a skeleton, then bodies (and
 *  volume) unfold over them from the open price. */
export function wickBodyIntro(): CandleIntroFn {
  return () => ({
    element: (el) => {
      if (el.element === 'wick') {
        const local = clamp01(el.progress / WICK_PHASE_END);

        // A candle still waiting for the wave front (progress === 0) would
        // otherwise paint its needle as a flat, min-height line at the open
        // price — alpha snaps in the instant the needle actually starts.
        return { unfold: local, alpha: local > 0 ? 1 : 0 };
      }

      const local = clamp01((el.progress - BODY_PHASE_START) / (1 - BODY_PHASE_START));

      return { unfold: local, alpha: local };
    },
  });
}

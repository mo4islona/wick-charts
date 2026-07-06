/**
 * Pluggable initial-load intro animations for the line series.
 *
 * The renderer drives a {@link LineIntroFn} once per frame while the intro
 * wave is active. The function reads a {@link LineIntroFrame} (progress,
 * visible range, bitmap scales, per-layer data accessors) and returns
 * {@link LineIntroDirectives} — a declarative description of what the frame
 * should look like: a clip window, a ghost pre-pass, head-glow anchors, a
 * per-value transform. The renderer owns the drawing; the intro function
 * owns the choreography.
 *
 * The shipped styles are plain factories over this same contract — the
 * default is exactly `unfoldIntro()` — so a custom intro is a peer of the
 * built-ins, not a second-class hook:
 *
 * ```ts
 * // Built-in:
 * <LineSeries options={{ introAnimation: traceIntro() }} />
 *
 * // Custom — right-to-left reveal:
 * const rightToLeft: LineIntroFn = (frame) => ({
 *   clip: { fromX: frame.width * (1 - frame.progress) },
 * });
 * <LineSeries options={{ introAnimation: rightToLeft }} />
 * ```
 */

import { easeInOutCubic, easeOutBack } from '../animation/easing';
import type { StackingMode, TimePoint, VisibleRange } from '../types';

/** Read view of one intro frame — everything a {@link LineIntroFn} may need. */
export interface LineIntroFrame {
  /** Linear intro progress in `[0, 1]` over the whole reveal window. */
  progress: number;
  /** Visible time range. */
  range: VisibleRange;
  /**
   * Plot-area width in bitmap pixels — the span `timeToX` maps the visible
   * range onto (excludes the Y-axis strip sharing the canvas).
   */
  width: number;
  /** Plot-area height in bitmap pixels (excludes the X-axis strip). */
  height: number;
  /** The series' stacking mode — path-based intros usually degrade to a plain clip when stacked. */
  stacking: StackingMode;
  /** Time → bitmap X through the live time scale. */
  timeToX(time: number): number;
  /** Bitmap X → time — the inverse of {@link timeToX}, for mapping a clip front back into the time domain. */
  xToTime(x: number): number;
  /** Value → bitmap Y through the live Y scale. */
  valueToY(value: number): number;
  /** Number of layers in the series. */
  layerCount: number;
  /** Visible data of one layer (memoized per frame). */
  layerData(layerIndex: number): readonly TimePoint[];
  /** Mean of the layer's visible finite values, or `null` for an empty/poisoned layer (memoized per frame). */
  layerMean(layerIndex: number): number | null;
  /**
   * Bitmap-space polyline of the first visible layer (finite values only,
   * memoized per frame), or `null` when no layer has two drawable points.
   */
  primaryPath(): ReadonlyArray<{ x: number; y: number; time: number }> | null;
}

/** Arguments handed to {@link LineIntroDirectives.value} for every rendered value. */
export interface LineIntroValueArgs {
  layerIndex: number;
  time: number;
  /** The value the renderer would draw without the intro (live smoothing included). */
  value: number;
  /** Normalized x-position of `time` across the visible range, clamped to `[0, 1]`. */
  position: number;
}

/** What one intro frame should look like. Every field is optional — an empty
 *  object renders the frame settled. */
export interface LineIntroDirectives {
  /**
   * Horizontal clip window in bitmap pixels. Omitted sides default to the
   * pane edges, so `{ toX }` is a left-to-right reveal and `{ fromX }` a
   * right-to-left one.
   */
  clip?: { fromX?: number; toX?: number };
  /**
   * Draw a stroke-only ghost of the full line under the main pass at this
   * alpha (the area fill is left to the main pass).
   */
  ghostAlpha?: number;
  /**
   * Head-glow anchors — the renderer draws a pulse dot per visible layer at
   * each head's `time` (bell-faded over the intro window). Heads are
   * skipped for stacked series, where a single layer's Y is meaningless.
   */
  heads?: Array<{ x: number; time: number }>;
  /**
   * Per-value transform applied to every rendered value (stroke, area,
   * stacked cumulative, trailing endpoint, overlay pulse) via the
   * renderer's `effectiveValue` hook.
   */
  value?: (args: LineIntroValueArgs) => number;
}

/** One frame of intro choreography. See the module docs for the contract. */
export type LineIntroFn = (frame: LineIntroFrame) => LineIntroDirectives;

function clamp01(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;

  return value;
}

/** Eased left-to-right front shared by `sweep` and `trace`. */
function sweepFront(frame: LineIntroFrame): { x: number; time: number } {
  const eased = easeInOutCubic(frame.progress);
  const time = frame.range.from + eased * (frame.range.to - frame.range.from);

  return { x: frame.timeToX(time), time };
}

/** Left-to-right draw-on behind a clip edge with a glowing head. */
export function sweepIntro(options: { head?: boolean } = {}): LineIntroFn {
  const head = options.head ?? true;

  return (frame) => {
    const front = sweepFront(frame);

    return { clip: { toX: front.x }, heads: head ? [front] : undefined };
  };
}

/**
 * Amplitude unfold: every value lerps from its layer's visible mean toward
 * its real value with a soft ease-out-back overshoot, staggered
 * left-to-right by `stagger` (fraction of the window; default 0.35,
 * clamped to `[0, 0.9]` — at 1 the rightmost points would never finish
 * their tween and snap on settle).
 */
export function unfoldIntro(options: { stagger?: number } = {}): LineIntroFn {
  const stagger = Math.min(clamp01(options.stagger ?? 0.35), 0.9);

  return (frame) => ({
    value: ({ layerIndex, value, position }) => {
      const anchor = frame.layerMean(layerIndex);
      if (anchor === null || !Number.isFinite(value)) return value;

      const local = clamp01((frame.progress - stagger * position) / (1 - stagger));

      return anchor + (value - anchor) * easeOutBack(local);
    },
  });
}

/**
 * Chart-recorder pen: the reveal front advances at constant speed along the
 * polyline's arc length (bitmap space), so it decelerates through volatile
 * stretches and races across flat ones. Falls back to the plain sweep for
 * stacked series and degenerate paths.
 */
export function plotterIntro(): LineIntroFn {
  const sweep = sweepIntro();

  return (frame) => {
    if (frame.stacking !== 'off') return sweep(frame);

    const path = frame.primaryPath();
    if (path === null || path.length < 2) return sweep(frame);

    let total = 0;
    const lengths: number[] = [];
    for (let i = 1; i < path.length; i++) {
      const len = Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
      lengths.push(len);
      total += len;
    }
    if (total <= 0) return sweep(frame);

    let remaining = frame.progress * total;
    for (let i = 1; i < path.length; i++) {
      const len = lengths[i - 1];
      if (remaining > len) {
        remaining -= len;
        continue;
      }

      const t = len > 0 ? remaining / len : 1;
      const a = path[i - 1];
      const b = path[i];
      const x = a.x + (b.x - a.x) * t;
      const time = a.time + (b.time - a.time) * t;

      return { clip: { toX: x }, heads: [{ x, time }] };
    }

    const last = path[path.length - 1];

    return { clip: { toX: last.x }, heads: [{ x: last.x, time: last.time }] };
  };
}

/**
 * Blueprint → ink: a faint stroke-only ghost of the whole line shows from
 * the first frame, while the full-color pass (area included) sweeps across
 * behind the same front as `'sweep'`.
 */
export function traceIntro(options: { ghostAlpha?: number } = {}): LineIntroFn {
  const ghostAlpha = clamp01(options.ghostAlpha ?? 0.18);

  return (frame) => {
    const front = sweepFront(frame);

    return { clip: { toX: front.x }, heads: [front], ghostAlpha };
  };
}

/**
 * Center-out reveal: the clip window opens from the pane's horizontal
 * center outward, a glowing head riding each front.
 */
export function centerOutIntro(): LineIntroFn {
  return (frame) => {
    const eased = easeInOutCubic(frame.progress);
    const cx = frame.width / 2;
    const half = cx * eased;

    return {
      clip: { fromX: cx - half, toX: cx + half },
      heads: [
        { x: cx - half, time: frame.xToTime(cx - half) },
        { x: cx + half, time: frame.xToTime(cx + half) },
      ],
    };
  };
}

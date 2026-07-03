/**
 * Animation config — single home for:
 *
 *   1. Default durations (`DEFAULT_*`) — shared baselines consumed by
 *      {@link AnimationConfig.resolve}, the renderer factories, and the
 *      axis tick-fade tracker.
 *   2. Public {@link AnimationsConfig} shape — what users pass to
 *      `ChartOptions.animations`.
 *   3. Runtime {@link AnimationConfig} class — resolved view with every
 *      field concrete plus `defaults(kind)` / `overrides(kind)` helpers
 *      for the chart's `addXSeries` option-merge.
 */

import type { SeriesKind } from '../series/types';
import type { VisibleRange, YRange } from '../types';
import { spring } from './spring';
import { type AnimationTime, resolveAnimationTime } from './time';
import type { TransitionFactory } from './transition';
import { hermite } from './y-range-hermite';
import { snap } from './y-range-snap';

// =============================================================================
// Internal shared baselines
// =============================================================================

const DEFAULT_SERIES_ENTRY = 250;
const DEFAULT_SERIES_SMOOTH = 250;
const DEFAULT_SERIES_INTRO = 500;

// =============================================================================
// Per-series-type defaults (public)
// =============================================================================

/** Line entrance tween duration. */
export const DEFAULT_LINE_ENTRY = DEFAULT_SERIES_ENTRY;
/** Line live-value chase duration. */
export const DEFAULT_LINE_SMOOTH = DEFAULT_SERIES_SMOOTH;
/** Line initial-load reveal — per-element wave duration; the full intro lasts ~2×. */
export const DEFAULT_LINE_INTRO = DEFAULT_SERIES_INTRO;
/** Pulse cycle period for the line last-point halo. Periodic loop, not a one-shot transition. */
export const DEFAULT_LINE_PULSE = 600;

/** Candlestick entrance tween duration. */
export const DEFAULT_CANDLESTICK_ENTRY = DEFAULT_SERIES_ENTRY;
/** Candlestick live OHLC chase duration. */
export const DEFAULT_CANDLESTICK_SMOOTH = DEFAULT_SERIES_SMOOTH;
/** Candlestick initial-load reveal — per-candle wave duration; the full intro lasts ~2×. */
export const DEFAULT_CANDLESTICK_INTRO = DEFAULT_SERIES_INTRO;

/** Bar entrance tween duration. */
export const DEFAULT_BAR_ENTRY = DEFAULT_SERIES_ENTRY;
/** Bar live-value chase duration. */
export const DEFAULT_BAR_SMOOTH = DEFAULT_SERIES_SMOOTH;
/** Bar initial-load reveal — per-bar wave duration; the full intro lasts ~2×. */
export const DEFAULT_BAR_INTRO = DEFAULT_SERIES_INTRO;

/** Pie initial-load slice sweep — total clockwise unfurl duration on first seed. */
export const DEFAULT_PIE_ENTRY = 600;
/** Pie segment data-update chase. Parsed at config-time; wiring lands in a later phase. */
export const DEFAULT_PIE_UPDATE = 250;

// =============================================================================
// Axis durations
// =============================================================================

/**
 * Baseline settle time for the X spring on streaming retargets. Streaming
 * also feeds the cadence EMA which tunes the per-tick settle time to
 * `EMA × slack` (see `StreamingCadence.pickSettleMs`), so this constant is
 * the floor used until a few ticks have been observed.
 */
export const DEFAULT_X_SETTLE_MS = 200;

/**
 * One-shot settle time applied to X spring retargets driven by user gestures
 * (pan, wheel zoom) and programmatic `fitContent`. Stays short so wheel-zoom
 * sequences feel responsive — the streaming baseline can be 3× the producer
 * cadence (≥ 750 ms at 250 ms feeds) which would feel sluggish for a gesture.
 */
export const DEFAULT_X_GESTURE_MS = 150;

/**
 * Outward Y settle duration — applied when a bound moves *away* from the
 * current centre to reach a new extreme. Fast so the entering value doesn't
 * render off-canvas.
 */
export const DEFAULT_Y_SETTLE_MS = 250;

/**
 * Inward Y settle *cap* — the time to contract by a full range's worth after
 * a recent extreme leaves the window. The engine scales the actual contract
 * duration by the contraction magnitude (see {@link ViewportEngine}), so a
 * big outlier easing off takes the full budget (the long "sticky-Y" hold)
 * while a small recede finishes proportionally sooner. Long so the chart
 * holds the wider bound when an outlier scrolls off.
 */
export const DEFAULT_Y_STICKY_MAX_MS = 2500;

/**
 * Floor for the dynamic inward Y settle — the minimum contract duration, hit
 * by tiny contractions. Above it, duration scales with the contraction
 * magnitude up to {@link DEFAULT_Y_STICKY_MAX_MS}. Keeps small receders snappy
 * (no multi-second crawl over a few pixels) while still damping the
 * highest-frequency bound noise. A scalar `sticky` (equal min/max) restores
 * the legacy fixed-duration contract.
 */
export const DEFAULT_Y_STICKY_MIN_MS = 500;

/**
 * Short-ease applied to the Y animator while a user gesture is active.
 * Default Y sticky-contract (2500 ms) is intentionally long for streaming
 * feeds, but during pan/zoom the user explicitly chose a new view, so
 * contractions should converge in roughly one frame per wheel tick instead
 * of crawling over the full sticky budget.
 */
export const DEFAULT_Y_GESTURE_MS = 100;

/**
 * Default duration for {@link AnimationsConfig.toggle} — the cross-fade
 * applied to series alpha AND the one-shot Y-range re-fit override used for
 * the same toggle, so the fade and the axis adjustment settle on the same
 * frame.
 */
export const DEFAULT_TOGGLE_MS = 250;

/** Axis tick label cross-fade duration. */
export const DEFAULT_TICKS_MS = 250;

// =============================================================================
// Public `AnimationsConfig` input surface
// =============================================================================

/**
 * Animation behavior knobs grouped by surface:
 *
 * - `axis.y` — Y bound chase: pluggable curve, expand/contract/gesture
 *   settle times.
 * - `axis.x` — X viewport: streaming settle + gesture override.
 * - `axis.ticks` — axis tick label cross-fade.
 * - `toggle` — series visibility (alpha fade + Y re-fit, locked to one
 *   duration so they finish on the same frame).
 * - `series.{line,candlestick,bar,pie}` — per-series-type data tweens.
 *
 * Top-level `false` disables every animation category. `axis: false`
 * disables both axes and ticks. `axis.y: false` / `axis.x: false` disables
 * that axis only. Series-type-level `false` (`series: { line: false }`)
 * disables that type only.
 *
 * The per-series numeric fields (`entry` / `smooth` / `pulse`) also exist
 * on individual series options (`<XSeries options={{ entryMs }}>`). The
 * chart-level field acts as the default for any series that hasn't set its
 * own override; an explicit `series.<type>: false` (or top-level `false`)
 * is a hard disable that overrides per-series.
 */
export interface AnimationsConfig {
  /**
   * Axis-level animation. `false` collapses both axes and ticks to instant.
   */
  axis?:
    | false
    | {
        /**
         * Y bound chase. `false` snaps Y instantly.
         */
        y?:
          | false
          | {
              /** Y curve. See {@link hermite}, {@link spring}, {@link snap}. */
              curve?: TransitionFactory<YRange>;
              /**
               * Outward settle time — bound expanding to a new extreme.
               *
               * @default {@link DEFAULT_Y_SETTLE_MS}
               */
              settle?: AnimationTime;
              /**
               * Inward (contraction) settle — applied when a bound recedes
               * after an extreme leaves the window (the "sticky-Y" hold).
               *
               * - `{ min, max }` — **dynamic**: the contract duration scales
               *   with the contraction magnitude, from `min` (a tiny recede)
               *   up to `max` (a full-range contraction). Big outliers ease
               *   off slowly while small receders finish quickly, so the axis
               *   doesn't crawl for seconds over a few pixels. Either side
               *   falls back to its default when omitted.
               * - a scalar `AnimationTime` — **fixed**: `min === max`, every
               *   contraction takes the same time regardless of size (the
               *   legacy sticky feel). `false` snaps contractions instantly.
               *
               * @default `{ min:` {@link DEFAULT_Y_STICKY_MIN_MS}`, max:` {@link DEFAULT_Y_STICKY_MAX_MS}` }`
               */
              sticky?: AnimationTime | { min?: AnimationTime; max?: AnimationTime };
              /**
               * One-shot override during a user gesture (pan/zoom). Shorter
               * than `sticky` so contractions during interaction converge in
               * ~one frame per wheel tick.
               *
               * @default {@link DEFAULT_Y_GESTURE_MS}
               */
              gesture?: AnimationTime;
            };
        /**
         * X viewport. `false` snaps X instantly. The default critically-
         * damped spring carries velocity across retargets so wheel-zoom
         * sequences feel continuous and stream ticks blend smoothly into
         * gesture motion.
         */
        x?:
          | false
          | {
              /** X curve. See {@link spring}, {@link snap}. */
              curve?: TransitionFactory<VisibleRange>;
              /**
               * Streaming settle time. Spring reaches ~99% of the target
               * after this many ms. Used for streaming retargets; the
               * streaming-cadence EMA tunes the effective value upward when
               * data arrives slower than the baseline.
               *
               * @default {@link DEFAULT_X_SETTLE_MS}
               */
              settle?: AnimationTime;
              /**
               * One-shot override applied to user pan/zoom commits and to
               * programmatic `fitContent`.
               *
               * @default {@link DEFAULT_X_GESTURE_MS}
               */
              gesture?: AnimationTime;
            };
        /**
         * Axis tick label cross-fade. `false` makes tick relabel instant.
         *
         * @default {@link DEFAULT_TICKS_MS}
         */
        ticks?: AnimationTime;
      };
  /**
   * Series-visibility toggle duration. Drives BOTH the renderer's alpha
   * cross-fade and the engine's Y re-fit ease, so the two animations land
   * on the same frame. `false` makes `setSeriesVisible` instant.
   *
   * @default {@link DEFAULT_TOGGLE_MS}
   */
  toggle?: AnimationTime;
  /**
   * Per-series-type data animations. `false` disables every per-point
   * animation across every series. Setting a single type to `false`
   * (`series: { line: false }`) disables that type only.
   *
   * Per-series options (`<LineSeries options={{ entryMs, smoothMs, pulseMs }}>`)
   * win over chart-level numeric values. The chart-level field becomes the
   * default for series that don't set their own.
   */
  series?:
    | false
    | {
        /**
         * Line-series tweens. `false` disables all line animations
         * (entrance, live-smoothing, pulse).
         */
        line?:
          | false
          | {
              /**
               * Per-point entrance duration. `false` disables the entrance
               * (equivalent to `entryAnimation: 'none'`).
               *
               * @default {@link DEFAULT_LINE_ENTRY}
               */
              entry?: AnimationTime;
              /**
               * Initial-load reveal — the line draws itself left-to-right
               * on the first data seed, with a glowing head riding the
               * reveal front. The value is the per-element wave duration;
               * the full sweep lasts ~2×. `false` / `0` disables the intro.
               *
               * @default {@link DEFAULT_LINE_INTRO}
               */
              intro?: AnimationTime;
              /**
               * Last-value chase duration on `updateLastPoint`. `false` /
               * `0` snaps to the target instantly.
               *
               * @default {@link DEFAULT_LINE_SMOOTH}
               */
              smooth?: AnimationTime;
              /**
               * Halo cycle period at the line tail. Periodic loop, not a
               * one-shot. `false` / `0` turns the halo off entirely (drawing
               * and animation loop).
               *
               * @default {@link DEFAULT_LINE_PULSE}
               */
              pulse?: AnimationTime;
            };
        /**
         * Candlestick tweens. `false` disables candle entrance + OHLC chase.
         */
        candlestick?:
          | false
          | {
              /**
               * Per-candle entrance duration. `false` disables the entrance
               * (equivalent to `entryAnimation: 'none'`).
               *
               * @default {@link DEFAULT_CANDLESTICK_ENTRY}
               */
              entry?: AnimationTime;
              /**
               * Initial-load reveal — candles unfold in a left-to-right
               * wave on the first data seed. The value is the per-candle
               * wave duration; the full wave lasts ~2×. `false` / `0`
               * disables the intro.
               *
               * @default {@link DEFAULT_CANDLESTICK_INTRO}
               */
              intro?: AnimationTime;
              /**
               * Live OHLC chase duration on `updateLastPoint`. `false` / `0`
               * snaps to the target instantly.
               *
               * @default {@link DEFAULT_CANDLESTICK_SMOOTH}
               */
              smooth?: AnimationTime;
            };
        /**
         * Bar-series tweens. `false` disables bar entrance + value chase.
         */
        bar?:
          | false
          | {
              /**
               * Per-bar entrance duration. `false` disables the entrance
               * (equivalent to `entryAnimation: 'none'`).
               *
               * @default {@link DEFAULT_BAR_ENTRY}
               */
              entry?: AnimationTime;
              /**
               * Initial-load reveal — bars grow from the baseline in a
               * left-to-right wave on the first data seed. The value is the
               * per-bar wave duration; the full wave lasts ~2×. `false` /
               * `0` disables the intro.
               *
               * @default {@link DEFAULT_BAR_INTRO}
               */
              intro?: AnimationTime;
              /**
               * Live value chase duration on `updateLastPoint`. `false` /
               * `0` snaps to the target instantly.
               *
               * @default {@link DEFAULT_BAR_SMOOTH}
               */
              smooth?: AnimationTime;
            };
        /**
         * Pie segment entry/update tweens. `false` disables the slice
         * entry sweep (`update` is still parse-only; wiring lands in a
         * later phase).
         */
        pie?:
          | false
          | {
              /**
               * Initial-load reveal — slices unfurl clockwise over this
               * total duration on the first data seed, then the outside
               * labels chain in. `false` / `0` disables the intro.
               *
               * @default {@link DEFAULT_PIE_ENTRY}
               */
              entry?: AnimationTime;
              /**
               * Slice resize duration when data changes.
               *
               * @default {@link DEFAULT_PIE_UPDATE}
               */
              update?: AnimationTime;
            };
      };
}

// =============================================================================
// Resolved runtime shape — used internally by chart + viewport-engine
// =============================================================================

/** Resolved per-axis Y durations. */
export interface ResolvedYAxisAnimation {
  curve: TransitionFactory<YRange>;
  settleMs: number;
  /** Inward contract cap (public `sticky.max`) — full-range contraction. */
  stickyMs: number;
  /** Inward contract floor (public `sticky.min`) — a tiny recede. */
  stickyFloorMs: number;
  gestureMs: number;
}

/** Resolved per-axis X durations. */
export interface ResolvedXAxisAnimation {
  curve: TransitionFactory<VisibleRange>;
  settleMs: number;
  gestureMs: number;
}

/** Resolved per-series numeric durations (Pie has its own `updateMs`). */
export interface ResolvedSeriesAnimations {
  line: { entryMs: number; smoothMs: number; pulseMs: number; introMs: number };
  candlestick: { entryMs: number; smoothMs: number; introMs: number };
  bar: { entryMs: number; smoothMs: number; introMs: number };
  pie: { entryMs: number; updateMs: number };
}

const ZERO_SERIES_ANIMATIONS: ResolvedSeriesAnimations = {
  line: { entryMs: 0, smoothMs: 0, pulseMs: 0, introMs: 0 },
  candlestick: { entryMs: 0, smoothMs: 0, introMs: 0 },
  bar: { entryMs: 0, smoothMs: 0, introMs: 0 },
  pie: { entryMs: 0, updateMs: 0 },
};

/**
 * Parse the public `sticky` input into the resolved `[floor, cap]` duration
 * pair the engine consumes (`stickyFloorMs` / `stickyMs`):
 *
 * - object `{ min, max }` → dynamic range; each side falls back to its
 *   default when omitted.
 * - scalar `AnimationTime` (number / string / `false`) → fixed contract:
 *   floor equals cap, so magnitude-scaling is a no-op (the legacy feel).
 *   `false` resolves to `0` — contractions snap.
 * - omitted → the default dynamic range.
 */
function resolveSticky(raw: AnimationTime | { min?: AnimationTime; max?: AnimationTime } | undefined): {
  stickyMs: number;
  stickyFloorMs: number;
} {
  if (raw !== null && typeof raw === 'object') {
    return {
      stickyMs: resolveAnimationTime(raw.max, DEFAULT_Y_STICKY_MAX_MS),
      stickyFloorMs: resolveAnimationTime(raw.min, DEFAULT_Y_STICKY_MIN_MS),
    };
  }

  if (raw === undefined) {
    return { stickyMs: DEFAULT_Y_STICKY_MAX_MS, stickyFloorMs: DEFAULT_Y_STICKY_MIN_MS };
  }

  const fixed = resolveAnimationTime(raw, DEFAULT_Y_STICKY_MAX_MS);

  return { stickyMs: fixed, stickyFloorMs: fixed };
}

/**
 * Resolved animation config. Pass the user's `ChartOptions.animations` to
 * {@link AnimationConfig.resolve} once at chart construction; reads stay
 * O(1) and the merge helpers below produce per-series option payloads
 * for the renderer factories.
 *
 * @internal
 */
export class AnimationConfig {
  readonly axis: {
    y: ResolvedYAxisAnimation;
    x: ResolvedXAxisAnimation;
    ticksMs: number;
  };
  readonly toggleMs: number;
  readonly series: ResolvedSeriesAnimations;

  private constructor(
    axis: { y: ResolvedYAxisAnimation; x: ResolvedXAxisAnimation; ticksMs: number },
    toggleMs: number,
    series: ResolvedSeriesAnimations,
  ) {
    this.axis = axis;
    this.toggleMs = toggleMs;
    this.series = series;
  }

  /**
   * Collapse the public `animations` surface into a resolved config.
   * `animations: false` disables everything; category-level `false`
   * disables every field in that category; otherwise missing fields
   * inherit built-in defaults.
   */
  static resolve(input: boolean | AnimationsConfig | undefined): AnimationConfig {
    if (input === false) {
      return new AnimationConfig(
        {
          y: { curve: snap(), settleMs: 0, stickyMs: 0, stickyFloorMs: 0, gestureMs: 0 },
          x: { curve: snap(), settleMs: 0, gestureMs: 0 },
          ticksMs: 0,
        },
        0,
        ZERO_SERIES_ANIMATIONS,
      );
    }

    const cfg = input === true || input === undefined ? undefined : input;
    const rawAxis = cfg?.axis;
    const rawY = rawAxis === false ? false : rawAxis?.y;
    const rawX = rawAxis === false ? false : rawAxis?.x;
    const rawTicks = rawAxis === false ? false : rawAxis?.ticks;
    const rawToggle = cfg?.toggle;
    const rawSeries = cfg?.series;

    const y: ResolvedYAxisAnimation =
      rawY === false
        ? {
            curve: snap(),
            settleMs: 0,
            stickyMs: 0,
            stickyFloorMs: 0,
            gestureMs: 0,
          }
        : {
            curve: rawY?.curve ?? hermite(),
            settleMs: resolveAnimationTime(rawY?.settle, DEFAULT_Y_SETTLE_MS),
            ...resolveSticky(rawY?.sticky),
            gestureMs: resolveAnimationTime(rawY?.gesture, DEFAULT_Y_GESTURE_MS),
          };

    const x: ResolvedXAxisAnimation =
      rawX === false
        ? {
            curve: snap<VisibleRange>(),
            settleMs: 0,
            gestureMs: 0,
          }
        : {
            curve: rawX?.curve ?? spring<VisibleRange>(),
            settleMs: resolveAnimationTime(rawX?.settle, DEFAULT_X_SETTLE_MS),
            gestureMs: resolveAnimationTime(rawX?.gesture, DEFAULT_X_GESTURE_MS),
          };

    const ticksMs = rawTicks === false ? 0 : resolveAnimationTime(rawTicks, DEFAULT_TICKS_MS);
    const toggleMs = resolveAnimationTime(rawToggle, DEFAULT_TOGGLE_MS);
    const series = resolveSeriesAnimations(rawSeries);

    return new AnimationConfig({ y, x, ticksMs }, toggleMs, series);
  }

  /**
   * Per-renderer-type chart-level option payload — merged BEFORE user
   * series options so explicit per-series options always win. Forwards
   * the resolved `entryMs` / `smoothMs` / `pulseMs` straight into the
   * renderer's option shape. `pulseMs` is line-only; bars / candles
   * ignore it.
   */
  defaults(kind: SeriesKind): Record<string, unknown> {
    if (kind === 'line') {
      const { entryMs, smoothMs, pulseMs, introMs } = this.series.line;

      return { entryMs, smoothMs, pulseMs, introMs };
    }

    if (kind === 'candlestick') {
      const { entryMs, smoothMs, introMs } = this.series.candlestick;

      return { entryMs, smoothMs, introMs };
    }

    if (kind === 'pie') {
      const { entryMs, updateMs } = this.series.pie;

      return { entryMs, updateMs };
    }

    const { entryMs, smoothMs, introMs } = this.series.bar;

    return { entryMs, smoothMs, introMs };
  }

  /**
   * Chart-level forced overrides — `animations.series.<type>: false` (or
   * any category set to `false`) is documented as a hard disable. Merged
   * AFTER user options so the disable can't be undone at the per-series
   * layer.
   */
  overrides(kind: SeriesKind): Record<string, unknown> {
    const out: Record<string, unknown> = {};

    if (kind === 'line') {
      const { entryMs, smoothMs, pulseMs, introMs } = this.series.line;
      if (entryMs === 0) out.entryMs = 0;
      if (smoothMs === 0) out.smoothMs = 0;
      if (pulseMs === 0) out.pulseMs = 0;
      if (introMs === 0) out.introMs = 0;

      return out;
    }

    if (kind === 'pie') {
      // Only `entry` (the slice sweep) is wired; `update` stays parse-only.
      if (this.series.pie.entryMs === 0) out.entryMs = 0;

      return out;
    }

    const { entryMs, smoothMs, introMs } = kind === 'candlestick' ? this.series.candlestick : this.series.bar;
    if (entryMs === 0) out.entryMs = 0;
    if (smoothMs === 0) out.smoothMs = 0;
    if (introMs === 0) out.introMs = 0;

    return out;
  }
}

function resolveSeriesAnimations(raw: AnimationsConfig['series'] | undefined): ResolvedSeriesAnimations {
  if (raw === false) return ZERO_SERIES_ANIMATIONS;

  const rawLine = raw?.line;
  const rawCandle = raw?.candlestick;
  const rawBar = raw?.bar;
  const rawPie = raw?.pie;

  const line =
    rawLine === false
      ? { entryMs: 0, smoothMs: 0, pulseMs: 0, introMs: 0 }
      : {
          entryMs: resolveAnimationTime(rawLine?.entry, DEFAULT_LINE_ENTRY),
          smoothMs: resolveAnimationTime(rawLine?.smooth, DEFAULT_LINE_SMOOTH),
          pulseMs: resolveAnimationTime(rawLine?.pulse, DEFAULT_LINE_PULSE),
          introMs: resolveAnimationTime(rawLine?.intro, DEFAULT_LINE_INTRO),
        };

  const candlestick =
    rawCandle === false
      ? { entryMs: 0, smoothMs: 0, introMs: 0 }
      : {
          entryMs: resolveAnimationTime(rawCandle?.entry, DEFAULT_CANDLESTICK_ENTRY),
          smoothMs: resolveAnimationTime(rawCandle?.smooth, DEFAULT_CANDLESTICK_SMOOTH),
          introMs: resolveAnimationTime(rawCandle?.intro, DEFAULT_CANDLESTICK_INTRO),
        };

  const bar =
    rawBar === false
      ? { entryMs: 0, smoothMs: 0, introMs: 0 }
      : {
          entryMs: resolveAnimationTime(rawBar?.entry, DEFAULT_BAR_ENTRY),
          smoothMs: resolveAnimationTime(rawBar?.smooth, DEFAULT_BAR_SMOOTH),
          introMs: resolveAnimationTime(rawBar?.intro, DEFAULT_BAR_INTRO),
        };

  const pie =
    rawPie === false
      ? { entryMs: 0, updateMs: 0 }
      : {
          entryMs: resolveAnimationTime(rawPie?.entry, DEFAULT_PIE_ENTRY),
          updateMs: resolveAnimationTime(rawPie?.update, DEFAULT_PIE_UPDATE),
        };

  return { line, candlestick, bar, pie };
}

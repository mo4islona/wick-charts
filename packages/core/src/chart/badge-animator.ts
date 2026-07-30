import { ScalarSpring } from '../animation/scalar-spring';

export interface BadgeFrameInput {
  /** Latest reported last value (already intra-bar smoothed by the renderer). */
  target: number;
  /**
   * Value at the left edge of the visible window — the count-up start during
   * the initial-load intro. Ignored once the intro has settled.
   */
  firstVisible: number;
  /** Intro reveal front in `[0, 1]` (see {@link ChartInstance.getIntroFront}); `1` when settled. */
  introFront: number;
  /** Wall clock for this frame, typically `performance.now()`. */
  now: number;
  /** Glide the vertical position across value jumps. `false` snaps. Default `true`. */
  glide?: boolean;
  /** Count the value up from `firstVisible` to `target` during the intro. `false` shows the final value. Default `true`. */
  countUp?: boolean;
  /** Settle time (ms) for the value glide. Defaults to {@link DEFAULT_SETTLE_MS}. */
  settleMs?: number;
  /** Skip all easing — snap to the target and stay opaque (reduced-motion). */
  reducedMotion?: boolean;
}

export interface BadgeFrameOutput {
  /** Value that drives the badge's vertical position (the glide). */
  positionValue: number;
  /**
   * Value that drives the badge's digits. Discrete in steady state — it steps
   * once per real data point so the digit roll fires per point, not per frame
   * — and follows the count-up during the intro.
   */
  textValue: number;
  /** Entrance opacity in `[0, 1]`. */
  opacity: number;
  /** True while the badge still needs frames. */
  animating: boolean;
}

/** Steady-state settle time for the append glide (ms). */
const DEFAULT_SETTLE_MS = 320;
/** Fraction of the reveal over which the badge fades up from transparent. */
const FADE_BAND = 0.15;

/**
 * Owns the last-value badge's motion so the three framework `YLabel`s stay
 * thin and behave identically. Two distinct outputs so the digits don't churn
 * on every animation frame:
 *
 * - **{@link BadgeFrameOutput.positionValue}** — a single velocity-continuous
 *   {@link ScalarSpring} that always chases the target, so the badge glides to
 *   each new value and never snaps. Mid-flight retargets carry velocity (the
 *   spring's whole reason for being), so a jump mid-glide stays smooth rather
 *   than stepping. It never returns the raw target, so there is no
 *   settle-frame discontinuity.
 * - **{@link BadgeFrameOutput.textValue}** — the raw target in steady state, so
 *   the digit roll fires once per real point (not per frame); the count-up
 *   value during the intro.
 *
 * During the initial-load reveal the value counts from the first visible sample
 * to the last, locked to the draw front, and the badge fades in.
 *
 * Framework `YLabel`s drive {@link frame} once per animation frame.
 */
export class BadgeAnimator {
  #spring: ScalarSpring;
  #lastTarget: number;
  #seeded = false;

  constructor(initial: number) {
    this.#spring = new ScalarSpring(initial);
    this.#lastTarget = initial;
  }

  frame(input: BadgeFrameInput): BadgeFrameOutput {
    const { target, firstVisible, introFront, now, glide = true, countUp = true, reducedMotion = false } = input;

    // Fully static: reduced motion, or the caller opted out of all badge motion
    // (`animate={false}` → glide + countUp both off). Snap to the value, stay
    // fully opaque, and ask for no further frames — no perpetual rAF, and no
    // intro fade that would freeze half-transparent because `animating` is
    // false and the loop never reschedules to finish it.
    if (reducedMotion || (!glide && !countUp)) {
      this.#spring.snap(target, { now });
      this.#lastTarget = target;
      this.#seeded = true;

      return { positionValue: target, textValue: target, opacity: 1, animating: false };
    }

    // Initial-load intro: fade in over the leading slice, and — when countUp is
    // on — count first → last in lockstep with the reveal front. `countUp` and
    // `glide` are independent here: `glide: false` only snaps the steady-state
    // append below, it does not disable the intro count-up. Keep the spring
    // pinned to the shown value so the first post-intro frame glides from here,
    // not from a stale seed.
    if (introFront < 1) {
      const counted = firstVisible + (target - firstVisible) * introFront;
      const shown = countUp ? counted : target;
      this.#spring.snap(shown, { now });
      this.#lastTarget = shown;
      this.#seeded = true;

      return { positionValue: shown, textValue: shown, opacity: this.#introOpacity(introFront), animating: true };
    }

    // First settled frame after any intro: land on the value with no glide —
    // there's nothing to ease from yet.
    if (!this.#seeded) {
      this.#spring.snap(target, { now });
      this.#lastTarget = target;
      this.#seeded = true;

      return { positionValue: target, textValue: target, opacity: 1, animating: false };
    }

    // Steady state with glide off: snap the position to each new value with no
    // easing and no in-flight frames.
    if (!glide) {
      this.#spring.snap(target, { now });
      this.#lastTarget = target;

      return { positionValue: target, textValue: target, opacity: 1, animating: false };
    }

    // A non-positive settle time means "track instantly" — the spring would
    // substitute its internal ~250ms fallback for it, which is slower than
    // any positive value the caller could ask for. Snap instead, keeping the
    // glide-on-intro behavior the caller opted into elsewhere.
    const settleMs = input.settleMs ?? DEFAULT_SETTLE_MS;
    if (settleMs <= 0) {
      this.#spring.snap(target, { now });
      this.#lastTarget = target;

      return { positionValue: target, textValue: target, opacity: 1, animating: false };
    }

    // Steady state: one velocity-continuous spring always chases the target, so
    // the badge glides to each new value and never snaps. Retarget only on a
    // real change so a still target settles cleanly; the spring itself carries
    // velocity across a jump that lands mid-glide, so there is no kick and no
    // settle-frame step.
    if (Math.abs(target - this.#lastTarget) > EPS) {
      this.#spring.retarget(target, { now, settleMs });
      this.#lastTarget = target;
    }

    const animating = this.#spring.tick(now);

    return { positionValue: this.#spring.current, textValue: target, opacity: 1, animating };
  }

  #introOpacity(introFront: number): number {
    if (introFront >= 1) return 1;

    return clamp01(introFront / FADE_BAND);
  }
}

/** Below this value-space delta a retarget is a no-op — avoids per-frame churn on a still target. */
const EPS = 1e-9;

function clamp01(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;

  return value;
}

/** Fine-grained badge motion tuning. See the framework `YLabel`'s `animate` prop. */
export interface YLabelAnimateOptions {
  /** Glide the badge vertically across value jumps instead of snapping. Default `true`. */
  glide?: boolean;
  /** Count the value up from the first visible sample to the last during the initial reveal. Default `true`. */
  countUp?: boolean;
  /** Settle time (ms) for the vertical glide. Default {@link DEFAULT_SETTLE_MS}. */
  settleMs?: number;
}

/**
 * Badge motion: `true` (default) glides + counts up + fades in with the intro;
 * `false` snaps with no easing (the pre-animation behavior); an object tunes
 * individual parts.
 */
export type YLabelAnimate = boolean | YLabelAnimateOptions;

/** The resolved, fully-defaulted form of {@link YLabelAnimate}. */
export interface ResolvedAnimate {
  glide: boolean;
  countUp: boolean;
  settleMs: number;
}

/**
 * Normalize a {@link YLabelAnimate} into a fully-defaulted {@link ResolvedAnimate}.
 * Shared by the React / Vue / Svelte `YLabel`s so the defaults never drift.
 */
export function resolveAnimate(animate: YLabelAnimate | undefined): ResolvedAnimate {
  if (animate === false) return { glide: false, countUp: false, settleMs: 0 };
  if (animate === undefined || animate === true) return { glide: true, countUp: true, settleMs: DEFAULT_SETTLE_MS };

  return {
    glide: animate.glide ?? true,
    countUp: animate.countUp ?? true,
    settleMs: animate.settleMs ?? DEFAULT_SETTLE_MS,
  };
}

/** The slice of the chart API the badge count-up start reads. {@link ChartInstance} satisfies it. */
export interface BadgeChartQuery {
  getVisibleRange(): { from: number; to: number };
  getStackedValueAtTime(seriesId: string, time: number): number | null;
}

/**
 * Value at the left edge of the visible window — the intro count-up start.
 * Uses the stacked-aware lookup so the start shares a basis with the badge's
 * target (the stack total), instead of a bottom-layer raw sample; falls back
 * to `fallback` (the target) when the edge has no sample.
 */
export function firstVisibleValue(chart: BadgeChartQuery, seriesId: string, fallback: number): number {
  const { from } = chart.getVisibleRange();
  const value = chart.getStackedValueAtTime(seriesId, from);

  return value ?? fallback;
}

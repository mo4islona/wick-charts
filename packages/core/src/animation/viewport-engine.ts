/**
 * ViewportEngine — single-responsibility state machine for the chart's X / Y
 * viewport animations.
 *
 * Inputs are push signals from the chart (`onPointAppended`,
 * `onSeriesVisibilityChanged`, `onPanZoom`, `onProgrammaticZoom`,
 * `onAxisReconfig`, `onDataReplaced`, `snap`). Targets are pulled on demand
 * via the two callbacks the chart supplies at construction time —
 * `computeXTarget` and `computeYTarget` — so the engine itself stays free of
 * series / data-store knowledge.
 *
 * **Implicit ordering contract:** the chart must mutate its own series /
 * dataInterval / chartWidth state BEFORE calling any `on*` signal. Otherwise,
 * the callback reads stale data, and the engine targets the previous frame's
 * state.
 *
 * Internals: one pluggable {@link Transition} per axis (Hermite / Spring /
 * Snap on Y, Spring / Snap on X), plus one more Y transition per named scale
 * (see {@link ViewportEngine.setYScales}) — every Y signal reaches all of them.
 * No event queue, no slot priority — every `on*` retargets immediately.
 * Per-call durations come from the engine's grouped `y` / `x` opts; the
 * curves themselves carry no baseline.
 */

import type { XRange, YRange } from '../types';
import type { Milliseconds } from './time';
import type { Transition, TransitionFactory } from './transition';

/**
 * Per-frame engine snapshot — same shape returned by the legacy
 * `AnimationEngine.tick()` so existing consumers (chart render loop,
 * `chart.getAnimationState()` public API, series overlay hooks) keep working.
 */
export interface AnimationState {
  readonly xRange: XRange;
  readonly yRange: YRange;
  readonly animating: boolean;
}

export interface PanZoomOptions {
  /** Final logical X range the user is committing to. */
  xTarget: XRange;
  /**
   * When `true`, also recompute the Y target via the injected callback —
   * the visible-data window changed so the auto-fit Y should follow.
   * Set `false` (or omit) for pan / zoom modes that keep Y fixed.
   */
  yAuto?: boolean;
}

export interface ProgrammaticZoomOptions {
  /** Final logical X range. */
  xTarget: XRange;
  /**
   * When `true`, X eases to the new target (used by `fitContent` so the
   * viewport slides into the new window alongside the Y re-fit). When
   * omitted / `false`, X snaps instantly (used by `setVisibleRange`,
   * where consumers read `chart.getVisibleRange()` synchronously after
   * and expect the new target immediately).
   */
  xEase?: boolean;
}

export interface SnapTarget {
  x?: XRange;
  y?: YRange;
  /** Y ranges for named scales, by scale id. */
  scales?: Readonly<Record<string, YRange>>;
}

export interface ViewportEngineYOptions {
  /** Y curve factory (hermite / spring / snap). */
  curve: TransitionFactory<YRange>;
  /** Outward settle time — bound expanding to a new extreme. */
  settleMs: Milliseconds;
  /**
   * Inward settle *cap* — the time to contract by a full range's worth after
   * an extreme leaves the window (sticky-Y). The engine scales each contract
   * between {@link stickyFloorMs} and this by the contraction magnitude.
   */
  stickyMs: Milliseconds;
  /** Floor for the dynamic inward settle — shortest contract, hit by tiny
   *  receders. Equal to {@link stickyMs} ⇒ fixed-duration sticky. */
  stickyFloorMs: Milliseconds;
  /** One-shot override during a user gesture. */
  gestureMs: Milliseconds;
  /** One-shot override on `onSeriesVisibilityChanged`. */
  toggleMs: Milliseconds;
}

export interface ViewportEngineXOptions {
  /** X curve factory (spring / snap). */
  curve: TransitionFactory<XRange>;
  /**
   * Streaming baseline settle time. The cadence EMA mutates this at runtime
   * via {@link ViewportEngine.setXSettleMs} so the spring tracks the producer
   * cadence; the engine re-reads the latest value on every streaming retarget.
   */
  settleMs: Milliseconds;
  /** One-shot override during a user gesture or programmatic zoom. */
  gestureMs: Milliseconds;
}

export interface ViewportEngineOptions {
  initial: { yRange: YRange; xRange: XRange };
  y: ViewportEngineYOptions;
  x: ViewportEngineXOptions;
  /**
   * Compute the next logical X target. Returning `null` skips the X
   * retarget (warm-up hold, visible window already covers the new data).
   */
  computeXTarget(): XRange | null;
  /**
   * Compute the Y target that matches `xTarget` — for the named `scale`, or
   * the default one when it's absent. Returning `null` skips that scale's
   * retarget — used when none of its series carries data in the window.
   */
  computeYTarget(args: { xTarget: XRange; scale?: string }): YRange | null;
  /** Fires once when an idle engine receives a new signal; host restarts RAF. */
  onWake?: () => void;
}

/**
 * Gesture lock-out window. After a user pan/zoom, `onPointAppended` is
 * blocked for this many milliseconds so the next stream tick doesn't fight
 * the gesture's destination. With spring-based X, the lockout is shorter
 * than the spring's settle time on purpose — once the lockout passes, the
 * spring smoothly absorbs the next stream tick as a fresh retarget with
 * carried velocity.
 */
const X_GESTURE_LOCKOUT_MS = 100;

interface YState {
  readonly transition: Transition<YRange>;
  settleMs: Milliseconds;
  stickyMs: Milliseconds;
  stickyFloorMs: Milliseconds;
  gestureMs: Milliseconds;
  toggleMs: Milliseconds;
  /**
   * Wall-time deadline after which streaming Y retargets resume. Set when a
   * toggle starts so noisy `onPointAppended` ticks can't override the
   * toggleMs-paced ease with sticky-Y mid-flight (the source of the visible
   * Y "bounce" when toggling during a live stream). X is unaffected — only
   * the Y retarget inside `onPointAppended` is gated.
   */
  toggleUntil: number;
  /** `false` until the first target lands — that one snaps, so a scale added
   *  mid-session doesn't ease in from the initial empty range. */
  primed: boolean;
}

/** A Y slot paired with its freshly computed target (`null` = no retarget). */
interface YRetarget {
  readonly y: YState;
  readonly target: YRange | null;
}

interface XState {
  readonly transition: Transition<XRange>;
  settleMs: Milliseconds;
  gestureMs: Milliseconds;
  /** Most recently committed X target. Autoscroll consults this to see the
   *  logical destination, not the in-flight visual. */
  lastTarget: XRange | null;
  /**
   * Wall-time deadline after which `onPointAppended` is allowed to retarget
   * again. While a gesture is active, the chart streams should not fight the
   * user's wheel/pinch destination — blocking the body of `onPointAppended`
   * keeps X and Y in lockstep with the gesture target until the lock-out
   * expires.
   */
  gestureUntil: number;
}

export class ViewportEngine {
  readonly #y: YState;
  /** Y slots of the named scales, keyed by scale id. */
  readonly #scaleY = new Map<string, YState>();
  readonly #yOpts: ViewportEngineYOptions;
  readonly #x: XState;
  readonly #computeX: () => XRange | null;
  readonly #computeY: (args: { xTarget: XRange; scale?: string }) => YRange | null;
  readonly #onWake: (() => void) | undefined;
  /** Per-frame `animating` snapshot — updated by `tick` so `get animating()`
   *  is O(1). Spans both axes; lives at the engine root rather than in
   *  XState/YState because it's a cross-axis flag. */
  #lastAnimating = false;

  constructor(opts: ViewportEngineOptions) {
    this.#yOpts = opts.y;
    this.#y = this.#createY({ initial: opts.initial.yRange, primed: true });
    this.#x = {
      transition: opts.x.curve({ initial: opts.initial.xRange }),
      settleMs: opts.x.settleMs,
      gestureMs: opts.x.gestureMs,
      lastTarget: null,
      gestureUntil: 0,
    };
    this.#computeX = opts.computeXTarget;
    this.#computeY = opts.computeYTarget;
    this.#onWake = opts.onWake;
  }

  // --- Helpers -------------------------------------------------------------

  #createY(args: { initial: YRange; primed: boolean }): YState {
    const opts = this.#yOpts;

    return {
      transition: opts.curve({ initial: args.initial }),
      settleMs: opts.settleMs,
      stickyMs: opts.stickyMs,
      stickyFloorMs: opts.stickyFloorMs,
      gestureMs: opts.gestureMs,
      toggleMs: opts.toggleMs,
      toggleUntil: 0,
      primed: args.primed,
    };
  }

  /** Every Y slot with the target the chart computes for it against `xTarget`. */
  #yRetargets(xTarget: XRange): YRetarget[] {
    const result: YRetarget[] = [{ y: this.#y, target: this.#computeY({ xTarget }) }];
    for (const [scale, y] of this.#scaleY) {
      result.push({ y, target: this.#computeY({ xTarget, scale }) });
    }

    return result;
  }

  /** Ease a Y slot to `target` — or snap, when it's the slot's first target. */
  #retargetY(y: YState, target: YRange, opts: { now: number; expandMs: Milliseconds; contractMs: Milliseconds }): void {
    if (!y.primed) {
      this.#snapY(y, target, opts.now);

      return;
    }

    y.transition.retarget(target, opts);
  }

  #snapY(y: YState, target: YRange, now: number): void {
    y.transition.snap(target, { now });
    y.primed = true;
  }

  #yAnimating(): boolean {
    if (this.#y.transition.animating) return true;

    for (const y of this.#scaleY.values()) {
      if (y.transition.animating) return true;
    }

    return false;
  }

  /**
   * Retarget X and record `#x.lastTarget` — autoscroll consults that field for
   * the logical destination, not the in-flight visual.
   *
   * `settleMs` is the per-call settle time. Gestures pass `#x.gestureMs`
   * (fast — responsive feel) while stream ticks pass `#x.settleMs` (the
   * cadence-tuned baseline).
   */
  #retargetX(target: XRange, now: number, settleMs: Milliseconds): void {
    this.#x.transition.retarget(target, { now, expandMs: settleMs });
    this.#x.lastTarget = { from: target.from, to: target.to };
  }

  #snapX(target: XRange, now: number): void {
    this.#x.transition.snap({ from: target.from, to: target.to }, { now });
    this.#x.lastTarget = { from: target.from, to: target.to };
  }

  /** Fire `onWake` once when an idle engine receives a new retarget. */
  #wake(wasIdle: boolean): void {
    if (wasIdle) this.#onWake?.();
  }

  /**
   * Magnitude-scaled inward (sticky) settle time. The configured `stickyMs`
   * is the budget for contracting a *full range* worth; the duration handed
   * to the curve scales with how far the bound actually recedes, so the
   * inward speed stays roughly constant: a big outlier easing off uses the
   * full sticky hold while a small recede finishes near the floor instead of
   * crawling over the whole budget.
   *
   * The magnitude is the larger of the two sides' inward deltas (the side
   * that contracts most sets the pace), normalized by the current visible
   * range. The curve applies the returned duration only to sides that are
   * actually contracting — expanding sides always use `settleMs` — so a
   * single value here is correct even when one bound expands while the other
   * contracts. `stickyFloorMs === stickyMs` collapses this back to a fixed
   * duration.
   */
  #contractMs(y: YState, next: YRange): Milliseconds {
    const cur = y.transition.current;
    const sticky = y.stickyMs;
    if (sticky <= 0) return sticky;

    const range = Math.max(cur.max - cur.min, Number.EPSILON);
    const inwardMin = Math.max(0, next.min - cur.min);
    const inwardMax = Math.max(0, cur.max - next.max);
    const fraction = Math.min(1, Math.max(inwardMin, inwardMax) / range);

    const floor = Math.min(y.stickyFloorMs, sticky);

    return Math.max(floor, sticky * fraction);
  }

  // --- Inputs --------------------------------------------------------------

  onPointAppended(now?: number): void {
    const startWall = now ?? performance.now();
    if (startWall < this.#x.gestureUntil) return;

    const newX = this.#computeX();
    const yWindow = newX ?? this.#x.transition.target;
    const retargets = this.#yRetargets(yWindow);
    const anyY = retargets.some((r) => r.target !== null);
    if (newX === null && !anyY) return;

    const wasIdle = !this.#lastAnimating;
    if (newX !== null) this.#retargetX(newX, startWall, this.#x.settleMs);

    for (const { y, target } of retargets) {
      // Y is locked out during a toggle window (`onSeriesVisibilityChanged`
      // set the deadline) — X still tracks the stream so the scroll keeps
      // pace, but Y stays on its toggleMs ease until the lockout expires.
      const yLocked = startWall < y.toggleUntil;
      if (target === null || yLocked) continue;

      this.#retargetY(y, target, {
        now: startWall,
        expandMs: y.settleMs,
        contractMs: this.#contractMs(y, target),
      });
    }
    this.#wake(wasIdle);
  }

  onSeriesVisibilityChanged(now?: number): void {
    const retargets = this.#yRetargets(this.#x.transition.target);
    if (retargets.every((r) => r.target === null)) return;

    const startWall = now ?? performance.now();
    const wasIdle = !this.#lastAnimating;
    for (const { y, target } of retargets) {
      if (target === null) continue;

      if (y.toggleMs > 0 && y.primed) {
        // Discrete event — zero velocity before the new ease so the curve
        // doesn't carry momentum from an in-flight streaming retarget into
        // the toggle (visible as a Y "bounce" mid-stream).
        y.transition.snap(y.transition.current, { now: startWall });
        y.transition.retarget(target, {
          now: startWall,
          expandMs: y.toggleMs,
          contractMs: y.toggleMs,
        });
        // Lock out streaming Y retargets for the toggle window — without
        // this, `onPointAppended` ticks fire mid-toggle with `contractMs:
        // stickyMs` and overwrite the toggleMs-paced ease.
        y.toggleUntil = startWall + y.toggleMs;
      } else {
        // Zero-duration toggle (animations.toggle = 0 / false). Snap the Y
        // straight to the new target; `retarget` with duration 0 would feed
        // Infinity into the Spring's ω and NaN out the next sample.
        this.#snapY(y, target, startWall);
        y.toggleUntil = 0;
      }
    }
    this.#wake(wasIdle);
  }

  onPanZoom(opts: PanZoomOptions, now?: number): void {
    const startWall = now ?? performance.now();
    const wasIdle = !this.#lastAnimating;

    this.#retargetX(opts.xTarget, startWall, this.#x.gestureMs);
    this.#x.gestureUntil = startWall + X_GESTURE_LOCKOUT_MS;

    if (opts.yAuto) {
      for (const { y, target } of this.#yRetargets(opts.xTarget)) {
        if (target === null) continue;

        this.#retargetY(y, target, {
          now: startWall,
          expandMs: y.gestureMs,
          contractMs: y.gestureMs,
        });
      }
    }
    this.#wake(wasIdle);
  }

  onAxisReconfig(now?: number): void {
    const retargets = this.#yRetargets(this.#x.transition.target);
    if (retargets.every((r) => r.target === null)) return;

    const startWall = now ?? performance.now();
    const wasIdle = !this.#lastAnimating;
    for (const { y, target } of retargets) {
      if (target !== null) this.#snapY(y, target, startWall);
    }
    this.#wake(wasIdle);
  }

  onProgrammaticZoom(opts: ProgrammaticZoomOptions, now?: number): void {
    this.#x.gestureUntil = 0;
    const retargets = this.#yRetargets(opts.xTarget);
    const startWall = now ?? performance.now();
    const wasIdle = !this.#lastAnimating;

    if (opts.xEase === true) {
      this.#retargetX(opts.xTarget, startWall, this.#x.gestureMs);
    } else {
      this.#snapX(opts.xTarget, startWall);
    }

    for (const { y, target } of retargets) {
      if (target === null) continue;

      this.#retargetY(y, target, {
        now: startWall,
        expandMs: y.settleMs,
        contractMs: this.#contractMs(y, target),
      });
    }
    this.#wake(wasIdle);
  }

  onDataReplaced(now?: number): void {
    const newX = this.#computeX();
    const retargets = this.#yRetargets(newX ?? this.#x.transition.target);
    const anyY = retargets.some((r) => r.target !== null);
    if (newX === null && !anyY) return;

    const startWall = now ?? performance.now();
    const wasIdle = !this.#lastAnimating;
    if (newX !== null) this.#snapX(newX, startWall);

    for (const { y, target } of retargets) {
      if (target !== null) this.#snapY(y, target, startWall);
    }
    this.#wake(wasIdle);
  }

  snap(target: SnapTarget, now?: number): void {
    this.#x.gestureUntil = 0;
    const startWall = now ?? performance.now();
    const wasIdle = !this.#lastAnimating;
    if (target.x !== undefined) this.#snapX(target.x, startWall);
    if (target.y !== undefined) this.#snapY(this.#y, target.y, startWall);

    for (const [scale, range] of Object.entries(target.scales ?? {})) {
      const y = this.#scaleY.get(scale);
      if (y !== undefined) this.#snapY(y, range, startWall);
    }
    this.#wake(wasIdle);
  }

  /**
   * Keep one Y slot per named scale: add slots for new ids (empty until their
   * first target, which snaps) and drop slots for ids no longer listed.
   */
  setYScales(ids: readonly string[]): void {
    for (const id of this.#scaleY.keys()) {
      if (!ids.includes(id)) this.#scaleY.delete(id);
    }

    for (const id of ids) {
      if (this.#scaleY.has(id)) continue;

      this.#scaleY.set(id, this.#createY({ initial: { min: 0, max: 0 }, primed: false }));
    }
  }

  // --- Outputs -------------------------------------------------------------

  tick(now: number): AnimationState {
    this.#x.transition.tick(now);
    this.#y.transition.tick(now);
    for (const y of this.#scaleY.values()) {
      y.transition.tick(now);
    }

    const animating = this.#x.transition.animating || this.#yAnimating();
    this.#lastAnimating = animating;

    return {
      xRange: this.#x.transition.current,
      yRange: this.#y.transition.current,
      animating,
    };
  }

  getAnimationState(): AnimationState {
    return {
      xRange: this.#x.transition.current,
      yRange: this.#y.transition.current,
      animating: this.animating,
    };
  }

  /** Current (eased) Y of a named scale, `null` for an unknown id. */
  getScaleYRange(scale: string): YRange | null {
    return this.#scaleY.get(scale)?.transition.current ?? null;
  }

  getTarget(): { x: XRange; y: YRange } {
    return { x: this.#x.transition.target, y: this.#y.transition.target };
  }

  get animating(): boolean {
    return this.#x.transition.animating || this.#yAnimating();
  }

  get lastXTarget(): XRange | null {
    return this.#x.lastTarget;
  }

  setXSettleMs(settleMs: number): void {
    this.#x.settleMs = settleMs;
  }
}

export function createViewportEngine(opts: ViewportEngineOptions): ViewportEngine {
  return new ViewportEngine(opts);
}

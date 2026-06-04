export interface ScalarSpringRetargetOptions {
  /** Optional wall clock. Defaults to `performance.now()`. */
  now?: number;
  /** Settle time (ms): the spring reaches ~99% of the target after this long. */
  settleMs?: number;
}

/** Default ω if `retarget` is ever called without a settle time. */
const FALLBACK_MS = 250;
const FALLBACK_OMEGA = 4.6 / (FALLBACK_MS / 1000);

/**
 * Critically-damped scalar spring — the per-side math of {@link YRangeSpring}
 * extracted for single-value chases (the live OHLC / line / bar value
 * smoothing on `updateLastPoint`).
 *
 * Why a spring instead of an easing {@link Animator}: every `retarget` while a
 * tween is in flight restarts the easing curve from the current position, so
 * each retarget injects a fresh acceleration ramp — easeOutCubic's derivative
 * is maximal at t=0 — the visible "kick" on feeds that tick faster than the
 * settle window. The spring keeps the current velocity at retarget time and
 * just pulls toward the new target, so motion stays velocity-continuous
 * through any number of mid-flight target changes.
 *
 * Closed-form critically-damped solution `x(t) = target + (a + b·t)·e^(−ωt)`
 * (`a = x₀ − target`, `b = v₀ + ω·a`), integrated analytically per `tick`, so
 * the simulation is stable for any frame interval and any settle time.
 */
export class ScalarSpring {
  #x0: number;
  #v0 = 0;
  #target: number;
  #omega = FALLBACK_OMEGA;
  #t0 = -1;
  #cached: number;

  constructor(initial: number) {
    this.#x0 = initial;
    this.#target = initial;
    this.#cached = initial;
  }

  get current(): number {
    return this.#cached;
  }

  get target(): number {
    return this.#target;
  }

  get animating(): boolean {
    const eps = this.#eps();

    return Math.abs(this.#cached - this.#target) > eps || Math.abs(this.#v0) > eps * this.#omega;
  }

  /**
   * Begin a fresh spring toward `value`. Carries the current velocity over so
   * mid-flight retargets stay continuous. `settleMs <= 0` is left to the
   * caller to short-circuit (snap); a bare call falls back to {@link FALLBACK_MS}.
   */
  retarget(value: number, opts: ScalarSpringRetargetOptions = {}): void {
    const now = opts.now ?? performance.now();
    const settleMs = opts.settleMs ?? FALLBACK_MS;
    const omega = settleMs > 0 ? 4.6 / (settleMs / 1000) : FALLBACK_OMEGA;

    if (this.#t0 < 0) {
      this.#target = value;
      this.#omega = omega;
      this.#t0 = now;

      return;
    }

    const { x, v } = this.#sample(now);
    this.#x0 = x;
    this.#v0 = v;
    this.#omega = omega;
    this.#target = value;
    this.#t0 = now;
    this.#cached = x;
  }

  /** Land at `value` immediately; velocity resets to zero. */
  snap(value: number, opts: { now?: number } = {}): void {
    const now = opts.now ?? performance.now();
    this.#x0 = value;
    this.#target = value;
    this.#v0 = 0;
    this.#t0 = now;
    this.#cached = value;
  }

  /** Advance the analytic solution to `now`. Returns `true` while still
   *  perceptibly moving; `false` once settled within ε of the target (where it
   *  snaps to the exact target so readers see a clean final value). */
  tick(now: number): boolean {
    if (this.#t0 < 0) {
      this.#t0 = now;

      return false;
    }

    const { x, v } = this.#sample(now);
    this.#cached = x;
    const eps = this.#eps();
    if (Math.abs(x - this.#target) < eps && Math.abs(v) < eps * this.#omega) {
      this.#cached = this.#target;
      this.#x0 = this.#target;
      this.#v0 = 0;
      this.#t0 = now;

      return false;
    }

    return true;
  }

  #sample(now: number): { x: number; v: number } {
    const t = Math.max(0, (now - this.#t0) / 1000);
    const decay = Math.exp(-this.#omega * t);
    const a = this.#x0 - this.#target;
    const b = this.#v0 + this.#omega * a;
    const x = this.#target + (a + b * t) * decay;
    const v = (b - this.#omega * (a + b * t)) * decay;

    return { x, v };
  }

  #eps(): number {
    return Math.max(Math.abs(this.#target), 1) * 1e-4;
  }
}

import { MAX_FRAME_DT_S } from './animation-constants';

export type FrameCallback = (timestamp: DOMHighResTimeStamp) => void;

export type TickListener = (info: { now: DOMHighResTimeStamp; dt: number; frameId: number }) => void;

export type Unsubscribe = () => void;

interface AnimationClockOptions {
  onMain: FrameCallback;
  onOverlay: FrameCallback;
}

/**
 * Single owner of `requestAnimationFrame` for one chart.
 *
 * Replaces the dual `RenderScheduler` setup so every animation domain (viewport
 * tween, Y-range smoothing, series live tracking, pulse, navigator) advances
 * from one shared frame clock. Inside a tick callback consumers read a single
 * `now` / `dt` / `frameId` so motions stay phase-locked.
 *
 * Mutual exclusion: `renderMain` and standalone `renderOverlay` never run in
 * the same frame. `renderMain` already triggers an overlay paint at the end
 * (chart.ts), so when both `'main'` and `'overlay'` are requested, only the
 * main path fires. A frame with only `'overlay'` set runs overlay alone.
 */
export class AnimationClock {
  readonly #onMain: FrameCallback;
  readonly #onOverlay: FrameCallback;

  #rafId: number | null = null;
  #mainDirty = false;
  #overlayDirty = false;

  /** Bumps every RAF tick. Used by domain code to guard against double-advance
   * (e.g. updateYRange called twice in one frame). */
  #frameId = 0;

  /** Wall-clock timestamp of the current frame (ms, monotonic via RAF).
   * Valid only inside a tick callback. */
  #now: DOMHighResTimeStamp = 0;

  /**
   * Time elapsed since the previous frame, **in seconds**. Used as the `dt`
   * argument to {@link smoothToward} and any other frame-rate-independent
   * exponential easing. Valid only inside a tick callback.
   *
   * Why seconds: all chase rates in this codebase are expressed in 1/second
   * (`rate = 1000 / smoothMs`), so `rate * dt` must be dimensionless. Frame
   * timestamps from `requestAnimationFrame` arrive in ms — divide by 1000.
   *
   * Concrete numbers at 60 Hz: `dt ≈ 0.01667`. At `yRangeMs = 80`
   * (`rate = 12.5/s`) one frame closes ~19 % of the remaining gap
   * (`1 - exp(-12.5 * 0.01667) ≈ 0.188`), matching the legacy
   * `min(1, 16/80) = 0.2`-per-frame closure. Halve the refresh rate and
   * each frame closes ~37 % instead — total wall-clock convergence
   * stays the same. That's the point of using `dt` rather than a fixed
   * per-frame ratio.
   *
   * Clamped to {@link MAX_FRAME_DT_S} (0.05 s): when the tab is backgrounded
   * RAF pauses, then resumes with a multi-second `timestamp` jump. Without
   * the cap, `dt ≈ 60` would push smoothing to ~100 % convergence in one
   * step — reading as a visible snap on tab refocus.
   *
   * Special value `dt === 0`: emitted on the very first frame
   * (`lastTickAt === null`) and inside {@link runSynchronous}. Domain code
   * (Y-range smoothing in particular) treats this as a snap signal —
   * exponential easing with `dt = 0` is a no-op (`exp(0) = 1`), so callers
   * branch into the seed path instead.
   */
  #dt = 0;

  #lastTickAt: DOMHighResTimeStamp | null = null;
  #insideTick = false;

  readonly #tickListeners = new Set<TickListener>();

  constructor({ onMain, onOverlay }: AnimationClockOptions) {
    this.#onMain = onMain;
    this.#onOverlay = onOverlay;
  }

  get now(): DOMHighResTimeStamp {
    return this.#now;
  }

  get dt(): number {
    return this.#dt;
  }

  get frameId(): number {
    return this.#frameId;
  }

  /** Mark a render path dirty and ensure RAF is scheduled. */
  requestFrame(scope: 'main' | 'overlay'): void {
    if (scope === 'main') {
      this.#mainDirty = true;
    } else {
      this.#overlayDirty = true;
    }
    this.#scheduleRaf();
  }

  /** Schedule a RAF without setting any dirty flag. Used by listeners (Navigator)
   * that want to ride along on the chart's frame cadence without forcing a
   * chart-side paint. */
  scheduleNextFrame(): void {
    this.#scheduleRaf();
  }

  /** Subscribe to post-render frame events. Fires after main/overlay dispatch
   * inside the same RAF, so listeners read fresh state. */
  onTick(listener: TickListener): Unsubscribe {
    this.#tickListeners.add(listener);

    return () => {
      this.#tickListeners.delete(listener);
    };
  }

  /**
   * Run a callback as if it were inside a frame, but with `dt = 0` so any
   * smoothing/chase logic snaps to the target instead of advancing. Used for
   * synchronous resize re-render (`canvas.width = ...` clears the bitmap and
   * has to be repainted in the same call). Bumps `frameId` so any frame-id
   * guards still see this as a distinct tick.
   */
  runSynchronous(fn: () => void): void {
    this.#frameId++;
    this.#now = performance.now();
    this.#dt = 0;
    this.#insideTick = true;
    try {
      fn();
    } finally {
      this.#insideTick = false;
    }
  }

  /** True while a tick callback is executing. Lets domain code differentiate
   * "called from a frame" vs "called from event handler". */
  get insideTick(): boolean {
    return this.#insideTick;
  }

  destroy(): void {
    if (this.#rafId !== null) {
      cancelAnimationFrame(this.#rafId);
      this.#rafId = null;
    }
    this.#mainDirty = false;
    this.#overlayDirty = false;
    this.#tickListeners.clear();
  }

  #scheduleRaf(): void {
    if (this.#rafId !== null) return;

    this.#rafId = requestAnimationFrame(this.#tick);
  }

  readonly #tick = (_timestamp: DOMHighResTimeStamp): void => {
    this.#rafId = null;
    this.#frameId++;
    // Read from `performance.now()` rather than the RAF timestamp argument.
    // In production both are the same monotonic clock — but test harnesses
    // that mock RAF (`installRaf`) don't always mock `performance.now()`,
    // and renderer code outside RAF (e.g. `appendPoint` recording entry
    // start time) reads `performance.now()` directly. Sourcing `now` from
    // `performance.now()` keeps every timing read on one wall clock.
    const now = performance.now();
    this.#now = now;
    this.#dt = this.#lastTickAt === null ? 0 : Math.min(MAX_FRAME_DT_S, (now - this.#lastTickAt) / 1000);
    this.#lastTickAt = now;

    const wantsMain = this.#mainDirty;
    const wantsOverlay = this.#overlayDirty;
    this.#mainDirty = false;
    this.#overlayDirty = false;

    this.#insideTick = true;
    try {
      // Main path drives its own overlay paint at the end (chart.ts); skip the
      // standalone overlay phase when main runs to avoid double-painting.
      if (wantsMain) {
        this.#onMain(now);
      } else if (wantsOverlay) {
        this.#onOverlay(now);
      }

      for (const listener of this.#tickListeners) {
        listener({ now: this.#now, dt: this.#dt, frameId: this.#frameId });
      }
    } finally {
      this.#insideTick = false;
    }
  };
}

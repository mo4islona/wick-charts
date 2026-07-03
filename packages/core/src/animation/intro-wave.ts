import { easeInOutCubic, easeOutCubic } from './easing';

/**
 * Initial-load reveal clock shared by the series renderers.
 *
 * Armed once, when a renderer's dataset transitions empty → non-empty (bulk
 * `setData` seed). Bulk *re*-seeds never re-arm — reconciler-driven data
 * swaps must not replay the intro. The clock stamps its start on the first
 * `tick` after arming, so work scheduled before the first paint (multi-layer
 * seeding, options churn) all rides the same wave.
 *
 * Two read shapes, both driven by the per-element duration passed to
 * {@link arm}:
 *
 * - {@link progressAt} — per-element wave: an element at normalized
 *   x-position `p` starts after `p × durationMs` and tweens for
 *   `durationMs`, so the full wave lasts `2 × durationMs`. Eased
 *   ease-out-cubic — same choreography as the heatmap entrance wave.
 * - {@link sweep} — continuous reveal front in `[0, 1]` over the same
 *   `2 × durationMs` window, eased ease-in-out-cubic. Line/pie use this
 *   for their clip-sweep reveals.
 *
 * Honors `prefers-reduced-motion`: arming is a no-op and every read
 * reports settled.
 */
export class IntroWave {
  #durationMs = 0;
  /** `null` = armed but awaiting the first tick to stamp the start. */
  #startTime: number | null = null;
  #done = true;
  /** Clock forwarded by the renderer's `tickAnimations` — keeps test
   *  harnesses (which stub `performance.now`) in control of progression. */
  #now = 0;

  /**
   * Arm the wave for the upcoming first paint. No-op (stays settled) when
   * the duration is zero/negative or the user prefers reduced motion.
   */
  arm(durationMs: number): void {
    if (durationMs <= 0 || prefersReducedMotion()) {
      this.#done = true;

      return;
    }

    this.#durationMs = durationMs;
    this.#startTime = null;
    this.#done = false;
  }

  /** True while the wave still has frames to produce. */
  get active(): boolean {
    return !this.#done;
  }

  /**
   * Advance the clock. Call once per render pass, before any progress
   * reads. Settles the wave once the full `2 × durationMs` window elapsed.
   */
  tick(now: number): void {
    if (this.#done) return;

    this.#now = now;
    if (this.#startTime === null) this.#startTime = now;

    if (now - this.#startTime >= this.#durationMs * 2) this.#done = true;
  }

  /**
   * Eased entrance progress in `[0, 1]` for an element at normalized
   * x-position `position` (0 = left edge of the visible window, 1 = right).
   */
  progressAt(position: number): number {
    if (this.#done) return 1;
    if (this.#startTime === null) return 0;

    const pos = clamp01(position);
    const delay = pos * this.#durationMs;
    const p = clamp01((this.#now - this.#startTime - delay) / this.#durationMs);

    return easeOutCubic(p);
  }

  /** Eased reveal-front position in `[0, 1]` across the full wave window. */
  sweep(): number {
    if (this.#done) return 1;
    if (this.#startTime === null) return 0;

    const p = clamp01((this.#now - this.#startTime) / (this.#durationMs * 2));

    return easeInOutCubic(p);
  }

  /** Raw (unclamped-by-easing) linear wave progress — drives fades that need
   *  to key off wall-clock position, e.g. the line head-glow bell curve. */
  linear(): number {
    if (this.#done) return 1;
    if (this.#startTime === null) return 0;

    return clamp01((this.#now - this.#startTime) / (this.#durationMs * 2));
  }

  /** Abort the wave — everything reads settled from the next frame. Called
   *  when the user pans/zooms mid-intro. */
  finish(): void {
    this.#done = true;
  }
}

function clamp01(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;

  return value;
}

/** Decorative intros are skipped entirely under `prefers-reduced-motion`. */
function prefersReducedMotion(): boolean {
  if (typeof matchMedia !== 'function') return false;

  return matchMedia('(prefers-reduced-motion: reduce)').matches;
}

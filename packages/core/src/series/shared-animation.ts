import { clamp, easeOutCubic } from '../utils/math';

/**
 * Resolve an `enterMs` / `smoothMs` option value to a concrete number. `false`
 * collapses to 0 (disabled); `undefined` falls back to the built-in default.
 */
export function resolveMs(value: number | false | undefined, fallback: number): number {
  if (value === false) return 0;
  if (value === undefined) return fallback;

  return value;
}

/** True if the smoothed value is still meaningfully off-target. */
export function valueDiffers(displayed: number, target: number): boolean {
  const eps = Math.max(1e-4, Math.abs(target) * 1e-5);

  return Math.abs(displayed - target) > eps;
}

/**
 * Compute per-entry entrance progress in [0, 1]. Deletes the entry from
 * `entries` when the animation completes (so callers can short-circuit on
 * empty maps). Returns 1 when there is no in-flight entry for this time.
 */
export function computeEntranceProgress<T extends { startTime: number }>(
  entries: Map<number, T> | undefined,
  time: number,
  now: number,
  durationMs: number,
): number {
  const entry = entries?.get(time);
  if (!entry) return 1;

  if (durationMs <= 0) {
    entries?.delete(time);

    return 1;
  }

  const t = clamp((now - entry.startTime) / durationMs, 0, 1);
  const progress = easeOutCubic(t);
  if (t >= 1) entries?.delete(time);

  return progress;
}

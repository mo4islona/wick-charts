export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Frame-rate independent exponential smoothing toward `target`.
 * `rate` is the exponential decay rate in 1/s (higher = converges faster).
 * Internally computes `decay = exp(-rate * dt)`, the fraction of the gap that
 * remains after `dt` seconds. Composes multiplicatively over dt, so splitting
 * a frame into sub-steps yields the same result as a single step.
 */
export function smoothToward(current: number, target: number, rate: number, dt: number): number {
  const decay = Math.exp(-rate * dt);
  return target + (current - target) * decay;
}

/** Cubic ease-out curve: starts fast, decelerates to a stop. t in [0, 1]. */
export function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

export function roundToPixel(value: number): number {
  return Math.round(value) + 0.5;
}

export function binarySearch<T>(arr: T[], target: number, getKey: (item: T) => number): number {
  let lo = 0;
  let hi = arr.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const key = getKey(arr[mid]);
    if (key < target) lo = mid + 1;
    else if (key > target) hi = mid - 1;
    else return mid;
  }
  return lo;
}

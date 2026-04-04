export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
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

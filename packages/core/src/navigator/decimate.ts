import type { NavigatorCandlePoint, NavigatorLinePoint } from './types';

/**
 * Downsample a line/bar series to roughly `buckets` representative points.
 *
 * Strategy: equal-width time buckets over the full span, emitting one point
 * per bucket. Each bucket surfaces both the min and the max value so sharp
 * spikes survive the downsample — line/area fill between adjacent outputs
 * reads the true envelope rather than an average-smoothed curve.
 *
 * Returns the input unchanged when it's already at or below the bucket count.
 */
export function decimateLinear(points: readonly NavigatorLinePoint[], buckets: number): readonly NavigatorLinePoint[] {
  if (points.length <= buckets || buckets <= 0) return points;

  const first = points[0].time;
  const last = points[points.length - 1].time;
  const span = last - first;
  if (span <= 0) return points;

  const bucketWidth = span / buckets;
  const out: NavigatorLinePoint[] = [];

  let idx = 0;
  for (let b = 0; b < buckets; b++) {
    const bucketEnd = b === buckets - 1 ? last + 1 : first + (b + 1) * bucketWidth;
    let minPoint: NavigatorLinePoint | null = null;
    let maxPoint: NavigatorLinePoint | null = null;

    while (idx < points.length && points[idx].time < bucketEnd) {
      const p = points[idx];
      if (minPoint === null || p.value < minPoint.value) minPoint = p;
      if (maxPoint === null || p.value > maxPoint.value) maxPoint = p;
      idx++;
    }

    if (minPoint === null || maxPoint === null) continue;
    if (minPoint === maxPoint) {
      out.push(minPoint);
      continue;
    }
    // Preserve chronological order so timeToX produces a monotonic x path.
    if (minPoint.time < maxPoint.time) {
      out.push(minPoint, maxPoint);
    } else {
      out.push(maxPoint, minPoint);
    }
  }

  return out;
}

/**
 * Aggregate candle points into `buckets` synthetic OHLC candles:
 *   open  = first candle's open
 *   close = last candle's close
 *   high  = max high
 *   low   = min low
 *   time  = first candle's time (anchor, drives x placement)
 *
 * When the input already fits the bucket budget it's returned unchanged.
 */
export function decimateCandles(
  points: readonly NavigatorCandlePoint[],
  buckets: number,
): readonly NavigatorCandlePoint[] {
  if (points.length <= buckets || buckets <= 0) return points;

  const first = points[0].time;
  const last = points[points.length - 1].time;
  const span = last - first;
  if (span <= 0) return points;

  const bucketWidth = span / buckets;
  const out: NavigatorCandlePoint[] = [];

  let idx = 0;
  for (let b = 0; b < buckets; b++) {
    const bucketEnd = b === buckets - 1 ? last + 1 : first + (b + 1) * bucketWidth;
    let agg: NavigatorCandlePoint | null = null;

    while (idx < points.length && points[idx].time < bucketEnd) {
      const p = points[idx];
      if (agg === null) {
        agg = { time: p.time, open: p.open, high: p.high, low: p.low, close: p.close };
      } else {
        if (p.high > agg.high) agg.high = p.high;
        if (p.low < agg.low) agg.low = p.low;
        agg.close = p.close;
      }
      idx++;
    }

    if (agg !== null) out.push(agg);
  }

  return out;
}

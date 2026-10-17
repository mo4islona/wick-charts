import type { BandPoint, OHLCData, TimePoint } from '../types';

export function decimateLineData(data: TimePoint[], targetCount: number): TimePoint[] {
  if (data.length <= targetCount) return data;
  return lttb(
    data,
    targetCount,
    (d) => d.time,
    (d) => d.value,
  );
}

export function decimateOHLCData(data: OHLCData[], targetCount: number): OHLCData[] {
  if (data.length <= targetCount) return data;
  const bucketSize = Math.ceil(data.length / targetCount);
  const result: OHLCData[] = [];
  for (let i = 0; i < data.length; i += bucketSize) {
    const end = Math.min(i + bucketSize, data.length);
    let high = -Infinity;
    let low = Infinity;
    let volume = 0;
    for (let j = i; j < end; j++) {
      if (data[j].high > high) high = data[j].high;
      if (data[j].low < low) low = data[j].low;
      volume += data[j].volume ?? 0;
    }
    result.push({
      time: data[i].time,
      open: data[i].open,
      high,
      low,
      close: data[end - 1].close,
      volume,
    });
  }
  return result;
}

/**
 * Envelope decimation for a band: each bucket keeps the lowest `low` and the
 * highest `high`, so the drawn band never narrows when zoomed out. The first
 * and last points pass through untouched — the live tail must stay addressable
 * by time. A bucket that holds a gap stays a gap.
 */
export function decimateBandData(data: BandPoint[], targetCount: number): BandPoint[] {
  if (data.length <= targetCount || targetCount < 3) return data;

  const last = data.length - 1;
  const bucketSize = Math.ceil((data.length - 2) / (targetCount - 2));
  const result: BandPoint[] = [data[0]];

  for (let i = 1; i < last; i += bucketSize) {
    const end = Math.min(i + bucketSize, last);
    let low = Infinity;
    let high = -Infinity;
    let gap = false;
    for (let j = i; j < end; j++) {
      const point = data[j];
      if (!Number.isFinite(point.low) || !Number.isFinite(point.high)) {
        gap = true;
        break;
      }

      if (point.low < low) low = point.low;
      if (point.high > high) high = point.high;
    }

    result.push(gap ? { time: data[i].time, low: Number.NaN, high: Number.NaN } : { time: data[i].time, low, high });
  }

  result.push(data[last]);

  return result;
}

function lttb<T>(data: T[], targetCount: number, getX: (d: T) => number, getY: (d: T) => number): T[] {
  if (targetCount >= data.length || targetCount < 3) return data;

  const result: T[] = [data[0]];
  const bucketSize = (data.length - 2) / (targetCount - 2);

  let prevSelected = 0;

  // A gap (null / NaN) has no Y to weigh: left in, it counts as 0 and wins its
  // bucket as an extreme, so sparse nulls would break a zoomed-out line at
  // every bucket. Only a bucket with no value at all stays a gap.
  for (let i = 0; i < targetCount - 2; i++) {
    const bucketStart = Math.floor((i + 1) * bucketSize) + 1;
    const bucketEnd = Math.min(Math.floor((i + 2) * bucketSize) + 1, data.length - 1);

    const prevX = getX(data[prevSelected]);
    const prevY = getY(data[prevSelected]);
    const prevFinite = Number.isFinite(prevY);

    let avgX = 0;
    let avgY = 0;
    let avgCount = 0;
    const nextBucketStart = bucketEnd;
    const nextBucketEnd = Math.min(Math.floor((i + 3) * bucketSize) + 1, data.length);
    for (let j = nextBucketStart; j < nextBucketEnd; j++) {
      const y = getY(data[j]);
      if (!Number.isFinite(y)) continue;

      avgX += getX(data[j]);
      avgY += y;
      avgCount++;
    }
    if (avgCount > 0) {
      avgX /= avgCount;
      avgY /= avgCount;
    } else {
      avgX = prevX;
      avgY = prevFinite ? prevY : 0;
    }

    let maxArea = -1;
    let maxIdx = bucketStart;
    for (let j = bucketStart; j < bucketEnd; j++) {
      const y = getY(data[j]);
      if (!Number.isFinite(y)) continue;

      // After a gap there is no previous vertex to form a triangle with: take the first value.
      const area = prevFinite ? Math.abs((prevX - avgX) * (y - prevY) - (prevX - getX(data[j])) * (avgY - prevY)) : 0;
      if (area > maxArea) {
        maxArea = area;
        maxIdx = j;
      }
    }

    result.push(data[maxIdx]);
    prevSelected = maxIdx;
  }

  result.push(data[data.length - 1]);
  return result;
}

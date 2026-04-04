import type { LineData, OHLCData } from '../types';

export function decimateLineData(data: LineData[], targetCount: number): LineData[] {
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
    const bucket = data.slice(i, end);

    let high = -Infinity;
    let low = Infinity;
    let volume = 0;

    for (const candle of bucket) {
      if (candle.high > high) high = candle.high;
      if (candle.low < low) low = candle.low;
      volume += candle.volume ?? 0;
    }

    result.push({
      time: bucket[0].time,
      open: bucket[0].open,
      high,
      low,
      close: bucket[bucket.length - 1].close,
      volume,
    });
  }

  return result;
}

function lttb<T>(data: T[], targetCount: number, getX: (d: T) => number, getY: (d: T) => number): T[] {
  if (targetCount >= data.length || targetCount < 3) return data;

  const result: T[] = [data[0]];
  const bucketSize = (data.length - 2) / (targetCount - 2);

  let prevSelected = 0;

  for (let i = 0; i < targetCount - 2; i++) {
    const bucketStart = Math.floor((i + 1) * bucketSize) + 1;
    const bucketEnd = Math.min(Math.floor((i + 2) * bucketSize) + 1, data.length - 1);

    let avgX = 0;
    let avgY = 0;
    const nextBucketStart = bucketEnd;
    const nextBucketEnd = Math.min(Math.floor((i + 3) * bucketSize) + 1, data.length);
    const nextBucketLen = nextBucketEnd - nextBucketStart;

    if (nextBucketLen > 0) {
      for (let j = nextBucketStart; j < nextBucketEnd; j++) {
        avgX += getX(data[j]);
        avgY += getY(data[j]);
      }
      avgX /= nextBucketLen;
      avgY /= nextBucketLen;
    }

    let maxArea = -1;
    let maxIdx = bucketStart;
    const prevX = getX(data[prevSelected]);
    const prevY = getY(data[prevSelected]);

    for (let j = bucketStart; j < bucketEnd; j++) {
      const area = Math.abs((prevX - avgX) * (getY(data[j]) - prevY) - (prevX - getX(data[j])) * (avgY - prevY));
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

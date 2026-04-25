import { describe, expect, it } from 'vitest';

import { decimateCandles, decimateLinear } from '../../navigator/decimate';
import type { NavigatorCandlePoint, NavigatorLinePoint } from '../../navigator/types';

function line(n: number, fn: (i: number) => number): NavigatorLinePoint[] {
  return Array.from({ length: n }, (_, i) => ({ time: i, value: fn(i) }));
}

function candle(n: number): NavigatorCandlePoint[] {
  return Array.from({ length: n }, (_, i) => ({
    time: i,
    open: i,
    high: i + 2,
    low: i - 1,
    close: i + 1,
  }));
}

describe('decimateLinear', () => {
  it('returns input unchanged when already at or below the bucket budget', () => {
    const input = line(10, (i) => i);
    expect(decimateLinear(input, 20)).toBe(input);
    expect(decimateLinear(input, 10)).toBe(input);
  });

  it('reduces to roughly `buckets` points when input exceeds budget', () => {
    const input = line(1000, (i) => Math.sin(i / 10));
    const out = decimateLinear(input, 50);
    // Two points per bucket max (min+max) so the upper bound is 2 * buckets.
    expect(out.length).toBeLessThanOrEqual(100);
    expect(out.length).toBeGreaterThan(10);
  });

  it('preserves spikes by surfacing both the min and the max of each bucket', () => {
    // One giant spike at index 50 sitting inside 100 low-value points.
    const input = line(100, (i) => (i === 50 ? 999 : 0));
    const out = decimateLinear(input, 10);
    const max = Math.max(...out.map((p) => p.value));
    expect(max).toBe(999);
  });

  it('emits points in chronological order so the line path stays monotonic', () => {
    const input = line(200, (i) => Math.sin(i / 5));
    const out = decimateLinear(input, 20);
    for (let i = 1; i < out.length; i++) {
      expect(out[i].time).toBeGreaterThanOrEqual(out[i - 1].time);
    }
  });

  it('returns empty array for empty input', () => {
    expect(decimateLinear([], 10)).toEqual([]);
  });
});

describe('decimateCandles', () => {
  it('returns input unchanged when already at budget', () => {
    const input = candle(5);
    expect(decimateCandles(input, 10)).toBe(input);
  });

  it('aggregates buckets into OHLC: high=max, low=min, close=last, open=first', () => {
    const input: NavigatorCandlePoint[] = [
      { time: 0, open: 10, high: 12, low: 9, close: 11 },
      { time: 1, open: 11, high: 15, low: 10, close: 14 },
      { time: 2, open: 14, high: 16, low: 8, close: 13 },
      { time: 3, open: 13, high: 14, low: 12, close: 12 },
    ];
    const out = decimateCandles(input, 2);
    expect(out.length).toBe(2);
    // Bucket 0 covers times [0, 2) → candles 0, 1.
    expect(out[0].open).toBe(10); // first open
    expect(out[0].close).toBe(14); // last close in bucket
    expect(out[0].high).toBe(15); // max of [12, 15]
    expect(out[0].low).toBe(9); // min of [9, 10]
  });
});

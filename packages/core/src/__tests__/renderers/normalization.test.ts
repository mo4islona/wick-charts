import { describe, expect, it } from 'vitest';

import type { OHLCInput, TimePointInput } from '../../types';
import { normalizeOHLCArray, normalizeTime, normalizeTimePointArray } from '../../utils/time';

/**
 * Regression #4 (commit 2dbd2f4): the old normalizer only checked `data[0]` to
 * decide whether to convert Date -> number. Any array where Date appears later
 * silently rendered at NaN positions. These tests lock in "check every item".
 */
describe('normalizeTime', () => {
  it('converts Date to a number timestamp', () => {
    const d = new Date(2024, 0, 1, 12, 0, 0);
    expect(normalizeTime(d)).toBe(d.getTime());
  });

  it('passes numbers through unchanged', () => {
    expect(normalizeTime(1_700_000_000_000)).toBe(1_700_000_000_000);
    expect(normalizeTime(0)).toBe(0);
  });
});

describe('normalizeOHLCArray (regression #4)', () => {
  const ohlc = (time: Date | number): OHLCInput => ({ time, open: 1, high: 2, low: 0.5, close: 1.5 });

  it('returns the same reference for empty arrays (no allocation)', () => {
    const empty: OHLCInput[] = [];
    expect(normalizeOHLCArray(empty)).toBe(empty);
  });

  it('passes through pure-number arrays unchanged (no allocation)', () => {
    const input: OHLCInput[] = [ohlc(1), ohlc(2), ohlc(3)];
    const out = normalizeOHLCArray(input);
    expect(out).toBe(input);
    expect(out[0].time).toBe(1);
  });

  it('normalizes when a Date appears at index 0', () => {
    const d = new Date(2024, 0, 1).getTime();
    const input: OHLCInput[] = [ohlc(new Date(2024, 0, 1)), ohlc(d + 1), ohlc(d + 2)];
    const out = normalizeOHLCArray(input);
    expect(out.map((d) => d.time)).toEqual([d, d + 1, d + 2]);
  });

  it('normalizes when a Date appears in the middle (the old bug)', () => {
    const d = new Date(2024, 0, 1).getTime();
    // Previous code looked at [0] only; Date at [1] fell through as-is and
    // rendered at NaN bitmap X.
    const input: OHLCInput[] = [ohlc(d), ohlc(new Date(d + 1)), ohlc(d + 2)];
    const out = normalizeOHLCArray(input);
    expect(out.map((d) => d.time)).toEqual([d, d + 1, d + 2]);
    expect(typeof out[1].time).toBe('number');
  });

  it('normalizes when a Date appears only at the last index', () => {
    const d = new Date(2024, 0, 1).getTime();
    const input: OHLCInput[] = [ohlc(d), ohlc(d + 1), ohlc(new Date(d + 2))];
    const out = normalizeOHLCArray(input);
    expect(out.map((d) => d.time)).toEqual([d, d + 1, d + 2]);
  });

  it('preserves all non-time fields when normalizing', () => {
    const d = new Date(2024, 0, 1).getTime();
    const input: OHLCInput[] = [{ time: new Date(d), open: 10, high: 12, low: 9, close: 11, volume: 1000 }];
    const out = normalizeOHLCArray(input);
    expect(out[0]).toEqual({ time: d, open: 10, high: 12, low: 9, close: 11, volume: 1000 });
  });
});

describe('normalizeTimePointArray (regression #4)', () => {
  const tp = (time: Date | number, value: number): TimePointInput => ({ time, value });

  it('returns the same reference for empty arrays', () => {
    const empty: TimePointInput[] = [];
    expect(normalizeTimePointArray(empty)).toBe(empty);
  });

  it('passes pure-number arrays through', () => {
    const input: TimePointInput[] = [tp(1, 10), tp(2, 20)];
    expect(normalizeTimePointArray(input)).toBe(input);
  });

  it('normalizes a Date at an interior index', () => {
    const d = 1_700_000_000_000;
    const input: TimePointInput[] = [tp(d, 1), tp(new Date(d + 1), 2), tp(d + 2, 3)];
    const out = normalizeTimePointArray(input);
    expect(out.map((p) => p.time)).toEqual([d, d + 1, d + 2]);
  });
});

import { describe, expect, it } from 'vitest';

import { detectInterval, niceTimeIntervals, normalizeOHLCArray, normalizeTime, normalizeTimePointArray } from '../utils/time';

const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

describe('detectInterval', () => {
  it('detects 60s interval', () => {
    const times = [1000_000, 1060_000, 1120_000, 1180_000, 1240_000];
    expect(detectInterval(times)).toBe(MINUTE);
  });

  it('detects 5m interval', () => {
    const times = [0, 300_000, 600_000, 900_000, 1_200_000];
    expect(detectInterval(times)).toBe(5 * MINUTE);
  });

  it('returns DAY for single point', () => {
    expect(detectInterval([1_000_000])).toBe(DAY);
  });

  it('handles irregular data (uses median)', () => {
    // Most intervals are 60s, one outlier at 120s
    const times = [0, 60_000, 120_000, 180_000, 300_000, 360_000, 420_000];
    const result = detectInterval(times);
    expect(result).toBe(MINUTE);
  });
});

describe('normalizeTime', () => {
  it('passes numbers through unchanged', () => {
    expect(normalizeTime(1_700_000_000_000)).toBe(1_700_000_000_000);
    expect(normalizeTime(0)).toBe(0);
  });

  it('converts Date to millisecond timestamp', () => {
    const ms = 1_700_000_000_000;
    expect(normalizeTime(new Date(ms))).toBe(ms);
  });
});

describe('normalizeOHLCArray', () => {
  it('normalizes mixed number/Date arrays per item', () => {
    // First item is a number (fast path), later items are Dates — must still be converted.
    const ms = 1_700_000_000_000;
    const out = normalizeOHLCArray([
      { time: ms, open: 1, high: 2, low: 0, close: 1.5 },
      { time: new Date(ms + 60_000), open: 1.5, high: 2.5, low: 1, close: 2 },
    ]);
    expect(out[0].time).toBe(ms);
    expect(out[1].time).toBe(ms + 60_000);
    expect(typeof out[1].time).toBe('number');
  });

  it('normalizes Date-first mixed arrays without throwing on later numbers', () => {
    const ms = 1_700_000_000_000;
    const out = normalizeOHLCArray([
      { time: new Date(ms), open: 1, high: 2, low: 0, close: 1.5 },
      { time: ms + 60_000, open: 1.5, high: 2.5, low: 1, close: 2 },
    ]);
    expect(out[0].time).toBe(ms);
    expect(out[1].time).toBe(ms + 60_000);
  });
});

describe('normalizeTimePointArray', () => {
  it('normalizes mixed number/Date arrays per item', () => {
    const ms = 1_700_000_000_000;
    const out = normalizeTimePointArray([
      { time: ms, value: 10 },
      { time: new Date(ms + 60_000), value: 20 },
    ]);
    expect(out[0].time).toBe(ms);
    expect(out[1].time).toBe(ms + 60_000);
    expect(typeof out[1].time).toBe('number');
  });

  it('normalizes Date-first mixed arrays without throwing on later numbers', () => {
    const ms = 1_700_000_000_000;
    const out = normalizeTimePointArray([
      { time: new Date(ms), value: 10 },
      { time: ms + 60_000, value: 20 },
    ]);
    expect(out[0].time).toBe(ms);
    expect(out[1].time).toBe(ms + 60_000);
  });
});

describe('niceTimeIntervals', () => {
  it('returns sub-minute intervals for < 60s data', () => {
    const intervals = niceTimeIntervals(10_000);
    expect(intervals[0]).toBeLessThan(MINUTE);
  });

  it('returns sub-hour intervals for minute data', () => {
    const intervals = niceTimeIntervals(MINUTE);
    expect(intervals[0]).toBe(MINUTE);
  });

  it('returns day intervals for daily data', () => {
    const intervals = niceTimeIntervals(DAY);
    expect(intervals[0]).toBe(DAY);
  });
});

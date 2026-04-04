import { describe, expect, it } from 'vitest';

import { detectInterval, niceTimeIntervals } from '../utils/time';

describe('detectInterval', () => {
  it('detects 60s interval', () => {
    const times = [1000, 1060, 1120, 1180, 1240];
    expect(detectInterval(times)).toBe(60);
  });

  it('detects 300s interval', () => {
    const times = [0, 300, 600, 900, 1200];
    expect(detectInterval(times)).toBe(300);
  });

  it('returns DAY for single point', () => {
    expect(detectInterval([1000])).toBe(86400);
  });

  it('handles irregular data (uses median)', () => {
    // Most intervals are 60, one outlier at 120
    const times = [0, 60, 120, 180, 300, 360, 420];
    const result = detectInterval(times);
    expect(result).toBe(60);
  });
});

describe('niceTimeIntervals', () => {
  it('returns sub-minute intervals for < 60s data', () => {
    const intervals = niceTimeIntervals(10);
    expect(intervals[0]).toBeLessThan(60);
  });

  it('returns sub-hour intervals for minute data', () => {
    const intervals = niceTimeIntervals(60);
    expect(intervals[0]).toBe(60);
  });

  it('returns day intervals for daily data', () => {
    const intervals = niceTimeIntervals(86400);
    expect(intervals[0]).toBe(86400);
  });
});

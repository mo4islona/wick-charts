import { describe, expect, it } from 'vitest';

import { YScale } from '../scales/y-scale';

describe('YScale', () => {
  function makeScale(min: number, max: number, height = 400) {
    const s = new YScale();
    s.update({ min, max }, height, 2);
    return s;
  }

  it('maps max value to top (y=0)', () => {
    const s = makeScale(0, 100, 400);
    expect(s.valueToY(100)).toBe(0);
  });

  it('maps min value to bottom (y=height)', () => {
    const s = makeScale(0, 100, 400);
    expect(s.valueToY(0)).toBe(400);
  });

  it('maps midpoint to middle', () => {
    const s = makeScale(0, 100, 400);
    expect(s.valueToY(50)).toBe(200);
  });

  it('valueToBitmapY accounts for pixel ratio', () => {
    const s = makeScale(0, 100, 400);
    expect(s.valueToBitmapY(50)).toBe(400); // 200 * 2
  });

  it('yToValue is inverse of valueToY', () => {
    const s = makeScale(1000, 2000, 500);
    const value = 1500;
    const y = s.valueToY(value);
    expect(s.yToValue(y)).toBeCloseTo(value);
  });

  it('generates nice tick values', () => {
    const s = makeScale(0, 100, 400);
    const ticks = s.niceTickValues();
    expect(ticks.length).toBeGreaterThan(0);
    // all ticks should be within range
    for (const t of ticks) {
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThanOrEqual(100);
    }
    // ticks should be evenly spaced
    if (ticks.length > 1) {
      const spacing = ticks[1] - ticks[0];
      for (let i = 2; i < ticks.length; i++) {
        expect(ticks[i] - ticks[i - 1]).toBeCloseTo(spacing);
      }
    }
  });

  it('formatY adapts to range', () => {
    const small = makeScale(0, 0.005, 400);
    expect(small.formatY(0.00123)).toBe('0.001230');

    const medium = makeScale(0, 100, 400);
    expect(medium.formatY(42.5)).toBe('42.5');

    const large = makeScale(0, 50000, 400);
    expect(large.formatY(42000)).toBe('42000');
  });

  it('getRange returns current range', () => {
    const s = makeScale(10, 20, 400);
    expect(s.getRange()).toEqual({ min: 10, max: 20 });
  });
});

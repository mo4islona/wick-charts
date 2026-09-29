import { describe, expect, it } from 'vitest';

import { logScale } from '../scales/log-scale';
import { YScale } from '../scales/y-scale';
import type { YScaleTransform } from '../types';

function makeScale(args: { transform: YScaleTransform; min: number; max: number; height?: number }): YScale {
  const s = new YScale();
  s.setTransform(args.transform);
  s.update({ min: args.min, max: args.max }, args.height ?? 400, 2);

  return s;
}

function makeLog(min: number, max: number, height = 400): YScale {
  return makeScale({ transform: logScale(), min, max, height });
}

const sqrtScale: YScaleTransform = {
  forward: Math.sqrt,
  inverse: (scaled) => scaled * scaled,
  isPlottable: (value) => value >= 0,
};

describe('YScale — logScale()', () => {
  describe('coordinate mapping', () => {
    it('gives every decade the same height', () => {
      const s = makeLog(1, 10_000, 400);

      expect(s.valueToY(10_000)).toBe(0);
      expect(s.valueToY(1000)).toBeCloseTo(100, 9);
      expect(s.valueToY(100)).toBeCloseTo(200, 9);
      expect(s.valueToY(10)).toBeCloseTo(300, 9);
      expect(s.valueToY(1)).toBe(400);
    });

    it('yToValue is the exact inverse of valueToY', () => {
      const s = makeLog(0.37, 52_000, 400);

      for (const value of [0.37, 1.5, 37, 999, 4321.5, 52_000]) {
        const back = s.yToValue(s.valueToY(value));
        expect(Math.abs(back - value) / value).toBeLessThan(1e-12);
      }
      for (const y of [0, 17.25, 123.4, 399, 400]) {
        expect(s.valueToY(s.yToValue(y))).toBeCloseTo(y, 9);
      }
    });

    it('lands values ≤ 0 on the plot floor instead of producing NaN', () => {
      const s = makeLog(1, 1000, 400);

      expect(s.valueToY(0)).toBe(400);
      expect(s.valueToY(-5)).toBe(400);
      expect(s.valueToY(Number.NaN)).toBe(400);
    });

    it('isPlottable rejects values ≤ 0 on log and only non-finite on linear', () => {
      const log = makeLog(1, 1000);
      expect(log.isPlottable(0.001)).toBe(true);
      expect(log.isPlottable(0)).toBe(false);
      expect(log.isPlottable(-1)).toBe(false);
      expect(log.isPlottable(Number.NaN)).toBe(false);

      const linear = new YScale();
      linear.update({ min: -10, max: 10 }, 400, 1);
      expect(linear.isPlottable(-1)).toBe(true);
      expect(linear.isPlottable(0)).toBe(true);
      expect(linear.isPlottable(Number.POSITIVE_INFINITY)).toBe(false);
    });

    it('collapses a non-positive domain to a flat one with no ticks', () => {
      const s = makeLog(-5, 100, 400);

      expect(s.valueToY(10)).toBe(200);
      expect(s.yToValue(123)).toBe(-5);
      expect(s.niceTickValues()).toEqual([]);
    });
  });

  describe('ticks', () => {
    it('sits on every power of ten when each decade clears the label spacing', () => {
      // 6 decades over 400px → 66.7px per decade: room for powers, not for 2× / 5×.
      const s = makeLog(1, 1_000_000, 400);

      expect(s.niceTickValues()).toEqual([1, 10, 100, 1000, 10_000, 100_000, 1_000_000]);
    });

    it('adds 2× and 5× steps once a decade is tall enough', () => {
      // 2 decades over 400px → 200px per decade; the tightest gap (1→2) is 60px.
      const s = makeLog(10, 1000, 400);

      expect(s.niceTickValues()).toEqual([10, 20, 50, 100, 200, 500, 1000]);
    });

    it('thins to every n-th power when decades are denser than the spacing', () => {
      // 20 decades over 400px → 20px per decade → every 5th power clears 50px.
      const s = makeLog(1, 1e20, 400);

      expect(s.niceTickValues()).toEqual([1, 1e5, 1e10, 1e15, 1e20]);
    });

    it('covers sub-unit decades with exact values', () => {
      // 4 decades over 1000px → 250px per decade, room for the 2× / 5× steps.
      const s = makeLog(0.0001, 1, 1000);

      expect(s.niceTickValues()).toEqual([
        0.0001, 0.0002, 0.0005, 0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1,
      ]);
    });

    it('switches to linear ticks on a range too narrow to catch powers of ten', () => {
      const s = makeLog(40_000, 45_000, 400);
      const ticks = s.niceTickValues();

      expect(ticks).toEqual([40_000, 41_000, 42_000, 43_000, 44_000, 45_000]);

      // Log compresses the top of the range — the tightest gap sits there and
      // must still clear the default 50px spacing.
      const topGap = s.valueToY(ticks[ticks.length - 2]) - s.valueToY(ticks[ticks.length - 1]);
      expect(topGap).toBeGreaterThanOrEqual(50);
    });

    it('prefers linear ticks when they land closer to the label target than powers do', () => {
      // {1,2,5} catches only 100 / 200 / 500; linear steps of 100 fill the axis.
      const s = makeLog(100, 500, 400);

      expect(s.niceTickValues()).toEqual([100, 200, 300, 400, 500]);
    });

    it('keeps every gap above the spacing floor', () => {
      for (const [min, max] of [
        [1, 1e6],
        [3, 7000],
        [0.02, 90],
        [100, 500],
        [40_000, 45_000],
      ]) {
        const s = makeLog(min, max, 400);
        const ys = s.niceTickValues().map((v) => s.valueToY(v));
        for (let i = 1; i < ys.length; i++) {
          expect(ys[i - 1] - ys[i]).toBeGreaterThanOrEqual(50 - 1e-9);
        }
      }
    });

    it('honors a labelCount hint by stepping over decades', () => {
      const s = makeLog(1, 1_000_000, 400);
      s.setLabelCount(4);

      expect(s.niceTickValues()).toEqual([1, 100, 10_000, 1_000_000]);
    });

    it('a custom tick generator still wins', () => {
      const s = makeLog(1, 1000, 400);
      s.setTickGenerator(() => [3, 30, 300]);

      expect(s.niceTickValues()).toEqual([3, 30, 300]);
    });
  });

  describe('labels', () => {
    it('formats power-of-ten ticks compactly', () => {
      const s = makeLog(1, 1_000_000, 400);
      const labels = s.niceTickValues().map((v) => s.formatY(v));

      expect(labels).toEqual(['1', '10', '100', '1K', '10K', '100K', '1M']);
    });

    it('keeps subdivision and sub-unit labels short', () => {
      const s = makeLog(0.001, 5000, 800);

      expect(s.formatY(0.001)).toBe('0.001');
      expect(s.formatY(0.02)).toBe('0.02');
      expect(s.formatY(20)).toBe('20');
      expect(s.formatY(2000)).toBe('2K');
      expect(s.formatY(2500)).toBe('2.5K');
    });

    it('formats linear-fallback ticks like a linear axis', () => {
      const s = makeLog(40_000, 45_000, 400);

      expect(s.formatY(41_000)).toBe('41000');
    });
  });

  describe('base', () => {
    it('maps the same for every base — only ticks move', () => {
      const base10 = makeLog(1, 4096, 400);
      const base2 = makeScale({ transform: logScale({ base: 2 }), min: 1, max: 4096 });

      for (const value of [1, 3, 64, 1000, 4096]) {
        expect(base2.valueToY(value)).toBeCloseTo(base10.valueToY(value), 9);
      }
    });

    it('puts base-2 ticks on powers of two, thinned to clear the spacing', () => {
      // 12 doublings over 400px → 33px each: every 2nd power clears 50px.
      const s = makeScale({ transform: logScale({ base: 2 }), min: 1, max: 4096 });

      expect(s.niceTickValues()).toEqual([1, 4, 16, 64, 256, 1024, 4096]);
    });

    it('returns one shared scale per base, so an inline call stays the same scale', () => {
      expect(logScale()).toBe(logScale({ base: 10 }));
      expect(logScale({ base: 2 })).toBe(logScale({ base: 2 }));
      expect(logScale({ base: 2 })).not.toBe(logScale());
    });

    it('rejects a base that has no logarithm', () => {
      for (const base of [1, 0, -2, Number.NaN]) {
        expect(() => logScale({ base })).toThrow(/base must be/);
      }
    });
  });

  describe('switching scales', () => {
    it('re-resolves ticks for the new mapping', () => {
      const s = new YScale();
      s.update({ min: 1, max: 1_000_000 }, 400, 1);
      const linearTicks = s.niceTickValues();
      expect(linearTicks).not.toContain(10);

      s.setTransform(logScale());
      expect(s.getTransform()).toBe(logScale());
      expect(s.niceTickValues()).toEqual([1, 10, 100, 1000, 10_000, 100_000, 1_000_000]);

      s.setTransform(null);
      expect(s.niceTickValues()).toEqual(linearTicks);
      expect(s.valueToY(500_000.5)).toBeCloseTo(200, 6);
    });
  });
});

describe('YScale — custom transform', () => {
  it('maps through forward and inverts through inverse', () => {
    const s = makeScale({ transform: sqrtScale, min: 0, max: 100 });

    expect(s.valueToY(0)).toBe(400);
    expect(s.valueToY(25)).toBeCloseTo(200, 9);
    expect(s.valueToY(100)).toBe(0);
    expect(s.yToValue(s.valueToY(42))).toBeCloseTo(42, 9);
  });

  it('skips values outside isPlottable and lands them on the floor', () => {
    const s = makeScale({ transform: sqrtScale, min: 0, max: 100 });

    expect(s.isPlottable(-1)).toBe(false);
    expect(s.isPlottable(0)).toBe(true);
    expect(s.valueToY(-1)).toBe(400);
  });

  it('spaces linear ticks for the mapping when it has no ticks of its own', () => {
    // sqrt compresses the top, so the tightest gap is there and must clear 50px.
    const s = makeScale({ transform: sqrtScale, min: 0, max: 10_000 });
    const ys = s.niceTickValues().map((v) => s.valueToY(v));

    expect(ys.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < ys.length; i++) {
      expect(ys[i - 1] - ys[i]).toBeGreaterThanOrEqual(50 - 1e-9);
    }
  });

  it('keeps gaps clear at the bottom of a convex mapping', () => {
    const square: YScaleTransform = {
      forward: (value) => value * value,
      inverse: Math.sqrt,
      isPlottable: (value) => value >= 0,
    };
    const s = makeScale({ transform: square, min: 0, max: 100 });
    const ys = s.niceTickValues().map((v) => s.valueToY(v));

    expect(ys.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < ys.length; i++) {
      expect(ys[i - 1] - ys[i]).toBeGreaterThanOrEqual(50 - 1e-9);
    }
  });

  it('formats with its own formatter only while its own ticks are shown', () => {
    const labelled: YScaleTransform = {
      ...sqrtScale,
      ticks: ({ min, max }) => [min, max],
      format: (value) => `~${value}`,
    };
    const s = makeScale({ transform: labelled, min: 0, max: 100, height: 100 });

    expect(s.niceTickValues()).toEqual([0, 100]);
    expect(s.formatY(100)).toBe('~100');
  });
});

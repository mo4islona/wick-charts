import { describe, expect, it } from 'vitest';

import { TimeScale } from '../scales/time-scale';

const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

describe('TimeScale', () => {
  function makeScale(from: number, to: number, width = 800, pixelRatio = 1) {
    const s = new TimeScale();
    s.update({ from, to }, width, pixelRatio);
    return s;
  }

  describe('timeToX', () => {
    it('maps from to x=0', () => {
      const s = makeScale(1000, 2000, 800);
      expect(s.timeToX(1000)).toBe(0);
    });

    it('maps to to x=width', () => {
      const s = makeScale(1000, 2000, 800);
      expect(s.timeToX(2000)).toBe(800);
    });

    it('maps midpoint to half width', () => {
      const s = makeScale(1000, 2000, 800);
      expect(s.timeToX(1500)).toBe(400);
    });
  });

  describe('timeToBitmapX', () => {
    it('scales by pixel ratio', () => {
      const s = makeScale(0, 1000, 500, 2);
      // timeToX(500) = 250, bitmap = round(250 * 2) = 500
      expect(s.timeToBitmapX(500)).toBe(500);
    });

    it('rounds to nearest integer', () => {
      const s = makeScale(0, 3, 10, 1);
      // timeToX(1) = 10/3 ≈ 3.333, round => 3
      expect(s.timeToBitmapX(1)).toBe(3);
    });
  });

  describe('xToTime', () => {
    it('is the inverse of timeToX', () => {
      const s = makeScale(1000, 2000, 800);
      const time = 1337;
      const x = s.timeToX(time);
      expect(s.xToTime(x)).toBeCloseTo(time);
    });

    it('maps x=0 to from', () => {
      const s = makeScale(500, 1500, 400);
      expect(s.xToTime(0)).toBe(500);
    });

    it('maps x=width to to', () => {
      const s = makeScale(500, 1500, 400);
      expect(s.xToTime(400)).toBe(1500);
    });
  });

  describe('pixelDeltaToTimeDelta', () => {
    it('converts pixel distance to time distance', () => {
      const s = makeScale(0, 1000, 500);
      // 1 pixel = 1000/500 = 2 time units
      expect(s.pixelDeltaToTimeDelta(100)).toBe(200);
    });

    it('returns 0 for zero pixel delta', () => {
      const s = makeScale(0, 1000, 500);
      expect(s.pixelDeltaToTimeDelta(0)).toBe(0);
    });
  });

  describe('barWidthMedia', () => {
    it('returns correct fraction of width', () => {
      const s = makeScale(0, 1000, 500);
      // interval 100 => (100/1000)*500 = 50
      expect(s.barWidthMedia(100)).toBe(50);
    });
  });

  describe('barWidthBitmap', () => {
    it('scales by pixel ratio and rounds', () => {
      const s = makeScale(0, 1000, 500, 2);
      // barWidthMedia(100) = 50, bitmap = round(50*2) = 100
      expect(s.barWidthBitmap(100)).toBe(100);
    });

    it('clamps to minimum of 1', () => {
      const s = makeScale(0, 1_000_000, 100, 1);
      // barWidthMedia(1) = (1/1000000)*100 = 0.0001, round => 0, clamped to 1
      expect(s.barWidthBitmap(1)).toBe(1);
    });
  });

  describe('niceTickValues', () => {
    it('generates ticks within the visible range', () => {
      const s = makeScale(0, DAY, 800);
      const { ticks } = s.niceTickValues(HOUR);
      expect(ticks.length).toBeGreaterThan(0);
      for (const t of ticks) {
        expect(t).toBeGreaterThanOrEqual(0);
        expect(t).toBeLessThanOrEqual(DAY);
      }
    });

    it('produces evenly spaced ticks', () => {
      const s = makeScale(0, DAY * 7, 800);
      const { ticks, tickInterval } = s.niceTickValues(DAY);
      expect(tickInterval).toBeGreaterThan(0);
      if (ticks.length > 1) {
        for (let i = 1; i < ticks.length; i++) {
          expect(ticks[i] - ticks[i - 1]).toBeCloseTo(tickInterval);
        }
      }
    });

    it('returns empty ticks when from >= to', () => {
      const s = makeScale(1000, 1000, 800);
      const { ticks, tickInterval } = s.niceTickValues(MINUTE);
      expect(ticks).toEqual([]);
      expect(tickInterval).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('handles zero width without throwing', () => {
      const s = makeScale(0, 1000, 0);
      // timeToX divides by (to-from) which is fine, but width=0 => always 0
      expect(s.timeToX(500)).toBe(0);
      expect(s.timeToBitmapX(500)).toBe(0);
    });
  });

  describe('niceTickValues — spacing floor & config', () => {
    it('default 80px floor is respected', () => {
      const width = 800;
      const s = makeScale(0, DAY * 7, width);
      const { ticks, tickInterval } = s.niceTickValues(HOUR);
      if (ticks.length >= 2) {
        const timePerPixel = (DAY * 7) / width;
        const pixelGap = tickInterval / timePerPixel;
        expect(pixelGap).toBeGreaterThanOrEqual(80 - 1e-9);
      }
    });

    it('custom minLabelSpacing is respected', () => {
      const width = 800;
      const s = new TimeScale();
      s.setMinSpacing(160);
      s.update({ from: 0, to: DAY * 7 }, width, 1, HOUR);
      const { ticks, tickInterval } = s.niceTickValues(HOUR);
      if (ticks.length >= 2) {
        const timePerPixel = (DAY * 7) / width;
        const pixelGap = tickInterval / timePerPixel;
        expect(pixelGap).toBeGreaterThanOrEqual(160 - 1e-9);
      }
    });

    it('dataInterval bucket change resets hysteresis', () => {
      // First prime with HOUR → resolvedInterval from sub_day tier.
      const s = new TimeScale();
      s.update({ from: 0, to: DAY * 7 }, 800, 1, HOUR);
      s.niceTickValues(HOUR);

      // Switch to DAY-scale data; the niceTimeIntervals list starts from a
      // different tier, so lastInterval should be discarded.
      s.update({ from: 0, to: DAY * 365 }, 800, 1, DAY);
      const { tickInterval } = s.niceTickValues(DAY);
      expect(tickInterval).toBeGreaterThan(HOUR);
    });

    it('returned tickInterval equals resolvedInterval, not the dataInterval argument', () => {
      // Passing HOUR as dataInterval but viewing 7 days at 800px should
      // escalate to DAY-scale tickInterval.
      const s = new TimeScale();
      s.update({ from: 0, to: DAY * 7 }, 800, 1, HOUR);
      const { tickInterval } = s.niceTickValues(HOUR);
      expect(tickInterval).not.toBe(HOUR);
      expect(tickInterval).toBeGreaterThan(HOUR);
    });

    it('rejects invalid setter inputs', () => {
      const s = new TimeScale();
      s.setLabelCount(Number.NaN);
      s.setMinSpacing(-1);
      s.update({ from: 0, to: DAY * 7 }, 800, 1, HOUR);
      const { ticks, tickInterval } = s.niceTickValues(HOUR);
      expect(ticks.length).toBeGreaterThan(0);
      expect(tickInterval).toBeGreaterThan(0);
    });

    it('multi-year range returns finite array without crashing', () => {
      const s = makeScale(0, DAY * 365 * 5, 800);
      const { ticks, tickInterval } = s.niceTickValues(DAY);
      expect(Array.isArray(ticks)).toBe(true);
      expect(ticks.length).toBeLessThanOrEqual(50);
      expect(Number.isFinite(tickInterval)).toBe(true);
    });
  });
});

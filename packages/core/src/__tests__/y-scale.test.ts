import { describe, expect, it } from 'vitest';

import { YScale } from '../scales/y-scale';

describe('YScale', () => {
  function makeScale(min: number, max: number, height = 400) {
    const s = new YScale();
    s.update({ min, max }, height, 2);

    return s;
  }

  describe('coordinate mapping', () => {
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
  });

  describe('niceTickValues', () => {
    it('generates ticks within the visible range', () => {
      const s = makeScale(0, 100, 400);
      const ticks = s.niceTickValues();
      expect(ticks.length).toBeGreaterThan(0);
      for (const t of ticks) {
        expect(t).toBeGreaterThanOrEqual(0);
        expect(t).toBeLessThanOrEqual(100);
      }
    });

    it('hysteresis band prevents tier flip across smooth sweep', () => {
      // Sweep a narrow range window across one 1-2-5 boundary so the
      // resolved interval must transition at most once and never oscillate.
      // Height=400, default floor=50px → targetGaps=8.
      // Raw = range/8 crosses 200 at range=1600.
      const s = new YScale();
      const height = 400;
      const results: number[] = [];
      for (let i = 0; i < 40; i++) {
        const max = 1400 + i * 10; // 1400 → 1790, raw 175 → 223.75
        s.update({ min: 0, max }, height, 1);
        const ticks = s.niceTickValues();
        if (ticks.length >= 2) results.push(ticks[1] - ticks[0]);
      }

      const transitions = results.reduce((n, v, i) => (i > 0 && v !== results[i - 1] ? n + 1 : n), 0);
      expect(transitions).toBeLessThanOrEqual(1);

      // No A → B → A sequence.
      for (let i = 2; i < results.length; i++) {
        if (results[i] !== results[i - 1] && results[i - 1] !== results[i - 2]) {
          expect(results[i]).not.toBe(results[i - 2]);
        }
      }
    });

    it('pixel spacing floor is strict at default spacing', () => {
      // Range sweep: every result must satisfy interval*height/range >= 50px.
      const height = 400;
      for (let range = 1000; range <= 100_000; range += 1234) {
        const s = makeScale(0, range, height);
        const ticks = s.niceTickValues();
        if (ticks.length >= 2) {
          const interval = ticks[1] - ticks[0];
          const pixelGap = (interval * height) / range;
          expect(pixelGap).toBeGreaterThanOrEqual(50 - 1e-9);
        }
      }
    });

    it('labelCount=2 on a narrow range produces at least 2 labels', () => {
      // Regression: ceiling-snap on raw=range/hint combined with
      // `ceil(min/interval)*interval` alignment used to collapse the axis to
      // a single label for these three ranges (user-reported).
      const cases: Array<[number, number, number]> = [
        [95, 104, 340], // min, max, height — 10-wide axis
        [44_500, 45_200, 340], // 700-wide axis, 45000 only under ceiling snap
        [1595, 1610, 340], // 15-wide axis, 1600 only under ceiling snap
      ];
      for (const [min, max, height] of cases) {
        const s = new YScale();
        s.setLabelCount(2);
        s.update({ min, max }, height, 1);
        expect(s.niceTickValues().length).toBeGreaterThanOrEqual(2);
      }
    });

    it('labelCount honored but capped by floor', () => {
      // Ask for 20 labels in 400px with 50px floor → floor caps gaps at 8.
      const s = new YScale();
      s.setLabelCount(20);
      s.update({ min: 0, max: 1000 }, 400, 1);
      const ticks = s.niceTickValues();
      expect(ticks.length).toBeGreaterThan(0);

      const interval = ticks[1] - ticks[0];
      // Floor guarantees: interval * maxGaps >= range, where maxGaps = 400/50 = 8.
      expect(interval * 8).toBeGreaterThanOrEqual(1000 - 1e-9);
    });

    it('narrow unaligned range produces aligned ticks', () => {
      const s = makeScale(48017, 50023, 400);
      const ticks = s.niceTickValues();
      expect(ticks.length).toBeGreaterThanOrEqual(3);

      const interval = ticks[1] - ticks[0];
      for (const t of ticks) {
        expect(Math.abs(t / interval - Math.round(t / interval))).toBeLessThan(1e-6);
      }
    });

    it('1-2-5 invariant across targetCount 2..20', () => {
      for (let count = 2; count <= 20; count++) {
        const s = new YScale();
        s.setLabelCount(count);
        s.update({ min: 0, max: 1000 }, 400, 1);
        const ticks = s.niceTickValues();
        if (ticks.length < 2) continue;

        const interval = ticks[1] - ticks[0];
        const mag = 10 ** Math.floor(Math.log10(interval));
        const normalized = interval / mag;
        expect([1, 2, 5, 10]).toContain(Math.round(normalized));
      }
    });

    it('handles negative and zero-crossing ranges', () => {
      const cases: Array<[number, number]> = [
        [-500, 500],
        [-1000, 0],
        [-1, 1],
      ];
      for (const [min, max] of cases) {
        const s = makeScale(min, max, 400);
        const ticks = s.niceTickValues();
        expect(ticks.length).toBeGreaterThan(0);

        const interval = ticks[1] - ticks[0];
        const mag = 10 ** Math.floor(Math.log10(interval));
        const normalized = interval / mag;
        expect([1, 2, 5, 10]).toContain(Math.round(normalized));
      }
    });
  });

  describe('setters', () => {
    it('reject invalid inputs for labelCount', () => {
      const s = new YScale();
      s.update({ min: 0, max: 100 }, 400, 1);
      const autoInterval = s.niceTickValues()[1] - s.niceTickValues()[0];

      for (const bad of [0, -3, Number.NaN, Number.POSITIVE_INFINITY, 1]) {
        s.setLabelCount(bad as number);
        s.update({ min: 0, max: 100 }, 400, 1);
        const ticks = s.niceTickValues();
        const interval = ticks[1] - ticks[0];
        expect(interval).toBe(autoInterval);
      }
    });

    it('reject invalid inputs for spacing', () => {
      const s = new YScale();
      s.update({ min: 0, max: 100 }, 400, 1);
      const autoInterval = s.niceTickValues()[1] - s.niceTickValues()[0];

      for (const bad of [0, -10, Number.NaN, Number.POSITIVE_INFINITY]) {
        s.setMinSpacing(bad as number);
        s.update({ min: 0, max: 100 }, 400, 1);
        const ticks = s.niceTickValues();
        const interval = ticks[1] - ticks[0];
        expect(interval).toBe(autoInterval);
      }
    });

    it('setter resets hysteresis', () => {
      const s = new YScale();
      s.update({ min: 0, max: 1000 }, 400, 1);
      const before = s.niceTickValues();

      // labelCount=3 → targetGaps=2 → raw=500 → cand=500. Ticks: [0, 500, 1000].
      s.setLabelCount(3);
      s.update({ min: 0, max: 1000 }, 400, 1);
      const after = s.niceTickValues();

      expect(after.length).not.toBe(before.length);
    });
  });

  describe('purity & float safety', () => {
    it('niceTickValues does not mutate between calls', () => {
      const s = makeScale(0, 1000, 400);
      const a = s.niceTickValues();
      const b = s.niceTickValues();
      expect(a).toEqual(b);
    });

    it('tick loop is float-safe', () => {
      const s = new YScale();
      s.setLabelCount(11); // 10 gaps
      s.update({ min: 0, max: 1 }, 400, 1);
      const ticks = s.niceTickValues();
      // Interval resolves to 0.1 exactly; index 10 must equal 1.0, not 0.999…
      expect(ticks[ticks.length - 1]).toBe(1);
    });
  });

  describe('degenerate inputs', () => {
    it('small axis with gap floor returns 1-2 ticks without crashing', () => {
      const s = new YScale();
      s.update({ min: 0, max: 100 }, 30, 1);
      const ticks = s.niceTickValues();
      expect(ticks.length).toBeGreaterThanOrEqual(1);
      expect(ticks.length).toBeLessThanOrEqual(2);
    });

    it('flat range returns empty ticks', () => {
      const s = makeScale(42, 42, 400);
      expect(s.niceTickValues()).toEqual([]);
    });
  });

  describe('format', () => {
    it('formatY uses decimals derived from the resolved tick interval', () => {
      // Sub-unit range → interval=0.001 → 3 decimals.
      const small = makeScale(0, 0.005, 400);
      expect(small.formatY(0.00123)).toBe('0.001');

      // Range 0..100 → interval=20 → 0 decimals.
      const medium = makeScale(0, 100, 400);
      expect(medium.formatY(42.5)).toBe('43');

      const large = makeScale(0, 50000, 400);
      expect(large.formatY(42000)).toBe('42000');
    });

    it('does not append ".0" to integer ticks when range < 1000 (BTC-style axis)', () => {
      // Regression: visible range ≈ 900 used to force toFixed(1), yielding
      // "42000.0". Interval-driven formatting picks 0 decimals for step=100.
      const s = makeScale(42_300, 43_200, 500);
      for (const tick of s.niceTickValues()) {
        expect(s.formatY(tick)).not.toMatch(/\.0$/);
      }
      expect(s.formatY(42_500)).toBe('42500');
    });

    it('uses 1 decimal when tick interval is 0.5', () => {
      // Range 0..2.5 @ 400px → interval=0.5 → ticks 0, 0.5, 1.0, ... → 1 decimal.
      const s = makeScale(0, 2.5, 400);
      const ticks = s.niceTickValues();
      expect(ticks[1] - ticks[0]).toBe(0.5);
      expect(s.formatY(1.5)).toBe('1.5');
    });
  });

  it('getRange returns current range', () => {
    const s = makeScale(10, 20, 400);
    expect(s.getRange()).toEqual({ min: 10, max: 20 });
  });
});

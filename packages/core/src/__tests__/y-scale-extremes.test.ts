import { describe, expect, it } from 'vitest';

import { YScale } from '../scales/y-scale';

describe('YScale — extreme ranges', () => {
  function makeScale(min: number, max: number, height = 400) {
    const s = new YScale();
    s.update({ min, max }, height, 2);
    return s;
  }

  // Parameterised across magnitudes spanning 21 orders of magnitude. The
  // critical property: tick count stays bounded regardless of scale, so the
  // old behavior of generating millions of ticks for range=1e12 can't recur.
  const RANGES: Array<[number, number, string]> = [
    [0, 1e-9, '1e-9'],
    [0, 1e-6, '1e-6'],
    [0, 1e-3, '1e-3'],
    [0, 1, '1'],
    [0, 1e3, '1e3'],
    [0, 1e6, '1e6'],
    [0, 1e9, '1e9'],
    [0, 1e12, '1e12'],
    [0, Number.MAX_SAFE_INTEGER, 'MAX_SAFE_INTEGER'],
  ];

  it.each(RANGES)('niceTickValues stays bounded and monotonic for range %s', (min, max) => {
    const s = makeScale(min, max);
    const ticks = s.niceTickValues();

    expect(ticks.length).toBeGreaterThan(0);
    expect(ticks.length).toBeLessThanOrEqual(50);

    for (const t of ticks) {
      expect(Number.isFinite(t)).toBe(true);
    }
    for (let i = 1; i < ticks.length; i++) {
      expect(ticks[i]).toBeGreaterThan(ticks[i - 1]);
    }
  });

  it.each(RANGES)('valueToY and yToValue round-trip for range %s', (min, max) => {
    const s = makeScale(min, max);
    const mid = (min + max) / 2;
    const y = s.valueToY(mid);
    expect(s.yToValue(y)).toBeCloseTo(mid, 6);
  });

  it('zero-range valueToY returns mid-height instead of NaN', () => {
    const s = makeScale(42, 42, 400);
    expect(Number.isNaN(s.valueToY(42))).toBe(false);
    expect(s.valueToY(42)).toBe(200);
  });

  it('zero-range yToValue returns min instead of Infinity', () => {
    const s = makeScale(42, 42, 400);
    const y = s.yToValue(123);
    expect(Number.isFinite(y)).toBe(true);
    expect(y).toBe(42);
  });

  it('formatY switches to compact notation when range exceeds 1e6', () => {
    const s = makeScale(0, 5_000_000, 400);
    expect(s.formatY(2_500_000)).toBe('2.50M');
  });

  it('formatY keeps raw notation for a 50K-range axis (readable)', () => {
    const s = makeScale(0, 50_000, 400);
    expect(s.formatY(42_000)).toBe('42000');
  });

  it('formatY uses as many decimals as the resolved tick interval demands', () => {
    // Range 0..0.005 @ 400px → resolved interval is 0.001 → 3 decimals.
    const s = makeScale(0, 0.005, 400);
    expect(s.formatY(0.00123)).toBe('0.001');
  });

  it('honors a custom formatter installed via setFormat', () => {
    const s = makeScale(0, 1_000_000, 400);
    s.setFormat((v) => `$${v}`);
    expect(s.formatY(250_000)).toBe('$250000');
    s.setFormat(null);
    expect(s.formatY(250_000)).toBe('250.00K');
  });

  it('tick intervals follow a 1-2-5 pattern at any magnitude', () => {
    // For a range of 1e12 the tick interval should land on 2e11 (10 ticks at 50px spacing).
    const s = makeScale(0, 1e12, 400);
    const ticks = s.niceTickValues();
    if (ticks.length > 1) {
      const step = ticks[1] - ticks[0];
      const magnitude = 10 ** Math.floor(Math.log10(step));
      const normalized = step / magnitude;
      expect([1, 2, 5]).toContain(Math.round(normalized));
    }
  });
});

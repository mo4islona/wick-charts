import { describe, expect, it } from 'vitest';

import { binarySearch, clamp, easeOutCubic, lerp, smoothToward } from '../utils/math';

describe('clamp', () => {
  it('clamps below min', () => expect(clamp(-5, 0, 10)).toBe(0));
  it('clamps above max', () => expect(clamp(15, 0, 10)).toBe(10));
  it('passes through in range', () => expect(clamp(5, 0, 10)).toBe(5));
});

describe('lerp', () => {
  it('returns a at t=0', () => expect(lerp(10, 20, 0)).toBe(10));
  it('returns b at t=1', () => expect(lerp(10, 20, 1)).toBe(20));
  it('returns midpoint at t=0.5', () => expect(lerp(10, 20, 0.5)).toBe(15));
});

describe('binarySearch', () => {
  const arr = [10, 20, 30, 40, 50];
  const getKey = (n: number) => n;

  it('finds exact match', () => {
    expect(binarySearch(arr, 30, getKey)).toBe(2);
  });

  it('returns insertion point for missing value', () => {
    expect(binarySearch(arr, 25, getKey)).toBe(2); // between 20 and 30
  });

  it('returns 0 for value below all', () => {
    expect(binarySearch(arr, 5, getKey)).toBe(0);
  });

  it('returns length for value above all', () => {
    expect(binarySearch(arr, 100, getKey)).toBe(5);
  });

  it('works with empty array', () => {
    expect(binarySearch([], 10, getKey)).toBe(0);
  });
});

describe('easeOutCubic', () => {
  it('returns 0 at t=0', () => expect(easeOutCubic(0)).toBe(0));
  it('returns 1 at t=1', () => expect(easeOutCubic(1)).toBe(1));

  it('is strictly monotonic over [0, 1]', () => {
    let prev = easeOutCubic(0);
    for (let i = 1; i <= 20; i++) {
      const cur = easeOutCubic(i / 20);
      expect(cur).toBeGreaterThan(prev);
      prev = cur;
    }
  });

  it('has ease-out shape (above linear for t in (0, 1))', () => {
    // Cubic ease-out decelerates — mid-curve it's ahead of linear.
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5);
    expect(easeOutCubic(0.25)).toBeGreaterThan(0.25);
  });
});

describe('smoothToward', () => {
  it('returns current when dt is 0 (no time passed, no movement)', () => {
    expect(smoothToward(10, 20, 5, 0)).toBe(10);
  });

  it('returns current when rate is 0 (no decay)', () => {
    expect(smoothToward(10, 20, 0, 1)).toBe(10);
  });

  it('moves strictly toward target, never past it', () => {
    const r = smoothToward(0, 100, 5, 0.1);
    expect(r).toBeGreaterThan(0);
    expect(r).toBeLessThan(100);
  });

  it('converges to target as dt grows large', () => {
    // After many seconds at rate=5, we should be within a tiny epsilon of target.
    const r = smoothToward(0, 100, 5, 10);
    expect(Math.abs(r - 100)).toBeLessThan(1e-6);
  });

  it('is frame-rate independent: two half-dt steps equal one full-dt step', () => {
    // decay = exp(-rate*dt) composes multiplicatively, so splitting dt preserves the result.
    const current = 10;
    const target = 50;
    const rate = 3;
    const dt = 0.25;

    const oneStep = smoothToward(current, target, rate, dt);
    const halfStep = smoothToward(current, target, rate, dt / 2);
    const twoHalves = smoothToward(halfStep, target, rate, dt / 2);

    expect(Math.abs(oneStep - twoHalves)).toBeLessThan(1e-9);
  });

  it('stays at target when already at target', () => {
    expect(smoothToward(42, 42, 10, 0.016)).toBe(42);
  });

  it('approaches target monotonically over repeated frames', () => {
    let v = 0;
    let prev = -Infinity;
    for (let i = 0; i < 30; i++) {
      v = smoothToward(v, 1, 8, 1 / 60);
      expect(v).toBeGreaterThan(prev);
      expect(v).toBeLessThanOrEqual(1);
      prev = v;
    }
    expect(v).toBeGreaterThan(0.9);
  });
});

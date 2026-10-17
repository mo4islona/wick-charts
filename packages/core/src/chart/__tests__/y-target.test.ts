/**
 * resolveBound — interprets an AxisBound (number / 'auto' / function /
 * percentage string) against the auto-resolved range. The companion
 * `computeTargetYRange` sweep is already exercised through the chart Y-range
 * suites; these cases close the bound-interpretation branches.
 */
import { describe, expect, it } from 'vitest';

import { resolveBound, widenFlatRange } from '../y-target';

describe('resolveBound', () => {
  it('returns the auto value for undefined or "auto"', () => {
    expect(resolveBound(undefined, 42, 0, [], 'max')).toBe(42);
    expect(resolveBound('auto', 42, 0, [], 'max')).toBe(42);
  });

  it('passes a numeric bound straight through', () => {
    expect(resolveBound(7, 42, 0, [], 'min')).toBe(7);
  });

  it('invokes a function bound with the sampled values', () => {
    const values = [1, 5, 3];
    expect(resolveBound((v) => Math.max(...v), 0, 0, values, 'max')).toBe(5);
  });

  it('offsets the max bound outward by a +N% string', () => {
    // dataRange = |0 − 100| = 100 → 100 + 0.10 × 100 = 110.
    expect(resolveBound('+10%', 100, 0, [], 'max')).toBe(110);
  });

  it('flips the offset direction for the min side', () => {
    // side 'min' negates the multiplier: 0 + 0.10 × 100 × −1 = −10.
    expect(resolveBound('+10%', 0, 100, [], 'min')).toBe(-10);
  });

  it('honours an explicit minus sign in the percentage', () => {
    // sign −1, side 'max': 100 + (−1) × 0.05 × 100 × 1 = 95.
    expect(resolveBound('-5%', 100, 0, [], 'max')).toBe(95);
  });

  it('falls back to a unit range when the auto bounds coincide', () => {
    // dataRange = |0 − 0| || |0| || 1 = 1 → 0 + 0.10 × 1 = 0.1.
    expect(resolveBound('+10%', 0, 0, [], 'max')).toBeCloseTo(0.1, 10);
  });

  it('returns the auto value for an unparseable bound string', () => {
    expect(resolveBound('nonsense', 42, 0, [], 'max')).toBe(42);
  });
});

describe('widenFlatRange', () => {
  it('leaves a range with a span alone', () => {
    expect(widenFlatRange({ min: 1, max: 2 })).toEqual({ min: 1, max: 2 });
  });

  it('widens one value by 5% each way, keeping it mid-range', () => {
    expect(widenFlatRange({ min: 7, max: 7 })).toEqual({ min: 6.65, max: 7.35 });
    expect(widenFlatRange({ min: -40, max: -40 })).toEqual({ min: -42, max: -38 });
  });

  it('widens zero by one each way', () => {
    expect(widenFlatRange({ min: 0, max: 0 })).toEqual({ min: -1, max: 1 });
  });
});

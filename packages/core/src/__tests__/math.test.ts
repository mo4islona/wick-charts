import { describe, expect, it } from 'vitest';

import { binarySearch, clamp, lerp } from '../utils/math';

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

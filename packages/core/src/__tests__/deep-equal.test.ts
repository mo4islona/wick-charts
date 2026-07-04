import { describe, expect, it } from 'vitest';

import { deepEqual } from '../utils/deep-equal';

describe('deepEqual', () => {
  it('treats two structurally identical plain objects as equal', () => {
    expect(deepEqual({ a: 1, b: { c: 2 } }, { a: 1, b: { c: 2 } })).toBe(true);
  });

  it('detects a changed primitive nested deeply', () => {
    expect(deepEqual({ a: { b: { c: 1 } } }, { a: { b: { c: 2 } } })).toBe(false);
  });

  it('detects a missing/extra key', () => {
    expect(deepEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
  });

  it('compares arrays element-wise', () => {
    expect(deepEqual([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(deepEqual([1, 2, 3], [1, 2, 4])).toBe(false);
    expect(deepEqual([1, 2], [1, 2, 3])).toBe(false);
  });

  it('compares functions by reference, not by structural traversal', () => {
    const fn = () => 1;
    const fn2 = () => 1;
    expect(deepEqual({ curve: fn }, { curve: fn })).toBe(true);
    expect(deepEqual({ curve: fn }, { curve: fn2 })).toBe(false);
  });

  it('treats false vs an object as unequal (AnimationsConfig.axis shape)', () => {
    expect(deepEqual(false, { y: {} })).toBe(false);
    expect(deepEqual(false, false)).toBe(true);
  });

  it('treats undefined and a value as unequal', () => {
    expect(deepEqual(undefined, {})).toBe(false);
    expect(deepEqual(undefined, undefined)).toBe(true);
  });

  it('handles booleans as the top-level AnimationsConfig shorthand', () => {
    expect(deepEqual(true, true)).toBe(true);
    expect(deepEqual(true, false)).toBe(false);
    expect(deepEqual(true, { axis: false })).toBe(false);
  });
});

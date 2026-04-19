import { describe, expect, it } from 'vitest';

import { formatCompact, formatPriceAdaptive } from '../utils/format';

describe('formatCompact', () => {
  it.each<[number, string]>([
    [0, '0'],
    [1, '1.00'],
    [12.5, '12.50'],
    [100, '100'],
    [999, '999'],
    [1_000, '1.00K'],
    [12_345, '12.35K'],
    // 999_999 would round to "1000.00K" in the K bucket; formatter promotes
    // to the next bucket so the displayed unit matches the rounded value.
    [999_999, '1.00M'],
    [1e6, '1.00M'],
    [1.5e6, '1.50M'],
    [1e9, '1.00B'],
    [5.4e12, '5.40T'],
    [1e15, '1.00e+15'],
    [-1_500, '-1.50K'],
    [-5.4e12, '-5.40T'],
    [0.5, '0.5'],
    [0.123456, '0.1235'],
    [0.0001234, '0.0001234'],
    [0.00001234, '0.00001234'],
    [1.23e-10, '0.000000000123'],
    [1e-13, '1.00e-13'],
  ])('formatCompact(%s) -> %s', (input, expected) => {
    expect(formatCompact(input)).toBe(expected);
  });

  it('honors opts.decimals for suffixed values', () => {
    expect(formatCompact(1.2345e9, { decimals: 1 })).toBe('1.2B');
    // 1.2345 toFixed(3) truncates toward even (1.234), matching V8 semantics.
    expect(formatCompact(1.2345e9, { decimals: 3 })).toBe('1.234B');
  });

  it('renders edge-case numbers predictably', () => {
    expect(formatCompact(Number.NaN)).toBe('—');
    expect(formatCompact(Infinity)).toBe('∞');
    expect(formatCompact(-Infinity)).toBe('−∞');
  });

  it('handles Number.MAX_SAFE_INTEGER without producing a pathologically long string', () => {
    // MAX_SAFE_INTEGER ~= 9.007e15 — we fall back to scientific rather than
    // grinding through extra suffix buckets.
    const out = formatCompact(Number.MAX_SAFE_INTEGER);
    expect(out).toMatch(/^9\.01e\+15$/);
    expect(out.length).toBeLessThan(12);
  });
});

describe('formatPriceAdaptive', () => {
  it.each<[number, string]>([
    [0, '0'],
    [1, '1.0000'],
    [12.345, '12.3450'],
    [100, '100.00'],
    [9_999.5, '9999.50'],
    [12_345, '12345'],
    [1_234_567, '1234567'],
    [-12.5, '-12.5000'],
    [0.5, '0.5'],
    [0.123456, '0.1235'],
    [0.0001234, '0.0001234'],
    [0.00001234, '0.00001234'],
    [1.23e-10, '0.000000000123'],
    [1e-13, '1.00e-13'],
  ])('formatPriceAdaptive(%s) -> %s', (input, expected) => {
    expect(formatPriceAdaptive(input)).toBe(expected);
  });

  it('renders edge-case numbers predictably', () => {
    expect(formatPriceAdaptive(Number.NaN)).toBe('—');
    expect(formatPriceAdaptive(Infinity)).toBe('∞');
    expect(formatPriceAdaptive(-Infinity)).toBe('−∞');
  });
});

import { describe, expect, it } from 'vitest';

import {
  collapseZeros,
  formatCompact,
  formatPriceAdaptive,
  formatSignificant,
  formatTooltipValue,
  formatWholeTooltipValue,
} from '../utils/format';

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

describe('collapseZeros', () => {
  it.each<[string, string]>([
    ['0.000008123', '0.0₅8123'],
    ['-0.00000815', '-0.0₅815'],
    ['$0.0000081', '$0.0₅81'],
    ['0.0000000941', '0.0₇941'],
    ['0.000000000000000001', '0.0₁₇1'],
    ['0.0001234', '0.0001234'],
    ['0.00000', '0.00000'],
    ['10.0000081', '10.0000081'],
    ['47671', '47671'],
  ])('collapseZeros(%s) -> %s', (input, expected) => {
    expect(collapseZeros(input)).toBe(expected);
  });

  it('honors the run length and the decimal separator', () => {
    expect(collapseZeros('0.0001234', { from: 3 })).toBe('0.0₃1234');
    expect(collapseZeros('0,000008', { decimal: ',' })).toBe('0,0₅8');
    expect(collapseZeros('0.000008', { decimal: ',' })).toBe('0.000008');
  });
});

describe('formatSignificant', () => {
  it.each<[number, string]>([
    [0, '0'],
    [-0, '0'],
    [0.000008, '0.0₅8'],
    [0.00000812345, '0.0₅8123'],
    [0.0000000941, '0.0₇941'],
    [0.00123, '0.00123'],
    [0.0001234, '0.0001234'],
    [0.00001234, '0.0₄1234'],
    [0.5, '0.5'],
    [0.123456, '0.1235'],
    [1, '1'],
    [1.23456, '1.235'],
    [68_432.17, '68,432.17'],
    [999_999, '999,999'],
    [1_234_567_890, '1.235B'],
    [987_600_000, '987.6M'],
    [1_012_000_000, '1.012B'],
    [5.4e12, '5.4T'],
    [5.4e15, '5.4×10¹⁵'],
    [1e30, '1×10³⁰'],
    [-0.00000812345, '-0.0₅8123'],
    [-1_234_567_890, '-1.235B'],
  ])('formatSignificant(%s) -> %s', (input, expected) => {
    expect(formatSignificant(input)).toBe(expected);
  });

  it('picks the notation after rounding', () => {
    expect(formatSignificant(0.0000099996)).toBe('0.0₄1');
    expect(formatSignificant(0.99996)).toBe('1');
    expect(formatSignificant(999_999.9996)).toBe('1M');
    expect(formatSignificant(999_950_000)).toBe('1B');
    expect(formatSignificant(999_960_000_000)).toBe('1T');
    expect(formatSignificant(999_960_000_000_000)).toBe('1×10¹⁵');
  });

  it('keeps 4 significant digits outside the grouped mid range, at any magnitude from 1e-18 to 1e30', () => {
    for (let power = -18; power <= 30; power++) {
      const text = formatSignificant(1.2345678 * 10 ** power);
      const significant = text
        .replace(/^0\.0[₀-₉]+/, '')
        .replace(/×10.*$/, '')
        .replace(/[^0-9]/g, '')
        .replace(/^0+/, '');
      const midRange = power >= 0 && power < 6;

      expect(significant.length, text).toBeLessThanOrEqual(midRange ? 9 : 4);
      expect(text.length, text).toBeLessThanOrEqual(midRange ? 11 : 10);
    }
  });

  it('honors the options', () => {
    expect(formatSignificant(0.00000812345, { digits: 2 })).toBe('0.0₅81');
    expect(formatSignificant(0.0001234, { collapseZeros: 3 })).toBe('0.0₃1234');
    expect(formatSignificant(68_432.17, { compactFrom: 1e4 })).toBe('68.43K');
    expect(formatSignificant(5_000_000, { compactFrom: 1e9 })).toBe('5,000,000');
  });

  it('keeps trailing zeros on request, so a live value holds its width', () => {
    expect(formatSignificant(0.0000099996, { trimZeros: false })).toBe('0.0₄1000');
    expect(formatSignificant(0.000008, { trimZeros: false })).toBe('0.0₅8000');
    expect(formatSignificant(999_950_000, { trimZeros: false })).toBe('1.000B');
    expect(formatSignificant(1.2e9, { trimZeros: false })).toBe('1.200B');
    expect(formatSignificant(5.4e15, { trimZeros: false })).toBe('5.400×10¹⁵');
    expect(formatSignificant(1.5, { trimZeros: false })).toBe('1.5');
  });

  it('renders edge-case numbers predictably', () => {
    expect(formatSignificant(Number.NaN)).toBe('—');
    expect(formatSignificant(Infinity)).toBe('∞');
    expect(formatSignificant(-Infinity)).toBe('−∞');
  });
});

describe('formatTooltipValue', () => {
  it.each<[number, string, string]>([
    [0.0000081, 'close', '0.0₅8100'],
    [0.00000812345, 'close', '0.0₅8123'],
    [0.5, 'open', '0.5000'],
    [0, 'close', '0'],
    [1557.56, 'high', '1557.56'],
    [12.5, 'value', '12.5000'],
    [26_900, 'volume', '26.90K'],
    [Number.NaN, 'close', '—'],
  ])('formatTooltipValue(%s, %s) -> %s', (input, field, expected) => {
    expect(formatTooltipValue(input, field as 'close')).toBe(expected);
  });
});

describe('formatWholeTooltipValue', () => {
  it.each<[number, string, string]>([
    [237, 'value', '237'],
    [73, 'value', '73'],
    [-12, 'close', '-12'],
    [0, 'value', '0'],
    [26_900, 'volume', '26.90K'],
    [12_000_000, 'value', '12.00M'],
  ])('formatWholeTooltipValue(%s, %s) -> %s', (input, field, expected) => {
    expect(formatWholeTooltipValue(input, field as 'value')).toBe(expected);
  });
});

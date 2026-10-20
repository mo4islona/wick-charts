import { describe, expect, it } from 'vitest';

import { parseNumberParts } from '../utils/number-parts';

function shape(text: string, opts?: { decimal?: string }): string[] {
  return parseNumberParts(text, opts).map((p) => `${p.muted ? '~' : ''}${p.type}:${p.char}`);
}

function keys(text: string): string[] {
  return parseNumberParts(text).map((p) => p.key);
}

describe('parseNumberParts', () => {
  it('splits a collapsed fraction and mutes everything before the first significant digit', () => {
    expect(shape('0.0₅8123')).toEqual([
      '~integer:0',
      '~decimal:.',
      '~fraction:0',
      '~zeros:5',
      'fraction:8',
      'fraction:1',
      'fraction:2',
      'fraction:3',
    ]);
  });

  it('mutes the leading zeros of a plain fraction', () => {
    expect(shape('0.00123')).toEqual([
      '~integer:0',
      '~decimal:.',
      '~fraction:0',
      '~fraction:0',
      'fraction:1',
      'fraction:2',
      'fraction:3',
    ]);
  });

  it('keeps an all-zero number fully visible', () => {
    expect(shape('0')).toEqual(['integer:0']);
    expect(shape('0.00')).toEqual(['integer:0', 'decimal:.', 'fraction:0', 'fraction:0']);
  });

  it('reads signs, groups, suffixes and literals', () => {
    expect(shape('-$1,234.5K')).toEqual([
      'sign:-',
      'literal:$',
      'integer:1',
      'group:,',
      'integer:2',
      'integer:3',
      'integer:4',
      'decimal:.',
      'fraction:5',
      'suffix:K',
    ]);
  });

  it('reads a superscript power', () => {
    expect(shape('5.4×10¹⁵')).toEqual([
      'integer:5',
      'decimal:.',
      'fraction:4',
      '~base:×',
      '~base:1',
      '~base:0',
      '~exponent:1',
      '~exponent:5',
    ]);
  });

  it('follows the decimal separator of the locale', () => {
    expect(shape('1.234,5', { decimal: ',' })).toEqual([
      'integer:1',
      'group:.',
      'integer:2',
      'integer:3',
      'integer:4',
      'decimal:,',
      'fraction:5',
    ]);
  });

  it('passes through text that is not a number', () => {
    expect(shape('—')).toEqual(['literal:—']);
    expect(shape('∞')).toEqual(['literal:∞']);
  });

  it('keys digits by place, so an added integer digit leaves the others in their slots', () => {
    expect(keys('99.50')).toEqual(['i1', 'i0', 'dp', 'f1', 'f2']);
    expect(keys('100.50')).toEqual(['i2', 'i1', 'i0', 'dp', 'f1', 'f2']);
    expect(keys('1,234')).toEqual(['i3', 'g3', 'i2', 'i1', 'i0']);
    expect(keys('0.0₁₂8')).toEqual(['i0', 'dp', 'f1', 'z1', 'z0', 'f2']);
  });

  it('numbers the digits that carry the value from the left', () => {
    const sig = (text: string) => parseNumberParts(text).map((p) => p.sig);

    expect(sig('987.6M')).toEqual([0, 1, 2, null, 3, null]);
    expect(sig('1.012B')).toEqual([0, null, 1, 2, 3, null]);
    expect(sig('0.0₅8123')).toEqual([null, null, null, null, 0, 1, 2, 3]);
    expect(sig('-1,234')).toEqual([null, 0, null, 1, 2, 3]);
  });
});

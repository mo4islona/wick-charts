import { describe, expect, it } from 'vitest';

import { templateFormatter } from '../format-template';

function format(template: string, value: number, locale = 'en-US'): string {
  return templateFormatter({ template, locale, path: 'format' })(value);
}

describe('templateFormatter', () => {
  it('puts the value into the template', () => {
    expect(format('{value}%', 68)).toBe('68%');
  });

  it('groups digits and keeps up to two fraction digits by default', () => {
    expect(format('{value} ms', 1234.5678)).toBe('1,234.57 ms');
  });

  it('fixes the fraction digits with {value:N}', () => {
    expect(format('€{value:2}', 1234.5)).toBe('€1,234.50');
    expect(format('{value:0}', 2.6)).toBe('3');
  });

  it('formats for the locale', () => {
    expect(format('{value:1} €', 1234.5, 'de-DE')).toBe('1.234,5 €');
  });

  it('fills every placeholder', () => {
    expect(format('{value} / {value:1}', 2)).toBe('2 / 2.0');
  });
});

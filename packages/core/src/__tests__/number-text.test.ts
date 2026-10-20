// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';

import { formatSignificant } from '../utils/format';
import { accessibleNumberText, renderNumberText } from '../utils/number-text';

/** The text a screen reader gets: everything outside `aria-hidden`. */
function readable(el: HTMLElement): string {
  const copy = el.cloneNode(true) as HTMLElement;
  for (const hidden of copy.querySelectorAll('[aria-hidden="true"]')) {
    hidden.remove();
  }

  return copy.textContent ?? '';
}

describe('accessibleNumberText', () => {
  it('spells the zero count out', () => {
    expect(accessibleNumberText('0.0₅8100')).toBe('0.000008100');
    expect(accessibleNumberText('-0.0₁₂5')).toBe(`-0.${'0'.repeat(12)}5`);
    expect(accessibleNumberText('$0.0₄1234')).toBe('$0.00001234');
  });

  it('keeps a power and plain text as they are', () => {
    expect(accessibleNumberText('5.4×10¹⁵')).toBe('5.4×10¹⁵');
    expect(accessibleNumberText('1,234.5')).toBe('1,234.5');
  });

  it.each([8.1e-6, 1.234e-12, 0.00042, 5e-300])('reads back the value of formatSignificant(%s)', (value) => {
    const text = accessibleNumberText(formatSignificant(value));

    expect(Number(text)).toBe(Number(value.toPrecision(4)));
  });
});

describe('renderNumberText', () => {
  it('gives a reader the spelled-out number and hides the shrunk zero count', () => {
    const el = document.createElement('span');
    renderNumberText(el, '0.0₅81', { mute: false });

    expect(readable(el)).toBe('0.0000081');
    expect(el.querySelector('[aria-hidden="true"] [data-part="zeros"]')?.textContent).toBe('5');
  });

  it('adds no hidden copy when the text has no script digits', () => {
    const el = document.createElement('span');
    renderNumberText(el, '0.0042');

    expect(el.querySelector('[aria-hidden]')).toBeNull();
    expect(el.textContent).toBe('0.0042');
  });
});

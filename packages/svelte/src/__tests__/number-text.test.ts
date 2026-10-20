import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';

import NumberText from '../ui/NumberText.svelte';

/** Mirrors packages/react/src/__tests__/components/number-text.test.tsx. */

/** The text a screen reader gets: everything outside `aria-hidden`. */
function readable(el: Element): string {
  const copy = el.cloneNode(true) as Element;
  for (const hidden of copy.querySelectorAll('[aria-hidden="true"]')) {
    hidden.remove();
  }

  return copy.textContent ?? '';
}

describe('<NumberText> (Svelte)', () => {
  it('gives a reader the spelled-out number and hides the shrunk zero count', () => {
    const result = render(NumberText, { props: { text: '0.0₅8100' } });

    expect(readable(result.container)).toBe('0.000008100');
    expect(result.container.querySelector('[aria-hidden="true"] [data-part="zeros"]')?.textContent).toBe('5');
    result.unmount();
  });

  it('adds no hidden copy when only placing zeros are muted', () => {
    const result = render(NumberText, { props: { text: '0.0042' } });

    expect(result.container.querySelector('[aria-hidden="true"]')).toBeNull();
    expect(result.container.textContent).toBe('0.0042');
    result.unmount();
  });
});

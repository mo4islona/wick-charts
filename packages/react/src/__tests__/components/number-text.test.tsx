import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { NumberText } from '../../ui/NumberText';

/** The text a screen reader gets: everything outside `aria-hidden`. */
function readable(el: HTMLElement): string {
  const copy = el.cloneNode(true) as HTMLElement;
  for (const hidden of copy.querySelectorAll('[aria-hidden="true"]')) {
    hidden.remove();
  }

  return copy.textContent ?? '';
}

describe('<NumberText>', () => {
  it('gives a reader the spelled-out number and hides the shrunk zero count', () => {
    const { container } = render(<NumberText text="0.0₅8100" />);

    expect(readable(container)).toBe('0.000008100');
    expect(container.querySelector('[aria-hidden="true"] [data-part="zeros"]')?.textContent).toBe('5');
  });

  it('adds no hidden copy when only placing zeros are muted', () => {
    const { container } = render(<NumberText text="0.0042" />);

    expect(container.querySelector('[aria-hidden="true"]')).toBeNull();
    expect(container.textContent).toBe('0.0042');
  });
});

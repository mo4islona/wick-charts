import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { defineComponent, h } from 'vue';

import NumberText from '../ui/NumberText.vue';

/** Mirrors packages/react/src/__tests__/components/number-text.test.tsx. */

/** The text a screen reader gets: everything outside `aria-hidden`. */
function readable(el: Element): string {
  const copy = el.cloneNode(true) as Element;
  for (const hidden of copy.querySelectorAll('[aria-hidden="true"]')) {
    hidden.remove();
  }

  return copy.textContent ?? '';
}

function mountText(text: string) {
  return mount(defineComponent({ render: () => h('span', h(NumberText, { text })) }));
}

describe('<NumberText> (Vue)', () => {
  it('gives a reader the spelled-out number and hides the shrunk zero count', () => {
    const wrapper = mountText('0.0₅8100');

    expect(readable(wrapper.element)).toBe('0.000008100');
    expect(wrapper.element.querySelector('[aria-hidden="true"] [data-part="zeros"]')?.textContent).toBe('5');
    wrapper.unmount();
  });

  it('adds no hidden copy when only placing zeros are muted', () => {
    const wrapper = mountText('0.0042');

    expect(wrapper.element.querySelector('[aria-hidden="true"]')).toBeNull();
    expect(wrapper.element.textContent).toBe('0.0042');
    wrapper.unmount();
  });
});

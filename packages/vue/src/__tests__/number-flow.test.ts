import { mount } from '@vue/test-utils';
import { NumberFlow } from '@wick-charts/vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Mirrors packages/react/src/__tests__/components/number-flow.test.tsx. */

function slots(root: Element): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('[data-part]'));
}

function transitions(root: Element): string[] {
  return Array.from(root.querySelectorAll<HTMLElement>('span[style*="translateY"]')).map((c) => c.style.transition);
}

describe('<NumberFlow> (Vue)', () => {
  const reducedMotionStub = globalThis.matchMedia;

  beforeEach(() => {
    // The test setup reports reduced motion for every file; NumberFlow spins only without it.
    globalThis.matchMedia = ((query: string) => ({ matches: false, media: query })) as typeof globalThis.matchMedia;
  });

  afterEach(() => {
    globalThis.matchMedia = reducedMotionStub;
    vi.restoreAllMocks();
  });

  it('collapses leading zeros by default', () => {
    const wrapper = mount(NumberFlow, { props: { value: 0.00000812345 } });

    expect(wrapper.element.getAttribute('aria-label')).toBe('0.0₅8123');
    expect(slots(wrapper.element).map((s) => s.dataset.part)).toContain('zeros');
    wrapper.unmount();
  });

  it('keeps an unchanged digit mounted when a digit is added in front', async () => {
    const now = vi.spyOn(performance, 'now').mockReturnValue(1_000);
    const format = (v: number) => v.toFixed(2);
    const wrapper = mount(NumberFlow, { props: { value: 99.5, format } });
    const before = slots(wrapper.element);

    now.mockReturnValue(2_000);
    await wrapper.setProps({ value: 100.5 });
    const after = slots(wrapper.element);

    expect(after).toHaveLength(6);
    expect(after.slice(1)).toEqual(before);
    expect(after[0].style.transition).toContain('grid-template-columns 350ms');
    wrapper.unmount();
  });

  it('snaps the digits when a value comes before the last spin ends', async () => {
    const now = vi.spyOn(performance, 'now').mockReturnValue(1_000);
    const wrapper = mount(NumberFlow, { props: { value: 1 } });

    now.mockReturnValue(2_000);
    await wrapper.setProps({ value: 2 });
    expect(transitions(wrapper.element)).toEqual([expect.stringContaining('350ms')]);

    now.mockReturnValue(2_025);
    await wrapper.setProps({ value: 3 });
    expect(transitions(wrapper.element)).toEqual(['none']);
    wrapper.unmount();
  });
});

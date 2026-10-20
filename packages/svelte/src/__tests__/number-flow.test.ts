import { render } from '@testing-library/svelte';
import { NumberFlow } from '@wick-charts/svelte';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Mirrors packages/react/src/__tests__/components/number-flow.test.tsx. */

function slots(root: Element): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('[data-part]'));
}

function transitions(root: Element): string[] {
  return Array.from(root.querySelectorAll<HTMLElement>('span[style*="translateY"]')).map((c) => c.style.transition);
}

describe('<NumberFlow> (Svelte)', () => {
  const reducedMotionStub = globalThis.matchMedia;

  beforeEach(() => {
    // The test setup reports reduced motion for every file; NumberFlow spins only without it.
    globalThis.matchMedia = ((query: string) => ({ matches: false, media: query })) as typeof globalThis.matchMedia;
  });

  afterEach(() => {
    globalThis.matchMedia = reducedMotionStub;
    vi.restoreAllMocks();
  });

  it('collapses leading zeros by default', async () => {
    const result = render(NumberFlow, { props: { value: 0.00000812345 } });
    await tick();

    expect(result.container.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('0.000008123');
    expect(slots(result.container).map((s) => s.dataset.part)).toContain('zeros');
    result.unmount();
  });

  it('keeps an unchanged digit mounted when a digit is added in front', async () => {
    const now = vi.spyOn(performance, 'now').mockReturnValue(1_000);
    const format = (v: number) => v.toFixed(2);
    const result = render(NumberFlow, { props: { value: 99.5, format } });
    await tick();
    const before = slots(result.container);

    now.mockReturnValue(2_000);
    result.component.$set({ value: 100.5 });
    await tick();
    const after = slots(result.container);

    expect(after).toHaveLength(6);
    expect(after.slice(1)).toEqual(before);
    expect(after[0].style.transition).toContain('grid-template-columns 350ms');
    result.unmount();
  });

  it('snaps the digits when a value comes before the last spin ends', async () => {
    const now = vi.spyOn(performance, 'now').mockReturnValue(1_000);
    const result = render(NumberFlow, { props: { value: 1 } });
    await tick();

    now.mockReturnValue(2_000);
    result.component.$set({ value: 2 });
    await tick();
    expect(transitions(result.container)).toEqual([expect.stringContaining('350ms')]);

    now.mockReturnValue(2_025);
    result.component.$set({ value: 3 });
    await tick();
    expect(transitions(result.container)).toEqual(['none']);
    result.unmount();
  });
});

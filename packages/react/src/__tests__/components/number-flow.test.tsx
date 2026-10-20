import { render } from '@testing-library/react';
import { NumberFlow } from '@wick-charts/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** The `transition` of every digit column. */
function transitions(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll<HTMLElement>('span[style*="translateY"]')).map(
    (column) => column.style.transition,
  );
}

function parts(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll<HTMLElement>('[data-part]')).map((el) => el.dataset.part ?? '');
}

describe('<NumberFlow>', () => {
  const reducedMotionStub = globalThis.matchMedia;

  beforeEach(() => {
    // The test setup reports reduced motion for every file; NumberFlow spins only without it.
    globalThis.matchMedia = ((query: string) => ({ matches: false, media: query })) as typeof globalThis.matchMedia;
  });

  afterEach(() => {
    globalThis.matchMedia = reducedMotionStub;
    vi.restoreAllMocks();
  });

  it('spins a digit when the values come slower than the spin', () => {
    const now = vi.spyOn(performance, 'now').mockReturnValue(1_000);
    const view = render(<NumberFlow value={1} spinDuration={350} />);

    now.mockReturnValue(2_000);
    view.rerender(<NumberFlow value={2} spinDuration={350} />);
    now.mockReturnValue(3_000);
    view.rerender(<NumberFlow value={3} spinDuration={350} />);

    expect(transitions(view.container)).toEqual([expect.stringContaining('350ms')]);
  });

  it('snaps the digits when a value comes before the last spin ends', () => {
    const now = vi.spyOn(performance, 'now').mockReturnValue(1_000);
    const view = render(<NumberFlow value={1} spinDuration={350} />);

    now.mockReturnValue(2_000);
    view.rerender(<NumberFlow value={2} spinDuration={350} />);
    now.mockReturnValue(2_025);
    view.rerender(<NumberFlow value={3} spinDuration={350} />);

    expect(transitions(view.container)).toEqual(['none']);
  });

  it('collapses leading zeros by default', () => {
    const view = render(<NumberFlow value={0.00000812345} />);

    expect(parts(view.container)).toEqual([
      'integer',
      'decimal',
      'fraction',
      'zeros',
      'fraction',
      'fraction',
      'fraction',
      'fraction',
    ]);
    expect(view.container.firstElementChild?.getAttribute('aria-label')).toBe('0.000008123');
  });

  it('keeps an unchanged digit mounted when a digit is added in front', () => {
    const now = vi.spyOn(performance, 'now').mockReturnValue(1_000);
    const format = (v: number) => v.toFixed(2);
    const view = render(<NumberFlow value={99.5} format={format} />);
    const before = Array.from(view.container.querySelectorAll('[data-part]'));

    now.mockReturnValue(2_000);
    view.rerender(<NumberFlow value={100.5} format={format} />);
    const after = Array.from(view.container.querySelectorAll('[data-part]'));

    expect(after).toHaveLength(6);
    expect(after.slice(1)).toEqual(before);
    expect((after[0] as HTMLElement).style.gridTemplateColumns).toBe('1fr');
    expect((after[0] as HTMLElement).style.transition).toContain('grid-template-columns 350ms');
  });

  it('honors the legacy Intl options and a custom formatter', () => {
    const intl = render(<NumberFlow value={1234.5} format={{ minimumFractionDigits: 2 }} />);
    const custom = render(<NumberFlow value={0.5} format={(v) => `${v * 100}%`} />);

    expect(intl.container.firstElementChild?.getAttribute('aria-label')).toBe('1,234.50');
    expect(custom.container.firstElementChild?.getAttribute('aria-label')).toBe('50%');
  });
});

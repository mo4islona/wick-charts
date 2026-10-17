import { render } from '@testing-library/react';
import { NumberFlow } from '@wick-charts/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/** The `transition` of every digit column. */
function transitions(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll<HTMLElement>('span[style*="translateY"]')).map(
    (column) => column.style.transition,
  );
}

describe('<NumberFlow>', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('spins a digit when the values come slower than the spin', () => {
    const now = vi.spyOn(performance, 'now').mockReturnValue(1_000);
    const view = render(<NumberFlow value={1} spinDuration={350} />);

    view.rerender(<NumberFlow value={2} spinDuration={350} />);
    now.mockReturnValue(2_000);
    view.rerender(<NumberFlow value={3} spinDuration={350} />);

    expect(transitions(view.container)).toEqual([expect.stringContaining('350ms')]);
  });

  it('snaps the digits when a value comes before the last spin ends', () => {
    const now = vi.spyOn(performance, 'now').mockReturnValue(1_000);
    const view = render(<NumberFlow value={1} spinDuration={350} />);

    view.rerender(<NumberFlow value={2} spinDuration={350} />);
    now.mockReturnValue(1_025);
    view.rerender(<NumberFlow value={3} spinDuration={350} />);

    expect(transitions(view.container)).toEqual(['none']);
  });
});

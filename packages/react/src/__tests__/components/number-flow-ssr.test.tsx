import { act } from '@testing-library/react';
import { formatSignificant } from '@wick-charts/core';
import { NumberFlow } from '@wick-charts/react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

// React 18's server renderer warns about every `useLayoutEffect`; that is not a hydration problem.
function serverHtml(value: number): string {
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  const html = renderToString(<NumberFlow value={value} />);
  errors.mockRestore();

  return html;
}

/** Hydrates server HTML of `serverValue` with `clientValue`; returns the host and what hydration logged. */
function hydrate(serverValue: number, clientValue: number): { host: HTMLElement; errors: unknown[][] } {
  const host = document.createElement('div');
  host.innerHTML = serverHtml(serverValue);
  document.body.append(host);

  const errors = vi.spyOn(console, 'error');
  act(() => {
    hydrateRoot(host, <NumberFlow value={clientValue} />);
  });

  return { host, errors: errors.mock.calls };
}

describe('<NumberFlow> server rendering', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('puts the formatted number in the server HTML', () => {
    const host = document.createElement('div');
    host.innerHTML = serverHtml(1234.5);

    expect(host.textContent).toBe(formatSignificant(1234.5));
  });

  it('hydrates without a warning and hands the root to the digit slots', () => {
    const { host, errors } = hydrate(1234.5, 1234.5);
    const root = host.firstElementChild;

    expect(errors).toEqual([]);
    expect(root?.querySelectorAll('[data-part]').length).toBe(formatSignificant(1234.5).length);
    expect(Array.from(root?.childNodes ?? []).every((node) => node instanceof HTMLElement)).toBe(true);
    expect(root?.getAttribute('aria-label')).toBe(formatSignificant(1234.5));
  });

  it('hydrates without a warning when the value ticked after the server render', () => {
    const { host, errors } = hydrate(1, 2);

    expect(errors).toEqual([]);
    expect(host.firstElementChild?.getAttribute('aria-label')).toBe('2');
  });
});

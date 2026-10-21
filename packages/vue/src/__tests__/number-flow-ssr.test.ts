import { formatSignificant } from '@wick-charts/core';
import { NumberFlow } from '@wick-charts/vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';

/** Mirrors packages/react/src/__tests__/components/number-flow-ssr.test.tsx. */

/** Hydrates server HTML of `serverValue` with `clientValue`; returns the host and what hydration logged. */
async function hydrate(serverValue: number, clientValue: number): Promise<{ host: HTMLElement; logged: unknown[][] }> {
  const host = document.createElement('div');
  host.innerHTML = await renderToString(createSSRApp(NumberFlow, { value: serverValue }));
  document.body.append(host);

  const warns = vi.spyOn(console, 'warn');
  const errors = vi.spyOn(console, 'error');
  createSSRApp(NumberFlow, { value: clientValue }).mount(host);

  return { host, logged: [...warns.mock.calls, ...errors.mock.calls] };
}

describe('<NumberFlow> (Vue) server rendering', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('puts the formatted number in the server HTML', async () => {
    const host = document.createElement('div');
    host.innerHTML = await renderToString(createSSRApp(NumberFlow, { value: 1234.5 }));

    expect(host.textContent).toBe(formatSignificant(1234.5));
  });

  it('hydrates without a warning and hands the root to the digit slots', async () => {
    const { host, logged } = await hydrate(1234.5, 1234.5);
    const root = host.firstElementChild;

    expect(logged).toEqual([]);
    expect(root?.querySelectorAll('[data-part]').length).toBe(formatSignificant(1234.5).length);
    expect(Array.from(root?.childNodes ?? []).every((node) => node instanceof HTMLElement)).toBe(true);
    expect(root?.getAttribute('aria-label')).toBe(formatSignificant(1234.5));
  });

  it('hydrates without a warning when the value ticked after the server render', async () => {
    const { host, logged } = await hydrate(1, 2);

    expect(logged).toEqual([]);
    expect(host.firstElementChild?.getAttribute('aria-label')).toBe('2');
  });
});

import { act } from '@testing-library/react';
import { ChartContainer, catppuccin, githubLight } from '@wick-charts/react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { flushAllRaf, installRaf, uninstallRaf } from '../helpers/raf';

/** The server and the client resolve different themes, as a `prefers-color-scheme` check does. */
describe('<ChartContainer> hydration', () => {
  beforeEach(() => {
    installRaf();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
    uninstallRaf();
  });

  it('paints the client theme background over the server one', () => {
    const host = document.createElement('div');
    host.innerHTML = renderToString(<ChartContainer theme={githubLight.theme} />);
    document.body.append(host);

    act(() => {
      hydrateRoot(host, <ChartContainer theme={catppuccin.theme} />);
    });
    flushAllRaf();

    const root = host.firstElementChild as HTMLElement | null;
    const probe = document.createElement('div');
    probe.style.background = catppuccin.theme.background;

    expect(root?.style.background).toBe(probe.style.background);
  });

  it('keeps a background color the caller sets through `style`', () => {
    const host = document.createElement('div');
    host.innerHTML = renderToString(<ChartContainer theme={githubLight.theme} style={{ backgroundColor: 'red' }} />);
    document.body.append(host);

    act(() => {
      hydrateRoot(host, <ChartContainer theme={catppuccin.theme} style={{ backgroundColor: 'red' }} />);
    });
    flushAllRaf();

    const root = host.firstElementChild as HTMLElement | null;

    expect(root?.style.backgroundColor).toBe('red');
  });

  it('keeps numeric background sizes in px after hydration', () => {
    const style = { backgroundSize: 24, backgroundPositionX: 12 };
    const host = document.createElement('div');
    host.innerHTML = renderToString(<ChartContainer theme={githubLight.theme} style={style} />);
    document.body.append(host);

    act(() => {
      hydrateRoot(host, <ChartContainer theme={catppuccin.theme} style={style} />);
    });
    flushAllRaf();

    const root = host.firstElementChild as HTMLElement | null;

    expect(root?.style.backgroundSize).toBe('24px');
    expect(root?.style.backgroundPositionX).toBe('12px');
  });

  it('leaves the background styles of a client render to React', () => {
    const host = document.createElement('div');
    document.body.append(host);

    act(() => {
      createRoot(host).render(<ChartContainer style={{ backgroundSize: 24 }} />);
    });
    flushAllRaf();

    const root = host.firstElementChild as HTMLElement | null;

    expect(root?.style.backgroundSize).toBe('24px');
  });
});

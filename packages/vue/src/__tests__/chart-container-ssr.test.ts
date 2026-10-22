import { ChartContainer, catppuccin, githubLight } from '@wick-charts/vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSSRApp, h, nextTick } from 'vue';
import { renderToString } from 'vue/server-renderer';

import { flushAllRaf, installRaf, uninstallRaf } from '../../../react/src/__tests__/helpers/raf';

/** The server and the client resolve different themes, as a `prefers-color-scheme` check does. */
describe('<ChartContainer> (Vue) hydration', () => {
  beforeEach(() => {
    installRaf();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
    uninstallRaf();
  });

  it('paints the client theme background over the server one', async () => {
    const app = (theme: typeof githubLight.theme) => createSSRApp({ render: () => h(ChartContainer, { theme }) });
    const host = document.createElement('div');
    host.innerHTML = await renderToString(app(githubLight.theme));
    document.body.append(host);

    app(catppuccin.theme).mount(host);
    await nextTick();
    flushAllRaf();

    const root = host.firstElementChild as HTMLElement | null;
    const probe = document.createElement('div');
    probe.style.background = catppuccin.theme.background;

    expect(root?.style.background).toBe(probe.style.background);
  });
});

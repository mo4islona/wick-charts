import { render } from '@testing-library/svelte';
import type { ChartInstance } from '@wick-charts/core';
import { catppuccin, githubLight } from '@wick-charts/svelte';
import { tick } from 'svelte';
import { describe, expect, it } from 'vitest';

import ThemeHarness from './ThemeHarness.svelte';

async function settle(): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await tick();
    await new Promise((r) => requestAnimationFrame(() => r(undefined)));
  }
}

describe('Svelte <ChartContainer> theme prop', () => {
  it('restores the default theme when the prop goes back to undefined', async () => {
    let chart: ChartInstance | null = null;
    const result = render(ThemeHarness, {
      theme: githubLight.theme,
      onChart: (c: ChartInstance) => {
        chart = c;
      },
    });
    await settle();

    await result.rerender({ theme: undefined });
    await settle();

    const root = result.container.firstElementChild as HTMLElement;
    expect((chart as ChartInstance | null)?.getTheme()).toBe(catppuccin.theme);
    expect(root.getAttribute('style')).toContain(`background:${catppuccin.theme.background}`);
    result.unmount();
  });

  it('takes a theme preset as well as its .theme', async () => {
    let chart: ChartInstance | null = null;
    const result = render(ThemeHarness, {
      theme: githubLight,
      onChart: (c: ChartInstance) => {
        chart = c;
      },
    });
    await settle();

    const root = result.container.firstElementChild as HTMLElement;
    expect((chart as ChartInstance | null)?.getTheme()).toBe(githubLight.theme);
    expect(root.getAttribute('style')).toContain(`background:${githubLight.theme.background}`);
    result.unmount();
  });

  it('mounts with an explicit null theme (JS caller) and uses the default theme', async () => {
    let chart: ChartInstance | null = null;
    const result = render(ThemeHarness, {
      theme: null as unknown as undefined,
      onChart: (c: ChartInstance) => {
        chart = c;
      },
    });
    await settle();

    expect((chart as ChartInstance | null)?.getTheme()).toBe(catppuccin.theme);
    result.unmount();
  });
});

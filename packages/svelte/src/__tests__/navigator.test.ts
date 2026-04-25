import { render } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, describe, expect, it } from 'vitest';

import NavigatorHarness from './NavigatorHarness.svelte';

const candlestickData = [
  { time: 1, open: 1, high: 2, low: 1, close: 2 },
  { time: 2, open: 2, high: 3, low: 2, close: 3 },
  { time: 3, open: 3, high: 4, low: 3, close: 4 },
];

const navigatorData = {
  type: 'line' as const,
  points: candlestickData.map((p) => ({ time: p.time, value: p.close })),
};

async function settle(): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await tick();
    await new Promise((r) => requestAnimationFrame(() => r(undefined)));
  }
}

describe('<Navigator> (svelte)', () => {
  let cleanup: (() => void) | null = null;

  afterEach(() => {
    cleanup?.();
    cleanup = null;
  });

  it('mounts a navigator strip inside the chart container anchor', async () => {
    const { unmount } = render(NavigatorHarness, {
      props: { candlestickData, navigatorData },
    });
    cleanup = unmount;

    await settle();

    const anchor = document.querySelector('[data-navigator-anchor]');
    expect(anchor).not.toBeNull();

    const strip = document.querySelector('[data-chart-navigator]');
    expect(strip).not.toBeNull();
    expect(strip?.querySelector('canvas')).not.toBeNull();
    expect(anchor?.contains(strip as Node)).toBe(true);
  });

  it('applies an explicit height override', async () => {
    const { unmount } = render(NavigatorHarness, {
      props: { candlestickData, navigatorData, height: 40 },
    });
    cleanup = unmount;

    await settle();

    const strip = document.querySelector('[data-chart-navigator]') as HTMLElement | null;
    expect(strip?.style.height).toBe('40px');
  });
});

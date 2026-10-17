import { render } from '@testing-library/svelte';
import type { ChartInstance, OHLCInput } from '@wick-charts/core';
import { tick } from 'svelte';
import { describe, expect, it } from 'vitest';

import InPlaceHarness from './InPlaceHarness.svelte';

async function settle(): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await tick();
    await new Promise((r) => requestAnimationFrame(() => r(undefined)));
  }
}

describe('Svelte series data edited in place', () => {
  it('shows an edit of the last point made with `data[i] = x; data = data`', async () => {
    let chart: ChartInstance | null = null;
    const data: OHLCInput[] = Array.from({ length: 6 }, (_, i) => ({
      time: i + 1,
      open: 100,
      high: 110,
      low: 90,
      close: 100 + i,
    }));
    const result = render(InPlaceHarness, {
      data,
      onChart: (c: ChartInstance) => {
        chart = c;
      },
    });
    await settle();

    data[5] = { time: 6, open: 100, high: 130, low: 90, close: 128 };
    await result.rerender({ data });
    await settle();

    expect((chart as ChartInstance | null)?.getLastValue('cs')?.value).toBe(128);
    result.unmount();
  });
});

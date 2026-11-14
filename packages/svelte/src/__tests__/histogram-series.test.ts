import { render } from '@testing-library/svelte';
import type { ChartInstance } from '@wick-charts/core';
import { tick } from 'svelte';
import { describe, expect, it } from 'vitest';

import HistogramSeriesHarness from './HistogramSeriesHarness.svelte';

const STILL = { introMs: 0, entryMs: 0, smoothMs: 0, binWidth: 10 };

async function settle(): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await tick();
    await new Promise((r) => requestAnimationFrame(() => r(undefined)));
  }
}

function mountHistogram(data: number[] | Array<{ label: string; data: number[] }>) {
  let captured: ChartInstance | null = null;
  const view = render(HistogramSeriesHarness, {
    data,
    options: STILL,
    onChart: (c: ChartInstance) => {
      captured = c;
    },
  });

  const chart = (): ChartInstance => {
    if (!captured) throw new Error('probe did not run');

    return captured;
  };

  return { ...view, chart };
}

describe('Svelte <HistogramSeries>', () => {
  it('names overlaid layers for <Legend>', async () => {
    const view = mountHistogram([
      { label: 'API', data: [10, 12] },
      { label: 'DB', data: [30] },
    ]);
    await settle();

    expect(view.chart().getLayerLabel('h', 0)).toBe('API');
    expect(view.container.textContent).toContain('DB');
    view.unmount();
  });

  it('re-bins samples pushed in place with `data.push(x); data = data`', async () => {
    const data = [5, 15];
    const view = mountHistogram(data);
    await settle();

    data.push(15, 15);
    await view.rerender({ data });
    await settle();

    expect(view.chart().getDataAtTime('h', 12)).toMatchObject({ count: 3 });
    view.unmount();
  });
});

import { render } from '@testing-library/svelte';
import type { BandPointInput, ChartInstance } from '@wick-charts/core';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import BandSeriesHarness from './BandSeriesHarness.svelte';

/**
 * `<BandSeries>` lifecycle: mount registers a band series, the reactive block
 * syncs edges, a nested array maps to one band per layer, and unmount removes
 * the series from the chart. Mirrors the Vue `band-series.test`.
 */

const band: BandPointInput[] = [
  { time: 1, low: 10, high: 20 },
  { time: 2, low: 12, high: 24 },
  { time: 3, low: 11, high: 22 },
];

const twoBands: BandPointInput[][] = [
  band,
  [
    { time: 1, low: 14, high: 16 },
    { time: 2, low: 16, high: 19 },
    { time: 3, low: 15, high: 18 },
  ],
];

async function settle(): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await tick();
    await new Promise((r) => requestAnimationFrame(() => r(undefined)));
  }
}

function installSizePatch(width = 800, height = 400): () => void {
  const origRect = HTMLDivElement.prototype.getBoundingClientRect;
  HTMLDivElement.prototype.getBoundingClientRect = function patched() {
    const r = origRect.call(this);
    if (r.width > 0 && r.height > 0) return r;

    return { x: 0, y: 0, top: 0, left: 0, bottom: height, right: width, width, height, toJSON: () => ({}) } as DOMRect;
  };
  const origWidthDesc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
  const origHeightDesc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => width });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => height });

  return () => {
    HTMLDivElement.prototype.getBoundingClientRect = origRect;
    if (origWidthDesc) {
      Object.defineProperty(HTMLElement.prototype, 'clientWidth', origWidthDesc);
    } else {
      delete (HTMLElement.prototype as unknown as Record<string, unknown>).clientWidth;
    }
    if (origHeightDesc) {
      Object.defineProperty(HTMLElement.prototype, 'clientHeight', origHeightDesc);
    } else {
      delete (HTMLElement.prototype as unknown as Record<string, unknown>).clientHeight;
    }
  };
}

function mountBand(data: BandPointInput[] | BandPointInput[][]) {
  let captured: ChartInstance | null = null;
  const view = render(BandSeriesHarness, {
    props: {
      data,
      onChart: (c: ChartInstance) => {
        captured = c;
      },
    },
  });

  const chart = (): ChartInstance => {
    if (!captured) throw new Error('probe did not run');

    return captured;
  };

  return { ...view, chart };
}

describe('Svelte <BandSeries>', () => {
  let restore: () => void;

  beforeEach(() => {
    restore = installSizePatch();
  });

  afterEach(() => {
    restore();
  });

  it('mounts a band series and exposes its edges via getDataAtTime', async () => {
    const { chart, unmount } = mountBand(band);
    await settle();

    expect(chart().getSeriesIds()).toContain('band');
    expect(chart().getDataAtTime('band', 1)).toMatchObject({ time: 1, low: 10, high: 20 });

    unmount();
  });

  it('syncs a data change through the reactive block', async () => {
    const { chart, rerender, unmount } = mountBand(band);
    await settle();

    await rerender({
      data: [
        { time: 1, low: 30, high: 50 },
        { time: 2, low: 32, high: 54 },
        { time: 3, low: 31, high: 52 },
      ],
    });
    await settle();

    expect(chart().getDataAtTime('band', 1)).toMatchObject({ low: 30, high: 50 });

    unmount();
  });

  it('creates one layer per band from BandPointInput[][]', async () => {
    const { chart, unmount } = mountBand(twoBands);
    await settle();

    const layers = chart().getLayerSnapshots('band', 1);
    expect(layers?.map((l) => [l.layerIndex, l.low, l.high])).toEqual([
      [0, 10, 20],
      [1, 14, 16],
    ]);

    unmount();
  });

  it('removes the series when the component unmounts', async () => {
    const { chart, rerender, unmount } = mountBand(band);
    await settle();
    expect(chart().getSeriesIds()).toContain('band');

    await rerender({ show: false });
    await settle();

    expect(chart().getSeriesIds()).not.toContain('band');

    unmount();
  });
});

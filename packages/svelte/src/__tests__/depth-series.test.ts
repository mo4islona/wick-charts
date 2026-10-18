import { render } from '@testing-library/svelte';
import type { ChartInstance, DepthLevel } from '@wick-charts/core';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import DepthSeriesHarness from './DepthSeriesHarness.svelte';

/**
 * `<DepthSeries>` lifecycle: mount registers a depth series with the initial
 * book, the reactive block re-sends a new book, and unmount removes the
 * series. Mirrors the Vue `depth-series.test`.
 */

const BIDS: DepthLevel[] = [
  [99, 1],
  [97, 2],
];
const ASKS: DepthLevel[] = [
  [101, 1],
  [103, 2],
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

function mountDepth(asks: DepthLevel[]) {
  let captured: ChartInstance | null = null;
  const view = render(DepthSeriesHarness, {
    props: {
      bids: BIDS,
      asks,
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

describe('Svelte <DepthSeries>', () => {
  let restore: () => void;

  beforeEach(() => {
    restore = installSizePatch();
  });

  afterEach(() => {
    restore();
  });

  it('mounts a depth series with the initial book', async () => {
    const { chart, unmount } = mountDepth(ASKS);
    await settle();

    expect(chart().getSeriesIds()).toContain('book');
    expect(chart().getLayerSnapshots('book', 104)?.[0]).toMatchObject({ layerIndex: 1, time: 103, value: 3 });
    expect(chart().getLayerSnapshots('book', 98)?.[0]).toMatchObject({ layerIndex: 0, time: 99, value: 1 });

    unmount();
  });

  it('re-sends the book when a side changes', async () => {
    const { chart, rerender, unmount } = mountDepth(ASKS);
    await settle();

    await rerender({
      asks: [
        [101, 5],
        [103, 2],
      ],
    });
    await settle();

    expect(chart().getLayerSnapshots('book', 104)?.[0]).toMatchObject({ time: 103, value: 7 });

    unmount();
  });

  it('removes the series when the component unmounts', async () => {
    const { chart, rerender, unmount } = mountDepth(ASKS);
    await settle();
    expect(chart().getSeriesIds()).toContain('book');

    await rerender({ show: false });
    await settle();

    expect(chart().getSeriesIds()).not.toContain('book');

    unmount();
  });
});

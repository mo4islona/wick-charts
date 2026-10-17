import { cleanup, render } from '@testing-library/svelte';
import type { ChartInstance } from '@wick-charts/core';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import LayerCountHarness from './LayerCountHarness.svelte';

/** Line, Bar and Band series follow a change in the number of layers after mount, as in React. */

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

const layers = [
  {
    label: 'a',
    data: [
      { time: 1, value: 10 },
      { time: 2, value: 20 },
    ],
  },
  {
    label: 'b',
    data: [
      { time: 1, value: 5 },
      { time: 2, value: 15 },
    ],
  },
];

const bands = [
  [
    { time: 1, low: 10, high: 20 },
    { time: 2, low: 12, high: 24 },
  ],
  [
    { time: 1, low: 14, high: 16 },
    { time: 2, low: 16, high: 19 },
  ],
];

function mountHarness(kind: 'line' | 'bar' | 'band') {
  let captured: ChartInstance | null = null;
  const view = render(LayerCountHarness, {
    props: {
      kind,
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

describe('Svelte series layer count', () => {
  let restore: () => void;

  beforeEach(() => {
    restore = installSizePatch();
  });

  afterEach(() => {
    cleanup();
    restore();
  });

  for (const kind of ['line', 'bar'] as const) {
    it(`${kind}: layers loaded after mount are all drawn`, async () => {
      const { chart, rerender } = mountHarness(kind);
      await settle();

      await rerender({ data: layers });
      await settle();

      const snapshots = chart().getLayerSnapshots('s', 2);
      expect(snapshots?.map((l) => [l.layerIndex, l.value])).toEqual([
        [0, 20],
        [1, 15],
      ]);
      expect(chart().getLayerLabel('s', 1)).toBe('b');
    });
  }

  it('band: bands loaded after mount are all drawn', async () => {
    const { chart, rerender } = mountHarness('band');
    await settle();

    await rerender({ bandData: bands });
    await settle();

    const snapshots = chart().getLayerSnapshots('s', 2);
    expect(snapshots?.map((l) => [l.layerIndex, l.low, l.high])).toEqual([
      [0, 12, 24],
      [1, 16, 19],
    ]);
  });
});

import { render } from '@testing-library/svelte';
import type { ChartInstance } from '@wick-charts/core';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import DeclarativeCallbacksHarness from './DeclarativeCallbacksHarness.svelte';

/**
 * Plumbing check: `onReady` / `onVisibleRangeChange` / `onCrosshairMove` and
 * the controlled `visibleRange` prop reach the chart, mirroring the React/Vue
 * coverage. Full event semantics are covered once at the core level.
 */

const candlestickData = [
  { time: 1, open: 1, high: 2, low: 1, close: 2 },
  { time: 2, open: 2, high: 3, low: 2, close: 3 },
  { time: 3, open: 3, high: 4, low: 3, close: 4 },
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
    if (origWidthDesc) Object.defineProperty(HTMLElement.prototype, 'clientWidth', origWidthDesc);
    else delete (HTMLElement.prototype as unknown as Record<string, unknown>).clientWidth;
    if (origHeightDesc) Object.defineProperty(HTMLElement.prototype, 'clientHeight', origHeightDesc);
    else delete (HTMLElement.prototype as unknown as Record<string, unknown>).clientHeight;
  };
}

describe('Svelte <ChartContainer> onReady / onVisibleRangeChange / onCrosshairMove / visibleRange', () => {
  let restoreSize: () => void;

  beforeEach(() => {
    restoreSize = installSizePatch();
  });

  afterEach(() => {
    restoreSize();
  });

  it('fires onReady once at mount with the ChartInstance', async () => {
    const onReady = vi.fn();
    const { unmount } = render(DeclarativeCallbacksHarness, { candlestickData, onReady });
    await settle();

    expect(onReady).toHaveBeenCalledTimes(1);
    expect(onReady.mock.calls[0][0]).toBeInstanceOf(Object);

    unmount();
  });

  it('fires onCrosshairMove on setCrosshair, with null once cleared', async () => {
    const onCrosshairMove = vi.fn();
    let chart: ChartInstance | null = null;
    const { unmount } = render(DeclarativeCallbacksHarness, {
      candlestickData,
      onCrosshairMove,
      onReady: (c: ChartInstance) => {
        chart = c;
      },
    });
    await settle();

    chart!.setCrosshair({ time: 2, y: 100 });
    await settle();
    expect(onCrosshairMove).toHaveBeenCalled();
    expect(onCrosshairMove.mock.calls.at(-1)?.[0]).not.toBeNull();

    chart!.setCrosshair(null);
    await settle();
    expect(onCrosshairMove.mock.calls.at(-1)?.[0]).toBeNull();

    unmount();
  });

  it('fires onVisibleRangeChange and applies a controlled visibleRange prop', async () => {
    const onVisibleRangeChange = vi.fn();
    let chart: ChartInstance | null = null;
    const { unmount, rerender } = render(DeclarativeCallbacksHarness, {
      candlestickData,
      onVisibleRangeChange,
      // `{from,to}` requires at least a 2-bar span — the data interval here is 1.
      visibleRange: { from: 1, to: 3 },
      onReady: (c: ChartInstance) => {
        chart = c;
      },
    });
    await settle();

    expect(chart).not.toBeNull();
    expect(chart!.getVisibleRange()).toEqual({ from: 1, to: 3 });

    onVisibleRangeChange.mockClear();
    await rerender({ candlestickData, onVisibleRangeChange, visibleRange: { from: 2, to: 4 } });
    await settle();
    expect(chart!.getVisibleRange()).toEqual({ from: 2, to: 4 });
    expect(onVisibleRangeChange).toHaveBeenCalled();

    unmount();
  });
});

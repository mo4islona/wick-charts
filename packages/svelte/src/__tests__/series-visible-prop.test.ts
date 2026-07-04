import { render } from '@testing-library/svelte';
import type { ChartInstance } from '@wick-charts/core';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import SeriesVisibleHarness from './SeriesVisibleHarness.svelte';

/**
 * `visible` on a series component maps to `chart.setSeriesVisible` — hides
 * the series without unmounting it, live-updatable across renders. Mirrors
 * the React/Vue `series-visible-prop.test` suites.
 */

const lineData = [
  [
    { time: 1, value: 10 },
    { time: 2, value: 40 },
  ],
];
const candlestickData = [
  { time: 1, open: 10, high: 15, low: 8, close: 12 },
  { time: 2, open: 12, high: 18, low: 11, close: 16 },
];
const heatmapData = [
  { x: 'a', y: '1', value: 5 },
  { x: 'b', y: '1', value: 9 },
];
const pieData = [
  { label: 'a', value: 5 },
  { label: 'b', value: 9 },
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

describe('Svelte series `visible` prop', () => {
  let restoreSize: () => void;

  beforeEach(() => {
    restoreSize = installSizePatch();
  });

  afterEach(() => {
    restoreSize();
  });

  it('LineSeries: defaults to visible, visible=false hides it, a later visible=true restores it', async () => {
    let chart: ChartInstance | null = null;
    const { unmount, rerender } = render(SeriesVisibleHarness, {
      kind: 'line',
      lineData,
      onReady: (c: ChartInstance) => {
        chart = c;
      },
    });
    await settle();
    expect(chart!.isSeriesVisible('s')).toBe(true);

    await rerender({ kind: 'line', lineData, visible: false });
    await settle();
    expect(chart!.isSeriesVisible('s')).toBe(false);

    await rerender({ kind: 'line', lineData, visible: true });
    await settle();
    expect(chart!.isSeriesVisible('s')).toBe(true);

    unmount();
  });

  it('CandlestickSeries: visible=false hides it', async () => {
    let chart: ChartInstance | null = null;
    const { unmount } = render(SeriesVisibleHarness, {
      kind: 'candlestick',
      candlestickData,
      visible: false,
      onReady: (c: ChartInstance) => {
        chart = c;
      },
    });
    await settle();
    expect(chart!.isSeriesVisible('s')).toBe(false);
    unmount();
  });

  it('HeatmapSeries: visible=false hides it', async () => {
    let chart: ChartInstance | null = null;
    const { unmount } = render(SeriesVisibleHarness, {
      kind: 'heatmap',
      heatmapData,
      visible: false,
      onReady: (c: ChartInstance) => {
        chart = c;
      },
    });
    await settle();
    expect(chart!.isSeriesVisible('s')).toBe(false);
    unmount();
  });

  it('PieSeries: visible=false hides it', async () => {
    let chart: ChartInstance | null = null;
    const { unmount } = render(SeriesVisibleHarness, {
      kind: 'pie',
      pieData,
      visible: false,
      onReady: (c: ChartInstance) => {
        chart = c;
      },
    });
    await settle();
    expect(chart!.isSeriesVisible('s')).toBe(false);
    unmount();
  });
});

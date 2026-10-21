import { render } from '@testing-library/svelte';
import { type ChartInstance, computeTooltipPosition } from '@wick-charts/core';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { MockResizeObserver } from '../../../react/test-setup';
import TooltipParityHarness from './TooltipParityHarness.svelte';

/**
 * Parity regression tests for the Svelte `Tooltip` / `InfoBar` —
 * mirrors the behaviors React enforces:
 *   1. Not stuck empty when mounted *before* sibling series (seriesChange
 *      catch-up).
 *   2. Expand multi-layer series into per-layer rows via
 *      `chart.getLayerSnapshots()`.
 */

const candlestickData = [
  { time: 1, open: 1, high: 2, low: 1, close: 2 },
  { time: 2, open: 2, high: 3, low: 2, close: 3 },
  { time: 3, open: 3, high: 4, low: 3, close: 4 },
];

const bandData = [
  { time: 1, low: 10, high: 20 },
  { time: 2, low: 12, high: 18 },
  { time: 3, low: 11, high: 22 },
];

const twoLayerBars = [
  [
    { time: 1, value: 10 },
    { time: 2, value: 20 },
  ],
  [
    { time: 1, value: 5 },
    { time: 2, value: 15 },
  ],
];

async function settle(): Promise<void> {
  for (let i = 0; i < 8; i++) {
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
  // Capture descriptors for *both* patched properties so the cleanup fully
  // restores the prototype — otherwise a leaked clientHeight getter causes
  // order-dependent failures in later tests.
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

/** Gives every `[data-chart-tooltip]` box a layout size; jsdom has no layout. */
function stubTooltipBox(width: number, height: number): () => void {
  const proto = HTMLElement.prototype;
  const widthDesc = Object.getOwnPropertyDescriptor(proto, 'offsetWidth');
  const heightDesc = Object.getOwnPropertyDescriptor(proto, 'offsetHeight');
  const sized = (el: HTMLElement, size: number) => (el.hasAttribute('data-chart-tooltip') ? size : 0);
  Object.defineProperty(proto, 'offsetWidth', {
    configurable: true,
    get(this: HTMLElement) {
      return sized(this, width);
    },
  });
  Object.defineProperty(proto, 'offsetHeight', {
    configurable: true,
    get(this: HTMLElement) {
      return sized(this, height);
    },
  });

  return () => {
    if (widthDesc) Object.defineProperty(proto, 'offsetWidth', widthDesc);
    if (heightDesc) Object.defineProperty(proto, 'offsetHeight', heightDesc);
  };
}

describe('Svelte <Tooltip> / <InfoBar> parity', () => {
  let restore: () => void;

  beforeEach(() => {
    restore = installSizePatch();
  });

  afterEach(() => {
    restore();
  });

  it('<InfoBar> renders series data even when mounted before the series (seriesChange catch-up)', async () => {
    const { unmount } = render(TooltipParityHarness, {
      props: { variant: 'ordered-legend', candlestickData },
    });
    await settle();

    // Portal action moves the info bar into the anchor DIV inside
    // ChartContainer; testing-library's `container` may not surface the
    // post-teleport DOM reliably. Query document.body to be safe.
    const bar = document.body.querySelector('[data-tooltip-legend]') as HTMLElement | null;
    expect(bar, 'InfoBar should render its info row').not.toBeNull();
    expect(bar?.textContent ?? '').toMatch(/O.*H.*L.*C/);

    unmount();
  });

  it('<InfoBar> expands multi-layer BarSeries into per-layer rows', async () => {
    const { unmount } = render(TooltipParityHarness, {
      props: { variant: 'layered-legend', barData: twoLayerBars },
    });
    await settle();

    const bar = document.body.querySelector('[data-tooltip-legend]');
    expect(bar).not.toBeNull();
    const bubbles = bar!.querySelectorAll('span[style*="inline-flex"]');
    expect(bubbles.length).toBe(twoLayerBars.length);

    unmount();
  });

  it('<InfoBar> renders sub-cent OHLC values with enough precision', async () => {
    const satoshi = 0.00001234;
    const data = [
      { time: 1, open: satoshi, high: satoshi * 1.5, low: satoshi * 0.8, close: satoshi * 1.2 },
      { time: 2, open: satoshi * 1.2, high: satoshi * 2, low: satoshi, close: satoshi * 1.8 },
    ];
    const { unmount } = render(TooltipParityHarness, {
      props: { variant: 'precision-legend', candlestickData: data },
    });
    await settle();

    const bar = document.body.querySelector('[data-tooltip-legend]') as HTMLElement | null;
    expect(bar).not.toBeNull();
    const text = bar?.textContent ?? '';
    // Not collapsed to "0.00" — the significant digits of 0.00001234 come through.
    expect(text).toMatch(/1234|0000123/);

    unmount();
  });

  it('<InfoBar> custom `format` prop overrides rendered values', async () => {
    const lineData = [
      [
        { time: 1, value: 42 },
        { time: 2, value: 84 },
      ],
    ];
    const { unmount } = render(TooltipParityHarness, {
      props: { variant: 'custom-format-legend', lineData },
    });
    await settle();

    const bar = document.body.querySelector('[data-tooltip-legend]') as HTMLElement | null;
    expect(bar).not.toBeNull();
    expect(bar?.textContent ?? '').toMatch(/<value:\d+>/);

    unmount();
  });

  it('<InfoBar> renders a band as a square swatch + `low – high`', async () => {
    const { unmount } = render(TooltipParityHarness, {
      props: { variant: 'band-legend', bandData },
    });
    await settle();

    const bar = document.body.querySelector('[data-tooltip-legend]') as HTMLElement | null;
    expect(bar).not.toBeNull();
    expect(bar?.textContent ?? '').toMatch(/<low:\d+>\s*–\s*<high:\d+>/);
    expect(bar?.textContent ?? '').not.toContain('<value:');

    const swatch = bar?.querySelector<HTMLElement>('span[style*="width: 6px"]');
    expect(swatch?.style.borderRadius).toBe('1px');

    unmount();
  });

  it('<Tooltip> renders a band row (square swatch + label + `low – high`) on hover', async () => {
    const captured: { chart: ChartInstance | null } = { chart: null };
    const { container, unmount } = render(TooltipParityHarness, {
      props: {
        variant: 'band-tooltip',
        bandData,
        onChart: (c: ChartInstance) => {
          captured.chart = c;
        },
      },
    });
    await settle();
    if (!captured.chart) throw new Error('probe did not run');

    captured.chart.setCrosshair({ time: 2, y: 15 });
    await settle();

    const text = container.textContent ?? '';
    expect(text).toContain('Range');
    expect(text).toMatch(/<low:12>\s*–\s*<high:18>/);
    expect(text).not.toContain('<value:');

    const swatch = container.querySelector<HTMLElement>('span[style*="width: 8px"][style*="height: 8px"]');
    expect(swatch?.style.borderRadius).toBe('2px');

    unmount();
  });

  it('<Tooltip> declared before series mounts cleanly (seriesChange handler wired up)', async () => {
    const { container, unmount } = render(TooltipParityHarness, {
      props: { variant: 'ordered-tooltip', candlestickData },
    });
    await settle();

    const canvases = container.querySelectorAll('canvas');
    expect(canvases.length).toBeGreaterThanOrEqual(2);
    unmount();
  });

  it('<Tooltip> heads daily data with the date once, at the interval of the data that landed after mount', async () => {
    const day = 86_400_000;
    const start = Date.UTC(2022, 8, 7);
    const lineData = [[0, 1, 2, 3].map((i) => ({ time: start + i * day, value: i + 1 }))];
    let chart: ChartInstance | null = null;
    const { container, unmount } = render(TooltipParityHarness, {
      props: {
        variant: 'line-tooltip',
        lineData,
        onChart: (c: ChartInstance) => {
          chart = c;
        },
      },
    });
    await settle();

    const c = chart as ChartInstance | null;
    c?.setTimeZone('UTC');
    c?.setCrosshair({ time: start + day + 3 * 3_600_000, y: 2 });
    await settle();

    const header = Array.from(container.querySelectorAll('div')).find((el) => el.textContent?.trim() === 'Sep 8, 2022');
    expect(header).toBeDefined();
    unmount();
  });

  it('<Tooltip> sizes the box to its content and keeps it inside the plot by its measured size', async () => {
    const restoreBox = stubTooltipBox(300, 60);
    const lineData = [Array.from({ length: 20 }, (_, i) => ({ time: i + 1, value: 10 + i }))];
    let chart: ChartInstance | null = null;
    const { container, unmount } = render(TooltipParityHarness, {
      props: {
        variant: 'line-tooltip',
        lineData,
        onChart: (c: ChartInstance) => {
          chart = c;
        },
      },
    });

    try {
      await settle();
      const c = chart as ChartInstance | null;
      if (!c) throw new Error('probe did not run');

      const chartWidth = c.getLayout().chartArea.width;
      // Room on the right for the 160 px estimate, not for the 300 px box.
      c.setCrosshair({ time: c.timeScale.xToTime(chartWidth - 200), y: 15 });
      await settle();

      const tooltip = container.querySelector<HTMLElement>('[data-chart-tooltip]');
      const crosshair = c.getCrosshairPosition();
      if (!tooltip || !crosshair) throw new Error('tooltip did not render');

      const expected = computeTooltipPosition({
        x: crosshair.mediaX,
        y: crosshair.mediaY,
        chartLeft: c.plotLeft,
        chartWidth,
        chartHeight: c.getMediaSize().height - c.xAxisHeight,
        tooltipWidth: 300,
        tooltipHeight: 60,
      });

      expect(tooltip.style.width).toBe('max-content');
      expect(tooltip.style.maxWidth).toBe(`${chartWidth}px`);
      expect(Number.parseFloat(tooltip.style.left)).toBe(expected.left);
      expect(Number.parseFloat(tooltip.style.top)).toBe(expected.top);
    } finally {
      unmount();
      restoreBox();
    }
  });

  it('<Tooltip> keeps a custom slot box inside the plot near the right edge by its border-box size', async () => {
    const restoreBox = stubTooltipBox(300, 60);
    const lineData = [Array.from({ length: 20 }, (_, i) => ({ time: i + 1, value: 10 + i }))];
    let chart: ChartInstance | null = null;
    const { container, unmount } = render(TooltipParityHarness, {
      props: {
        variant: 'slot-tooltip',
        lineData,
        onChart: (c: ChartInstance) => {
          chart = c;
        },
      },
    });

    try {
      await settle();
      const c = chart as ChartInstance | null;
      if (!c) throw new Error('probe did not run');

      const chartWidth = c.getLayout().chartArea.width;
      const chartObservers = new Set(MockResizeObserver.callbacks);
      // Room on the right for the 270 px content box, not for the 300 px border box.
      c.setCrosshair({ time: c.timeScale.xToTime(chartWidth - 300), y: 15 });
      await settle();

      const tooltip = container.querySelector<HTMLElement>('[data-chart-tooltip]');
      const crosshair = c.getCrosshairPosition();
      if (!tooltip || !crosshair) throw new Error('tooltip did not render');

      // A browser reports the content box: 300 × 60 less the 14/10 px padding and 1 px border.
      const contentBox = { target: tooltip, contentRect: { width: 270, height: 38 } } as unknown as ResizeObserverEntry;
      for (const cb of MockResizeObserver.callbacks) {
        if (!chartObservers.has(cb)) cb([contentBox], {} as ResizeObserver);
      }
      await settle();

      const expected = computeTooltipPosition({
        x: crosshair.mediaX,
        y: crosshair.mediaY,
        chartLeft: c.plotLeft,
        chartWidth,
        chartHeight: c.getMediaSize().height - c.xAxisHeight,
        tooltipWidth: 300,
        tooltipHeight: 60,
      });

      expect(tooltip.style.visibility).toBe('visible');
      expect(Number.parseFloat(tooltip.style.left) + 300).toBeLessThanOrEqual(c.plotLeft + chartWidth);
      expect(Number.parseFloat(tooltip.style.left)).toBe(expected.left);
      expect(Number.parseFloat(tooltip.style.top)).toBe(expected.top);
    } finally {
      unmount();
      restoreBox();
    }
  });
});

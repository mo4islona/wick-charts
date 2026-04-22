import { render } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

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

  it('<Tooltip> declared before series mounts cleanly (seriesChange handler wired up)', async () => {
    const { container, unmount } = render(TooltipParityHarness, {
      props: { variant: 'ordered-tooltip', candlestickData },
    });
    await settle();

    const canvases = container.querySelectorAll('canvas');
    expect(canvases.length).toBeGreaterThanOrEqual(2);
    unmount();
  });
});

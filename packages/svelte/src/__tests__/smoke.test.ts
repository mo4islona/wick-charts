import { render } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import SmokeHarness from './SmokeHarness.svelte';

/**
 * Svelte wrapper smoke tests — mount each series type via a shared harness
 * component, confirm canvas draws land through the recording context, and
 * unmount tears everything down.
 *
 * Runs under jsdom (see vitest.config.ts `environmentMatchGlobs`). The Svelte
 * plugin must emit client-side output for `onMount` to fire — vitest config
 * sets `conditions: ['browser', ...]` + `ssr.noExternal: ['svelte']` to force
 * the DOM build.
 */

const candlestickData = [
  { time: 1, open: 1, high: 2, low: 1, close: 2 },
  { time: 2, open: 2, high: 3, low: 2, close: 3 },
  { time: 3, open: 3, high: 4, low: 3, close: 4 },
];

const lineData = [[
  { time: 1, value: 10 },
  { time: 2, value: 20 },
  { time: 3, value: 30 },
]];

const barData = [[
  { time: 1, value: 5 },
  { time: 2, value: 15 },
  { time: 3, value: 25 },
]];

const pieData = [
  { label: 'A', value: 30 },
  { label: 'B', value: 70 },
];

async function settle(): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await tick();
    await new Promise((r) => requestAnimationFrame(() => r(undefined)));
  }
}

/**
 * @testing-library/svelte auto-appends a container div inside document.body
 * and renders there. CanvasManager reads `container.clientWidth/Height`, so
 * patch `HTMLDivElement.prototype.getBoundingClientRect` + clientWidth/Height
 * on every div while tests run.
 */
function installSizePatch(width = 800, height = 400): () => void {
  const origRect = HTMLDivElement.prototype.getBoundingClientRect;
  HTMLDivElement.prototype.getBoundingClientRect = function patched() {
    const r = origRect.call(this);
    if (r.width > 0 && r.height > 0) return r;
    return { x: 0, y: 0, top: 0, left: 0, bottom: height, right: width, width, height, toJSON: () => ({}) } as DOMRect;
  };
  const patchEl = (el: HTMLElement) => {
    Object.defineProperty(el, 'clientWidth', { value: width, configurable: true });
    Object.defineProperty(el, 'clientHeight', { value: height, configurable: true });
  };
  const observer = new MutationObserver((records) => {
    for (const rec of records) {
      for (const node of rec.addedNodes) {
        if (node instanceof HTMLElement) {
          patchEl(node);
          for (const child of node.querySelectorAll('div')) patchEl(child as HTMLElement);
        }
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  return () => {
    HTMLDivElement.prototype.getBoundingClientRect = origRect;
    observer.disconnect();
  };
}

describe('Svelte wrapper smoke', () => {
  let restoreSize: () => void;

  beforeEach(() => {
    restoreSize = installSizePatch();
  });

  afterEach(() => {
    restoreSize();
  });

  it('mounts ChartContainer + CandlestickSeries and records fillRect draws', async () => {
    const result = render(SmokeHarness, { variant: 'candlestick', candlestickData });
    await settle();

    const canvases = result.container.querySelectorAll('canvas');
    expect(canvases.length).toBeGreaterThanOrEqual(2);
    const main = canvases[0] as HTMLCanvasElement;
    main.getContext('2d');
    expect(main.__spy!.countOf('fillRect')).toBeGreaterThan(0);
    result.unmount();
  });

  it('mounts LineSeries and draws lineTo primitives', async () => {
    const result = render(SmokeHarness, { variant: 'line', lineData });
    await settle();

    const main = result.container.querySelectorAll('canvas')[0] as HTMLCanvasElement;
    main.getContext('2d');
    expect(main.__spy!.countOf('lineTo')).toBeGreaterThan(0);
    result.unmount();
  });

  it('mounts BarSeries and draws bars', async () => {
    const result = render(SmokeHarness, { variant: 'bar', barData });
    await settle();

    const main = result.container.querySelectorAll('canvas')[0] as HTMLCanvasElement;
    main.getContext('2d');
    expect(main.__spy!.countOf('fillRect')).toBeGreaterThanOrEqual(barData[0].length);
    result.unmount();
  });

  it('mounts PieSeries and draws arc primitives per slice', async () => {
    const result = render(SmokeHarness, { variant: 'pie', pieData });
    await settle();

    const main = result.container.querySelectorAll('canvas')[0] as HTMLCanvasElement;
    main.getContext('2d');
    expect(main.__spy!.countOf('arc')).toBeGreaterThanOrEqual(pieData.length);
    result.unmount();
  });

  it('reactive data swap via component.$set() propagates to the chart', async () => {
    const result = render(SmokeHarness, { variant: 'line', lineData });
    await settle();
    const main = result.container.querySelectorAll('canvas')[0] as HTMLCanvasElement;
    main.getContext('2d');
    const before = main.__spy!.countOf('lineTo');

    await result.component.$set({
      lineData: [[
        { time: 1, value: 100 },
        { time: 2, value: 200 },
        { time: 3, value: 300 },
        { time: 4, value: 400 },
      ]],
    });
    await settle();

    expect(main.__spy!.countOf('lineTo')).toBeGreaterThan(before);
    result.unmount();
  });

  it('unmount removes both canvases from the DOM', async () => {
    const result = render(SmokeHarness, { variant: 'candlestick', candlestickData });
    await settle();
    expect(result.container.querySelectorAll('canvas').length).toBeGreaterThanOrEqual(2);

    result.unmount();
    expect(result.container.querySelectorAll('canvas').length).toBe(0);
  });
});

import { render } from '@testing-library/svelte';
import { ChartInstance } from '@wick-charts/core';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import AnimationsHarness from './AnimationsHarness.svelte';

/**
 * Regression: `animations` used to tear down + rebuild the whole chart on
 * every reference change, even when the resolved values were identical (the
 * "most dangerous trap in the API", per CUSTOMIZATION.md). A `deepEqual`
 * guard on the reactive rebuild block now skips the rebuild for a same-value
 * object; only a genuine value change still tears down and rebuilds.
 */

const candlestickData = [
  { time: 1, open: 1, high: 2, low: 1, close: 2 },
  { time: 2, open: 2, high: 3, low: 2, close: 3 },
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

describe('Svelte <ChartContainer> animations deep-diff (not teardown-per-render)', () => {
  let restoreSize: () => void;

  beforeEach(() => {
    restoreSize = installSizePatch();
  });

  afterEach(() => {
    restoreSize();
    vi.restoreAllMocks();
  });

  it('does not rebuild the chart when a same-value animations literal is passed again', async () => {
    const destroySpy = vi.spyOn(ChartInstance.prototype, 'destroy');
    const result = render(AnimationsHarness, {
      candlestickData,
      animations: { axis: { y: { settle: 300 } } },
    });
    await settle();
    expect(destroySpy).not.toHaveBeenCalled();

    // A brand-new object literal, same values — must NOT trigger a rebuild.
    await result.rerender({ candlestickData, animations: { axis: { y: { settle: 300 } } } });
    await settle();
    expect(destroySpy).not.toHaveBeenCalled();
  });

  it('still rebuilds the chart when animations values genuinely change', async () => {
    const destroySpy = vi.spyOn(ChartInstance.prototype, 'destroy');
    const result = render(AnimationsHarness, {
      candlestickData,
      animations: { axis: { y: { settle: 300 } } },
    });
    await settle();
    expect(destroySpy).not.toHaveBeenCalled();

    await result.rerender({ candlestickData, animations: { axis: { y: { settle: 600 } } } });
    await settle();
    expect(destroySpy).toHaveBeenCalledTimes(1);
  });
});

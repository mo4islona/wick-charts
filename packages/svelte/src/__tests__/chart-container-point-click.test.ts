import { render } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import PointClickHarness from './PointClickHarness.svelte';

/**
 * Plumbing check: the declarative `onPointClick` prop reaches the chart's
 * `pointClick` event. Full hit-test behavior (spatialHit resolution, drag
 * suppression, etc.) is covered once at the core level
 * (packages/core/src/__tests__/chart-point-click.test.ts) — this only
 * proves the Svelte wrapper forwards the event.
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

describe('Svelte <ChartContainer> onPointClick', () => {
  let restoreSize: () => void;

  beforeEach(() => {
    restoreSize = installSizePatch();
  });

  afterEach(() => {
    restoreSize();
  });

  it('forwards a click on the overlay canvas to onPointClick', async () => {
    const onPointClick = vi.fn();
    const result = render(PointClickHarness, { candlestickData, onPointClick });
    await settle();

    const overlay = result.container.querySelectorAll('canvas')[1];
    overlay.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 400, clientY: 200 }));

    expect(onPointClick).toHaveBeenCalledTimes(1);
    expect(onPointClick.mock.calls[0][0].spatialHit).toBeNull();
  });
});

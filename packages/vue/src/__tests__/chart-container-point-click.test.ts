import { mount } from '@vue/test-utils';
import { CandlestickSeries, ChartContainer, catppuccin } from '@wick-charts/vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick } from 'vue';

import { flushAllRaf, installRaf, uninstallRaf } from '../../../react/src/__tests__/helpers/raf';

/**
 * Plumbing check: the declarative `onPointClick` prop reaches the chart's
 * `pointClick` event. Full hit-test behavior (spatialHit resolution, drag
 * suppression, etc.) is covered once at the core level
 * (packages/core/src/__tests__/chart-point-click.test.ts) — this only
 * proves the Vue wrapper forwards the event.
 */

const ohlc = [
  { time: 1, open: 1, high: 2, low: 1, close: 2 },
  { time: 2, open: 2, high: 3, low: 2, close: 3 },
  { time: 3, open: 3, high: 4, low: 3, close: 4 },
];

async function settle(): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await nextTick();
    flushAllRaf();
  }
}

function sizeDescendants(host: HTMLElement, width = 800, height = 400): () => void {
  Object.defineProperty(host, 'clientWidth', { value: width, configurable: true });
  Object.defineProperty(host, 'clientHeight', { value: height, configurable: true });
  host.getBoundingClientRect = () =>
    ({ x: 0, y: 0, top: 0, left: 0, bottom: height, right: width, width, height, toJSON: () => ({}) }) as DOMRect;

  const origRect = HTMLDivElement.prototype.getBoundingClientRect;
  HTMLDivElement.prototype.getBoundingClientRect = function patched() {
    const r = origRect.call(this);
    if (r.width > 0 && r.height > 0) return r;
    if (this === host || host.contains(this)) {
      return {
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        bottom: height,
        right: width,
        width,
        height,
        toJSON: () => ({}),
      } as DOMRect;
    }

    return r;
  };

  return () => {
    HTMLDivElement.prototype.getBoundingClientRect = origRect;
  };
}

describe('Vue <ChartContainer> onPointClick', () => {
  let host: HTMLElement;
  let restore: () => void;

  beforeEach(() => {
    installRaf();
    host = document.createElement('div');
    document.body.appendChild(host);
    restore = sizeDescendants(host);
  });

  afterEach(() => {
    restore();
    host.remove();
    uninstallRaf();
  });

  it('forwards a click on the overlay canvas to onPointClick', async () => {
    const onPointClick = vi.fn();
    const App = defineComponent({
      setup() {
        return () =>
          h(ChartContainer, { theme: catppuccin.theme, onPointClick }, () => [h(CandlestickSeries, { data: ohlc })]);
      },
    });
    const wrapper = mount(App, { attachTo: host });
    await settle();

    const overlay = host.querySelectorAll('canvas')[1];
    overlay.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 400, clientY: 200 }));

    expect(onPointClick).toHaveBeenCalledTimes(1);
    expect(onPointClick.mock.calls[0][0].spatialHit).toBeNull();

    wrapper.unmount();
  });
});

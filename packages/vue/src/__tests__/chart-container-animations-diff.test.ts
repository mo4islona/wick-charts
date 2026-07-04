import { mount } from '@vue/test-utils';
import { ChartInstance } from '@wick-charts/core';
import { CandlestickSeries, ChartContainer, catppuccin } from '@wick-charts/vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick } from 'vue';

import { flushAllRaf, installRaf, uninstallRaf } from '../../../react/src/__tests__/helpers/raf';

/**
 * Regression: `animations` used to tear down + rebuild the whole chart on
 * every reference change, even when the resolved values were identical. A
 * deep-equal guard in the `watch(() => props.animations, ...)` callback now
 * skips the rebuild for a same-value object; only a genuine value change
 * still tears down and rebuilds.
 */

const ohlc = [
  { time: 1, open: 1, high: 2, low: 1, close: 2 },
  { time: 2, open: 2, high: 3, low: 2, close: 3 },
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
  return () => {};
}

const Wrapper = defineComponent({
  props: { animations: { type: Object, required: false, default: undefined } },
  setup(props) {
    return () =>
      h(ChartContainer, { theme: catppuccin.theme, animations: props.animations }, () => [
        h(CandlestickSeries, { data: ohlc }),
      ]);
  },
});

describe('Vue <ChartContainer> animations deep-diff (not teardown-per-render)', () => {
  let host: HTMLElement;

  beforeEach(() => {
    installRaf();
    host = document.createElement('div');
    document.body.appendChild(host);
    sizeDescendants(host);
  });

  afterEach(() => {
    host.remove();
    uninstallRaf();
    vi.restoreAllMocks();
  });

  it('does not rebuild the chart when a same-value animations literal is passed again', async () => {
    const destroySpy = vi.spyOn(ChartInstance.prototype, 'destroy');
    const wrapper = mount(Wrapper, { attachTo: host, props: { animations: { axis: { y: { settle: 300 } } } } });
    await settle();
    expect(destroySpy).not.toHaveBeenCalled();

    // A brand-new object literal, same values — must NOT trigger a rebuild.
    await wrapper.setProps({ animations: { axis: { y: { settle: 300 } } } });
    await settle();
    expect(destroySpy).not.toHaveBeenCalled();

    wrapper.unmount();
  });

  it('still rebuilds the chart when animations values genuinely change', async () => {
    const destroySpy = vi.spyOn(ChartInstance.prototype, 'destroy');
    const wrapper = mount(Wrapper, { attachTo: host, props: { animations: { axis: { y: { settle: 300 } } } } });
    await settle();
    expect(destroySpy).not.toHaveBeenCalled();

    await wrapper.setProps({ animations: { axis: { y: { settle: 600 } } } });
    await settle();
    expect(destroySpy).toHaveBeenCalledTimes(1);

    wrapper.unmount();
  });
});

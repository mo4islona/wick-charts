import { mount } from '@vue/test-utils';
import type { ChartInstance } from '@wick-charts/core';
import { CandlestickSeries, ChartContainer, catppuccin } from '@wick-charts/vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick } from 'vue';

import { flushAllRaf, installRaf, uninstallRaf } from '../../../react/src/__tests__/helpers/raf';

/**
 * Plumbing check: `onReady` / `onVisibleRangeChange` / `onCrosshairMove` and
 * the controlled `visibleRange` prop reach the chart, mirroring the React
 * coverage in chart-container-declarative-callbacks.test.tsx. Full event
 * semantics are covered once at the core level.
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

function sizeDescendants(host: HTMLElement, width = 800, height = 400): void {
  Object.defineProperty(host, 'clientWidth', { value: width, configurable: true });
  Object.defineProperty(host, 'clientHeight', { value: height, configurable: true });
  host.getBoundingClientRect = () =>
    ({ x: 0, y: 0, top: 0, left: 0, bottom: height, right: width, width, height, toJSON: () => ({}) }) as DOMRect;
}

describe('Vue <ChartContainer> onReady / onVisibleRangeChange / onCrosshairMove / visibleRange', () => {
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
  });

  it('fires onReady once at mount with the ChartInstance', async () => {
    const onReady = vi.fn();
    const wrapper = mount(
      defineComponent({
        setup() {
          return () =>
            h(ChartContainer, { theme: catppuccin.theme, onReady }, () => [h(CandlestickSeries, { data: ohlc })]);
        },
      }),
      { attachTo: host },
    );
    await settle();

    expect(onReady).toHaveBeenCalledTimes(1);
    expect(onReady.mock.calls[0][0]).toBeInstanceOf(Object);

    wrapper.unmount();
  });

  it('fires onCrosshairMove on setCrosshair, with null once cleared', async () => {
    const onCrosshairMove = vi.fn();
    let chart: ChartInstance | null = null;
    const wrapper = mount(
      defineComponent({
        setup() {
          return () =>
            h(
              ChartContainer,
              {
                theme: catppuccin.theme,
                onReady: (c: ChartInstance) => {
                  chart = c;
                },
                onCrosshairMove,
              },
              () => [h(CandlestickSeries, { data: ohlc })],
            );
        },
      }),
      { attachTo: host },
    );
    await settle();

    chart!.setCrosshair({ time: 2, y: 100 });
    await settle();
    expect(onCrosshairMove).toHaveBeenCalled();
    expect(onCrosshairMove.mock.calls.at(-1)?.[0]).not.toBeNull();

    chart!.setCrosshair(null);
    await settle();
    expect(onCrosshairMove.mock.calls.at(-1)?.[0]).toBeNull();

    wrapper.unmount();
  });

  it('fires onVisibleRangeChange and applies a controlled visibleRange prop', async () => {
    const onVisibleRangeChange = vi.fn();
    let chart: ChartInstance | null = null;
    const Wrapper = defineComponent({
      props: { visibleRange: { type: Object, required: false, default: undefined } },
      setup(props) {
        return () =>
          h(
            ChartContainer,
            {
              theme: catppuccin.theme,
              onReady: (c: ChartInstance) => {
                chart = c;
              },
              onVisibleRangeChange,
              visibleRange: props.visibleRange,
            },
            () => [h(CandlestickSeries, { data: ohlc })],
          );
      },
    });
    // `{from,to}` requires at least a 2-bar span (core rejects narrower
    // ranges) — the data interval here is 1, so `to - from` must be ≥ 2.
    const wrapper = mount(Wrapper, { attachTo: host, props: { visibleRange: { from: 1, to: 3 } } });
    await settle();

    expect(chart).not.toBeNull();
    expect(chart!.getVisibleRange()).toEqual({ from: 1, to: 3 });

    onVisibleRangeChange.mockClear();
    await wrapper.setProps({ visibleRange: { from: 2, to: 4 } });
    await settle();
    expect(chart!.getVisibleRange()).toEqual({ from: 2, to: 4 });
    expect(onVisibleRangeChange).toHaveBeenCalled();

    wrapper.unmount();
  });
});

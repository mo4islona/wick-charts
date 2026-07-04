import { mount } from '@vue/test-utils';
import type { ChartInstance } from '@wick-charts/core';
import { CandlestickSeries, ChartContainer, HeatmapSeries, LineSeries, PieSeries, catppuccin } from '@wick-charts/vue';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defineComponent, h, nextTick, ref } from 'vue';

import { flushAllRaf, installRaf, uninstallRaf } from '../../../react/src/__tests__/helpers/raf';

/**
 * `visible` on a series component maps to `chart.setSeriesVisible` — hides
 * the series without unmounting it, live-updatable across renders. Mirrors
 * `packages/react/src/__tests__/components/series-visible-prop.test.tsx`.
 */

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

const lineData = [
  [
    { time: 1, value: 10 },
    { time: 2, value: 40 },
  ],
];
const candles = [
  { time: 1, open: 10, high: 15, low: 8, close: 12 },
  { time: 2, open: 12, high: 18, low: 11, close: 16 },
];
const cells = [
  { x: 'a', y: '1', value: 5 },
  { x: 'b', y: '1', value: 9 },
];
const slices = [
  { label: 'a', value: 5 },
  { label: 'b', value: 9 },
];

describe('Vue series `visible` prop', () => {
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

  it('LineSeries: defaults to visible, visible=false hides it, a later visible=true restores it', async () => {
    let chart: ChartInstance | null = null;
    const visible = ref(true);
    const App = defineComponent({
      setup() {
        return () =>
          h(
            ChartContainer,
            {
              theme: catppuccin.theme,
              onReady: (c: ChartInstance) => {
                chart = c;
              },
            },
            () => [h(LineSeries, { id: 'line', data: lineData, visible: visible.value })],
          );
      },
    });
    const wrapper = mount(App, { attachTo: host });
    await settle();
    expect(chart!.isSeriesVisible('line')).toBe(true);

    visible.value = false;
    await settle();
    expect(chart!.isSeriesVisible('line')).toBe(false);

    visible.value = true;
    await settle();
    expect(chart!.isSeriesVisible('line')).toBe(true);

    wrapper.unmount();
  });

  it('CandlestickSeries: visible=false hides it', async () => {
    let chart: ChartInstance | null = null;
    const App = defineComponent({
      setup() {
        return () =>
          h(
            ChartContainer,
            {
              theme: catppuccin.theme,
              onReady: (c: ChartInstance) => {
                chart = c;
              },
            },
            () => [h(CandlestickSeries, { id: 'ohlc', data: candles, visible: false })],
          );
      },
    });
    const wrapper = mount(App, { attachTo: host });
    await settle();
    expect(chart!.isSeriesVisible('ohlc')).toBe(false);
    wrapper.unmount();
  });

  it('HeatmapSeries: visible=false hides it', async () => {
    let chart: ChartInstance | null = null;
    const App = defineComponent({
      setup() {
        return () =>
          h(
            ChartContainer,
            {
              theme: catppuccin.theme,
              onReady: (c: ChartInstance) => {
                chart = c;
              },
            },
            () => [h(HeatmapSeries, { id: 'hm', data: cells, visible: false })],
          );
      },
    });
    const wrapper = mount(App, { attachTo: host });
    await settle();
    expect(chart!.isSeriesVisible('hm')).toBe(false);
    wrapper.unmount();
  });

  it('PieSeries: visible=false hides it', async () => {
    let chart: ChartInstance | null = null;
    const App = defineComponent({
      setup() {
        return () =>
          h(
            ChartContainer,
            {
              theme: catppuccin.theme,
              onReady: (c: ChartInstance) => {
                chart = c;
              },
            },
            () => [h(PieSeries, { id: 'pie', data: slices, visible: false })],
          );
      },
    });
    const wrapper = mount(App, { attachTo: host });
    await settle();
    expect(chart!.isSeriesVisible('pie')).toBe(false);
    wrapper.unmount();
  });
});

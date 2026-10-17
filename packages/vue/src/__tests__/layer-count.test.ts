import { mount } from '@vue/test-utils';
import type { BandData, ChartInstance, MultiLayerData } from '@wick-charts/core';
import { BandSeries, BarSeries, ChartContainer, LineSeries, useChartInstance } from '@wick-charts/vue';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type Component, type Ref, defineComponent, h, nextTick, ref } from 'vue';

import { flushAllRaf, installRaf, uninstallRaf } from '../../../react/src/__tests__/helpers/raf';

/** Line, Bar and Band series follow a change in the number of layers after mount, as in React. */

async function settle(): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await nextTick();
    flushAllRaf();
  }
}

function sizeDescendants(host: HTMLElement, width = 800, height = 400): () => void {
  Object.defineProperty(host, 'clientWidth', { value: width, configurable: true });
  Object.defineProperty(host, 'clientHeight', { value: height, configurable: true });
  const origRect = HTMLDivElement.prototype.getBoundingClientRect;
  HTMLDivElement.prototype.getBoundingClientRect = function patched() {
    const r = origRect.call(this);
    if (r.width > 0 && r.height > 0) return r;
    if (this !== host && !host.contains(this)) return r;

    return { x: 0, y: 0, top: 0, left: 0, bottom: height, right: width, width, height, toJSON: () => ({}) } as DOMRect;
  };

  return () => {
    HTMLDivElement.prototype.getBoundingClientRect = origRect;
  };
}

const layers = [
  {
    label: 'a',
    data: [
      { time: 1, value: 10 },
      { time: 2, value: 20 },
    ],
  },
  {
    label: 'b',
    data: [
      { time: 1, value: 5 },
      { time: 2, value: 15 },
    ],
  },
];

const bands = [
  [
    { time: 1, low: 10, high: 20 },
    { time: 2, low: 12, high: 24 },
  ],
  [
    { time: 1, low: 14, high: 16 },
    { time: 2, low: 16, high: 19 },
  ],
];

describe('Vue series layer count', () => {
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

  function mountSeries(series: Component, data: Ref<MultiLayerData | BandData>) {
    const captured: { chart: ChartInstance | null } = { chart: null };
    const Probe = defineComponent({
      setup() {
        captured.chart = useChartInstance();

        return () => null;
      },
    });
    const App = defineComponent({
      setup: () => () => h(ChartContainer, null, () => [h(Probe), h(series, { id: 's', data: data.value })]),
    });
    const wrapper = mount(App, { attachTo: host });

    const chart = (): ChartInstance => {
      if (!captured.chart) throw new Error('probe did not run');

      return captured.chart;
    };

    return { wrapper, chart };
  }

  for (const [kind, series] of [
    ['line', LineSeries],
    ['bar', BarSeries],
  ] as const) {
    it(`${kind}: layers loaded after mount are all drawn`, async () => {
      const data: Ref<MultiLayerData | BandData> = ref([]);
      const { wrapper, chart } = mountSeries(series, data);
      await settle();

      data.value = layers;
      await settle();

      const snapshots = chart().getLayerSnapshots('s', 2);
      expect(snapshots?.map((l) => [l.layerIndex, l.value])).toEqual([
        [0, 20],
        [1, 15],
      ]);
      expect(chart().getLayerLabel('s', 1)).toBe('b');

      wrapper.unmount();
    });
  }

  it('band: bands loaded after mount are all drawn', async () => {
    const data: Ref<MultiLayerData | BandData> = ref([]);
    const { wrapper, chart } = mountSeries(BandSeries, data);
    await settle();

    data.value = bands;
    await settle();

    const snapshots = chart().getLayerSnapshots('s', 2);
    expect(snapshots?.map((l) => [l.layerIndex, l.low, l.high])).toEqual([
      [0, 12, 24],
      [1, 16, 19],
    ]);

    wrapper.unmount();
  });
});

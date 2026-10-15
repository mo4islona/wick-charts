import { mount } from '@vue/test-utils';
import type { BandPointInput, ChartInstance } from '@wick-charts/core';
import { BandSeries, ChartContainer, catppuccin } from '@wick-charts/vue';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type Ref, defineComponent, h, nextTick, ref } from 'vue';

import { flushAllRaf, installRaf, uninstallRaf } from '../../../react/src/__tests__/helpers/raf';

/**
 * `<BandSeries>` lifecycle: mount registers a band series, the data watcher
 * syncs edges, a nested array maps to one band per layer, and unmount removes
 * the series from the chart.
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

const band: BandPointInput[] = [
  { time: 1, low: 10, high: 20 },
  { time: 2, low: 12, high: 24 },
  { time: 3, low: 11, high: 22 },
];

const twoBands: BandPointInput[][] = [
  band,
  [
    { time: 1, low: 14, high: 16 },
    { time: 2, low: 16, high: 19 },
    { time: 3, low: 15, high: 18 },
  ],
];

let host: HTMLElement;

interface Mounted {
  chart: () => ChartInstance;
  unmount: () => void;
}

function mountBand(props: { data: Ref<BandPointInput[] | BandPointInput[][]>; show?: Ref<boolean> }): Mounted {
  let captured: ChartInstance | null = null;
  const App = defineComponent({
    setup() {
      return () =>
        h(
          ChartContainer,
          {
            theme: catppuccin.theme,
            onReady: (c: ChartInstance) => {
              captured = c;
            },
          },
          () => (props.show?.value === false ? [] : [h(BandSeries, { id: 'band', data: props.data.value })]),
        );
    },
  });
  const wrapper = mount(App, { attachTo: host });

  return {
    chart: () => {
      if (!captured) throw new Error('chart not captured');

      return captured;
    },
    unmount: () => wrapper.unmount(),
  };
}

describe('Vue <BandSeries>', () => {
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

  it('mounts a band series and exposes its edges via getDataAtTime', async () => {
    const view = mountBand({ data: ref(band) });
    await settle();

    expect(view.chart().getSeriesIds()).toContain('band');
    expect(view.chart().getDataAtTime('band', 1)).toMatchObject({ time: 1, low: 10, high: 20 });

    view.unmount();
  });

  it('syncs a data change through the watcher', async () => {
    const data: Ref<BandPointInput[]> = ref(band);
    const view = mountBand({ data });
    await settle();

    data.value = [
      { time: 1, low: 30, high: 50 },
      { time: 2, low: 32, high: 54 },
      { time: 3, low: 31, high: 52 },
    ];
    await settle();

    expect(view.chart().getDataAtTime('band', 1)).toMatchObject({ low: 30, high: 50 });

    view.unmount();
  });

  it('creates one layer per band from BandPointInput[][]', async () => {
    const view = mountBand({ data: ref(twoBands) });
    await settle();

    const layers = view.chart().getLayerSnapshots('band', 1);
    expect(layers?.map((l) => [l.layerIndex, l.low, l.high])).toEqual([
      [0, 10, 20],
      [1, 14, 16],
    ]);

    view.unmount();
  });

  it('removes the series when the component unmounts', async () => {
    const show = ref(true);
    const view = mountBand({ data: ref(band), show });
    await settle();
    expect(view.chart().getSeriesIds()).toContain('band');

    show.value = false;
    await settle();

    expect(view.chart().getSeriesIds()).not.toContain('band');

    view.unmount();
  });
});

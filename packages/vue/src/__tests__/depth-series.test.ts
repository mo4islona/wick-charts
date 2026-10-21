import { mount } from '@vue/test-utils';
import type { ChartInstance, DepthLevel } from '@wick-charts/core';
import { ChartContainer, DepthSeries, catppuccin } from '@wick-charts/vue';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type Ref, defineComponent, h, nextTick, reactive, ref } from 'vue';

import { flushAllRaf, installRaf, uninstallRaf } from '../../../react/src/__tests__/helpers/raf';

/**
 * `<DepthSeries>` lifecycle: mount registers a depth series with the initial
 * book, the watcher re-sends a new book, and unmount removes the series.
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

const BIDS: DepthLevel[] = [
  [99, 1],
  [97, 2],
];
const ASKS: DepthLevel[] = [
  [101, 1],
  [103, 2],
];

let host: HTMLElement;

interface Mounted {
  chart: () => ChartInstance;
  unmount: () => void;
}

function mountDepth(props: { asks: Ref<DepthLevel[]>; show?: Ref<boolean> }): Mounted {
  let captured: ChartInstance | null = null;
  const App = defineComponent({
    setup() {
      return () =>
        h(
          ChartContainer,
          {
            theme: catppuccin.theme,
            axis: { x: { type: 'numeric' } },
            onReady: (c: ChartInstance) => {
              captured = c;
            },
          },
          () =>
            props.show?.value === false ? [] : [h(DepthSeries, { id: 'book', bids: BIDS, asks: props.asks.value })],
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

describe('Vue <DepthSeries>', () => {
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

  it('mounts a depth series with the initial book', async () => {
    const view = mountDepth({ asks: ref(ASKS) });
    await settle();

    expect(view.chart().getSeriesIds()).toContain('book');
    expect(view.chart().getLayerSnapshots('book', 104)?.[0]).toMatchObject({ layerIndex: 1, time: 103, value: 3 });
    expect(view.chart().getLayerSnapshots('book', 98)?.[0]).toMatchObject({ layerIndex: 0, time: 99, value: 1 });

    view.unmount();
  });

  it('re-sends the book when a side changes', async () => {
    const asks = ref(ASKS);
    const view = mountDepth({ asks });
    await settle();

    asks.value = [
      [101, 5],
      [103, 2],
    ];
    await settle();

    expect(view.chart().getLayerSnapshots('book', 104)?.[0]).toMatchObject({ time: 103, value: 7 });

    view.unmount();
  });

  it('removes the series when the component unmounts', async () => {
    const show = ref(true);
    const view = mountDepth({ asks: ref(ASKS), show });
    await settle();
    expect(view.chart().getSeriesIds()).toContain('book');

    show.value = false;
    await settle();

    expect(view.chart().getSeriesIds()).not.toContain('book');

    view.unmount();
  });

  it('re-sends the book after an in-place push or a level replaced on a reactive book', async () => {
    // `DepthLevel` is read-only; the app's own book is a plain mutable array.
    type Level = [price: number, size: number];
    const book = reactive<{ bids: Level[]; asks: Level[] }>({
      bids: BIDS.map(([price, size]): Level => [price, size]),
      asks: ASKS.map(([price, size]): Level => [price, size]),
    });
    let captured: ChartInstance | null = null;
    const App = defineComponent({
      setup() {
        return () =>
          h(
            ChartContainer,
            {
              theme: catppuccin.theme,
              axis: { x: { type: 'numeric' } },
              onReady: (c: ChartInstance) => {
                captured = c;
              },
            },
            () => [h(DepthSeries, { id: 'book', bids: book.bids, asks: book.asks })],
          );
      },
    });
    const wrapper = mount(App, { attachTo: host });
    await settle();
    const chart = captured as ChartInstance | null;
    if (!chart) throw new Error('chart not captured');

    book.asks.push([105, 4]);
    await settle();
    expect(chart.getLayerSnapshots('book', 106)?.[0]).toMatchObject({ time: 105, value: 7 });

    book.asks[0] = [101, 5];
    await settle();
    expect(chart.getLayerSnapshots('book', 104)?.[0]).toMatchObject({ time: 103, value: 7 });

    book.bids[0][1] = 3;
    await settle();
    expect(chart.getLayerSnapshots('book', 98)?.[0]).toMatchObject({ time: 99, value: 3 });

    wrapper.unmount();
  });
});

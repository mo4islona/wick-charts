import { mount } from '@vue/test-utils';
import type { ChartInstance, HistogramData } from '@wick-charts/core';
import { ChartContainer, HistogramSeries, Legend } from '@wick-charts/vue';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type Ref, defineComponent, h, nextTick, reactive, ref } from 'vue';

import { flushAllRaf, installRaf, uninstallRaf } from '../../../react/src/__tests__/helpers/raf';

const STILL = { introMs: 0, entryMs: 0, smoothMs: 0, binWidth: 10 };

async function settle(): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await nextTick();
    flushAllRaf();
  }
}

let host: HTMLElement;

function mountHistogram(data: Ref<HistogramData> | { value: HistogramData }) {
  let captured: ChartInstance | null = null;
  const App = defineComponent({
    setup() {
      return () =>
        h(
          ChartContainer,
          {
            axis: { x: { type: 'numeric' } },
            onReady: (c: ChartInstance) => {
              captured = c;
            },
          },
          () => [h(HistogramSeries, { id: 'h', data: data.value, options: STILL }), h(Legend)],
        );
    },
  });
  const wrapper = mount(App, { attachTo: host });

  return {
    chart: (): ChartInstance => {
      if (!captured) throw new Error('chart not captured');

      return captured;
    },
    unmount: () => wrapper.unmount(),
  };
}

describe('Vue <HistogramSeries>', () => {
  beforeEach(() => {
    installRaf();
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  afterEach(() => {
    host.remove();
    uninstallRaf();
  });

  it('names overlaid layers for <Legend>', async () => {
    const view = mountHistogram(
      ref<HistogramData>([
        { label: 'API', data: [10, 12] },
        { label: 'DB', data: [30] },
      ]),
    );
    await settle();

    expect(view.chart().getLayerLabel('h', 0)).toBe('API');
    expect(host.textContent).toContain('DB');
    view.unmount();
  });

  it('re-bins samples pushed into a reactive array', async () => {
    const samples = reactive([5, 15]);
    const view = mountHistogram({
      get value() {
        return samples;
      },
    });
    await settle();

    samples.push(15, 15);
    await settle();

    expect(view.chart().getDataAtTime('h', 12)).toMatchObject({ count: 3 });
    view.unmount();
  });
});

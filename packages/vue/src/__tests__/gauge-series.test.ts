import { mount } from '@vue/test-utils';
import type { ChartInstance, GaugeZone, PieSliceInput } from '@wick-charts/core';
import { ChartContainer, GaugeSeries, PieLegend, RadialProgressSeries, catppuccin } from '@wick-charts/vue';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type Ref, defineComponent, h, nextTick, ref } from 'vue';

import { flushAllRaf, installRaf, uninstallRaf } from '../../../react/src/__tests__/helpers/raf';

/**
 * `<GaugeSeries>` / `<RadialProgressSeries>` lifecycle: mount registers the
 * series with its first data, a prop change re-sends it, and unmount removes
 * the series. A gauge's color is its value's zone, so it tells which value is set.
 */

async function settle(): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await nextTick();
    flushAllRaf();
  }
}

const ZONES: GaugeZone[] = [
  { to: 50, color: '#00ff00' },
  { to: 100, color: '#ff0000' },
];
const RINGS: PieSliceInput[] = [
  { label: 'CPU', value: 72 },
  { label: 'Disk', value: 31 },
];

let host: HTMLElement;

function mountGauges(props: { value: Ref<number>; rings: Ref<PieSliceInput[]>; show: Ref<boolean> }) {
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
          () =>
            props.show.value
              ? [
                  h(GaugeSeries, { id: 'load', value: props.value.value, options: { zones: ZONES } }),
                  h(RadialProgressSeries, { id: 'rings', data: props.rings.value }),
                  h(PieLegend, { mode: 'percent' }),
                ]
              : [],
        );
    },
  });
  const wrapper = mount(App, { attachTo: host });

  return {
    chart: (): ChartInstance => {
      if (!captured) throw new Error('chart not captured');

      return captured;
    },
    legendText: () => (host.querySelector('[data-chart-pie-legend]')?.textContent ?? '').replace(/\s+/g, ''),
    unmount: () => wrapper.unmount(),
  };
}

describe('Vue <GaugeSeries> / <RadialProgressSeries>', () => {
  beforeEach(() => {
    installRaf();
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  afterEach(() => {
    host.remove();
    uninstallRaf();
  });

  it('mounts both series with their first data, and <PieLegend> lists the rings', async () => {
    const view = mountGauges({ value: ref(30), rings: ref(RINGS), show: ref(true) });
    await settle();

    expect(view.chart().getSeriesIdsByType('gauge')).toEqual(['load']);
    expect(view.chart().getSeriesColor('load')).toBe('#00ff00');
    expect(
      view
        .chart()
        .getSliceInfo('rings')
        ?.map((slice) => slice.percent),
    ).toEqual([72, 31]);
    expect(view.legendText()).toBe('CPU72.0%Disk31.0%');

    view.unmount();
  });

  it('re-sends the value and the rings when the props change', async () => {
    const value = ref(30);
    const rings = ref(RINGS);
    const view = mountGauges({ value, rings, show: ref(true) });
    await settle();

    value.value = 80;
    rings.value = [{ label: 'CPU', value: 10 }];
    await settle();

    expect(view.chart().getSeriesColor('load')).toBe('#ff0000');
    expect(
      view
        .chart()
        .getSliceInfo('rings')
        ?.map((slice) => slice.value),
    ).toEqual([10]);

    view.unmount();
  });

  it('removes the series when the components unmount', async () => {
    const show = ref(true);
    const view = mountGauges({ value: ref(30), rings: ref(RINGS), show });
    await settle();

    show.value = false;
    await settle();

    expect(view.chart().getSeriesIds()).toEqual([]);

    view.unmount();
  });
});

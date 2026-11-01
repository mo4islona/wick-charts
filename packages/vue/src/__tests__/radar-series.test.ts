import { mount } from '@vue/test-utils';
import type { ChartInstance, CrosshairPosition, HoverInfo, RadarLayer, RadarSeriesOptions } from '@wick-charts/core';
import { ChartContainer, Legend, RadarSeries, RadarTooltip, catppuccin } from '@wick-charts/vue';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type Ref, defineComponent, h, nextTick, ref } from 'vue';

import { flushAllRaf, installRaf, uninstallRaf } from '../../../react/src/__tests__/helpers/raf';

/**
 * `<RadarSeries>` lifecycle: mount registers the series with its axes and
 * layers, a prop change re-sends them, and unmount removes the series.
 */

async function settle(): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await nextTick();
    flushAllRaf();
  }
}

const AXES = ['Speed', 'Power', 'Range'];
const LAYERS: RadarLayer[] = [
  { label: 'Alpha', data: [3, 5, 2] },
  { label: 'Beta', data: [4, 1, 5] },
];

let host: HTMLElement;

function mountRadar(props: { data: Ref<RadarLayer[]>; options: Ref<Partial<RadarSeriesOptions>>; show: Ref<boolean> }) {
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
                  h(RadarSeries, { id: 'skills', axes: AXES, data: props.data.value, options: props.options.value }),
                  h(RadarTooltip),
                  h(Legend),
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
    unmount: () => wrapper.unmount(),
  };
}

function layerLabels(chart: ChartInstance): (string | undefined)[] {
  const count = chart.getSeriesLayers('skills')?.length ?? 0;

  return Array.from({ length: count }, (_, i) => chart.getLayerLabel('skills', i));
}

function hover(chart: ChartInstance, info: HoverInfo): void {
  const pos: CrosshairPosition = { time: 0, x: 0, mediaX: 200, mediaY: 200, y: 0 };

  (chart as { getHoverInfo: (id: string) => HoverInfo | null }).getHoverInfo = () => info;
  (chart as { getCrosshairPosition: () => CrosshairPosition | null }).getCrosshairPosition = () => pos;

  type EmitFn = (event: 'crosshairMove', value: CrosshairPosition | null) => void;
  (chart as unknown as { emit: EmitFn }).emit('crosshairMove', pos);
}

describe('Vue <RadarSeries>', () => {
  beforeEach(() => {
    installRaf();
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  afterEach(() => {
    host.remove();
    uninstallRaf();
  });

  it('mounts the series with its axes and layers, and <Legend> lists the layers', async () => {
    const view = mountRadar({ data: ref(LAYERS), options: ref({}), show: ref(true) });
    await settle();

    expect(view.chart().getSeriesIdsByType('radar')).toEqual(['skills']);
    expect(layerLabels(view.chart())).toEqual(['Alpha', 'Beta']);
    expect(host.textContent).toContain('Alpha');
    expect(host.textContent).toContain('Beta');

    view.unmount();
  });

  it('re-sends the layers and the options when the props change', async () => {
    const data = ref(LAYERS);
    const options = ref<Partial<RadarSeriesOptions>>({ colors: ['#111111', '#222222'] });
    const view = mountRadar({ data, options, show: ref(true) });
    await settle();

    expect(view.chart().getSeriesLayers('skills')).toEqual([{ color: '#111111' }, { color: '#222222' }]);

    data.value = [...LAYERS, { label: 'Gamma', data: [1, 1, 1] }];
    options.value = { colors: ['#333333', '#444444', '#555555'] };
    await settle();

    expect(layerLabels(view.chart())).toEqual(['Alpha', 'Beta', 'Gamma']);
    expect(view.chart().getSeriesLayers('skills')).toEqual([
      { color: '#333333' },
      { color: '#444444' },
      { color: '#555555' },
    ]);

    view.unmount();
  });

  it('<RadarTooltip> lists every axis value of the hovered polygon', async () => {
    const view = mountRadar({ data: ref(LAYERS), options: ref({}), show: ref(true) });
    await settle();

    hover(view.chart(), {
      label: 'Hovered polygon',
      value: 0,
      percent: 0,
      color: '#888',
      rows: [
        { label: 'Speed', value: 1234, percent: 50 },
        { label: 'Power', value: null, percent: null },
      ],
    });
    await settle();

    const text = host.textContent ?? '';
    expect(text).toContain('Hovered polygon');
    expect(text).toContain('1.234K');
    expect(text).toContain('—');

    view.unmount();
  });

  it('removes the series when the component unmounts', async () => {
    const show = ref(true);
    const view = mountRadar({ data: ref(LAYERS), options: ref({}), show });
    await settle();

    show.value = false;
    await settle();

    expect(view.chart().getSeriesIds()).toEqual([]);

    view.unmount();
  });
});

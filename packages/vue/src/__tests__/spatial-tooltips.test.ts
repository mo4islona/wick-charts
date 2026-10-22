import { mount } from '@vue/test-utils';
import type { ChartInstance, CrosshairPosition, HoverInfo } from '@wick-charts/core';
import {
  ChartContainer,
  HeatmapSeries,
  HeatmapTooltip,
  PieSeries,
  PieTooltip,
  catppuccin,
  useChartInstance,
} from '@wick-charts/vue';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type Component, defineComponent, h, nextTick } from 'vue';

import { flushAllRaf, installRaf, uninstallRaf } from '../../../react/src/__tests__/helpers/raf';

/**
 * Static data set before mount: the series registers in its own `onMounted`,
 * after the tooltip's first render. Pointer hit-testing does not reach the
 * chart under happy-dom, so the hover is driven through the crosshair getter
 * and `getHoverInfo`, the two values the tooltips read.
 */

async function settle(): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await nextTick();
    flushAllRaf();
  }
}

function sizeHost(host: HTMLElement, width = 400, height = 400): void {
  Object.defineProperty(host, 'clientWidth', { value: width, configurable: true });
  Object.defineProperty(host, 'clientHeight', { value: height, configurable: true });
}

function hover(chart: ChartInstance, info: HoverInfo): string[] {
  const asked: string[] = [];
  const pos: CrosshairPosition = { time: 0, x: 0, mediaX: 200, mediaY: 200, y: 0 };

  (chart as { getHoverInfo: (id: string) => HoverInfo | null }).getHoverInfo = (id) => {
    asked.push(id);

    return info;
  };
  (chart as { getCrosshairPosition: () => CrosshairPosition | null }).getCrosshairPosition = () => pos;

  type EmitFn = (event: 'crosshairMove', value: CrosshairPosition | null) => void;
  (chart as unknown as { emit: EmitFn }).emit('crosshairMove', pos);

  return asked;
}

const info: HoverInfo = { label: 'Hovered cell', value: 42, percent: 50, color: '#888' };

// Module-level, so a parent re-render passes the same arrays and no data watcher fires.
const cells = [{ x: 'c', y: 'r', value: 1 }];
const heatmapOptions = { rows: ['r'], columns: ['c'] };
const slices = [{ label: 'A', value: 1 }];

const cases: Array<{ name: string; series: () => ReturnType<typeof h>; tooltip: Component; id: string }> = [
  {
    name: 'HeatmapTooltip',
    id: 'heat',
    series: () => h(HeatmapSeries, { id: 'heat', data: cells, options: heatmapOptions }),
    tooltip: HeatmapTooltip,
  },
  {
    name: 'PieTooltip',
    id: 'pie',
    series: () => h(PieSeries, { id: 'pie', data: slices }),
    tooltip: PieTooltip,
  },
];

describe('Vue spatial tooltips with static data', () => {
  let host: HTMLElement;

  beforeEach(() => {
    installRaf();
    host = document.createElement('div');
    document.body.appendChild(host);
    sizeHost(host);
  });

  afterEach(() => {
    host.remove();
    uninstallRaf();
  });

  for (const testCase of cases) {
    it(`${testCase.name} finds a series that registered after its first render`, async () => {
      let chart: ChartInstance | null = null;
      const Probe = defineComponent({
        setup() {
          chart = useChartInstance();

          return () => null;
        },
      });
      const App = defineComponent({
        setup: () => () =>
          h(ChartContainer, { theme: catppuccin.theme }, () => [h(Probe), testCase.series(), h(testCase.tooltip)]),
      });

      const wrapper = mount(App, { attachTo: host });
      await settle();
      if (chart === null) throw new Error('chart not captured');

      const asked = hover(chart, info);
      await settle();

      expect(asked).toContain(testCase.id);
      expect(host.textContent).toContain('Hovered cell');

      wrapper.unmount();
    });
  }
});

import { mount } from '@vue/test-utils';
import type { ChartInstance, HoverInfo, SeriesHoverInfo } from '@wick-charts/core';
import { ChartContainer, PieCenter, type PieCenterRenderContext, PieSeries, catppuccin } from '@wick-charts/vue';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defineComponent, h, nextTick } from 'vue';

import { flushAllRaf, installRaf, uninstallRaf } from '../../../react/src/__tests__/helpers/raf';

async function settle(): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await nextTick();
    flushAllRaf();
  }
}

// happy-dom lays nothing out: every div inside the host reports the host size, as in the props test.
function sizeDescendants(host: HTMLElement, width = 400, height = 400): () => void {
  const rect = { x: 0, y: 0, top: 0, left: 0, bottom: height, right: width, width, height, toJSON: () => ({}) };
  Object.defineProperty(host, 'clientWidth', { value: width, configurable: true });
  Object.defineProperty(host, 'clientHeight', { value: height, configurable: true });
  host.getBoundingClientRect = () => rect as DOMRect;

  const origRect = HTMLDivElement.prototype.getBoundingClientRect;
  HTMLDivElement.prototype.getBoundingClientRect = function patched() {
    const r = origRect.call(this);
    if (r.width > 0 && r.height > 0) return r;

    return this === host || host.contains(this) ? (rect as DOMRect) : r;
  };

  return () => {
    HTMLDivElement.prototype.getBoundingClientRect = origRect;
  };
}

// Module-level, so a parent re-render passes the same arrays and no data watcher fires.
const slices = [
  { label: 'A', value: 25 },
  { label: 'B', value: 75 },
];
const donut = { innerRadiusRatio: 0.6, sliceLabels: { mode: 'none' as const } };
const format = (v: number) => `${v} visits`;

describe('Vue <PieCenter>', () => {
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

  function mountPie(center: () => ReturnType<typeof h>, onReady?: (c: ChartInstance) => void) {
    const App = defineComponent({
      setup() {
        return () =>
          h(ChartContainer, { theme: catppuccin.theme, onReady }, () => [
            h(PieSeries, { id: 'pie', data: slices, options: donut }),
            center(),
          ]);
      },
    });

    return mount(App, { attachTo: host });
  }

  it('shows the total and the label in the hole', async () => {
    const wrapper = mountPie(() => h(PieCenter, { label: 'Total sessions', format }));
    await settle();

    const center = host.querySelector('[data-chart-pie-center]');
    expect(center?.textContent).toContain('100 visits');
    expect(center?.textContent).toContain('Total sessions');
    wrapper.unmount();
  });

  it('shows the hovered slice', async () => {
    let chart: ChartInstance | null = null;
    const wrapper = mountPie(
      () => h(PieCenter, { label: 'Total', format }),
      (c) => {
        chart = c;
      },
    );
    await settle();
    if (!chart) throw new Error('no chart');

    const hovered: HoverInfo = { label: 'B', value: 75, percent: 75, color: '#888' };
    const target = chart as ChartInstance;
    (target as { getHoverInfo: (id: string) => HoverInfo | null }).getHoverInfo = () => hovered;
    type EmitFn = (event: 'seriesHover', value: SeriesHoverInfo | null) => void;
    (target as unknown as { emit: EmitFn }).emit('seriesHover', { seriesId: 'pie', index: 1, info: hovered });
    await settle();

    expect(host.querySelector('[data-chart-pie-center]')?.textContent).toContain('B · 75.0%');
    wrapper.unmount();
  });

  it('passes the total and the hole to the default slot', async () => {
    const wrapper = mountPie(() =>
      h(PieCenter, null, {
        default: (ctx: PieCenterRenderContext) =>
          h('span', { 'data-probe': '' }, `${ctx.total}|${ctx.slices.length}|${ctx.hole.innerRadius > 0}`),
      }),
    );
    await settle();

    expect(host.querySelector('[data-probe]')?.textContent).toBe('100|2|true');
    wrapper.unmount();
  });
});

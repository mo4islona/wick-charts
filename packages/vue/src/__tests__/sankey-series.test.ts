import { mount } from '@vue/test-utils';
import type { ChartInstance, SankeyLink, SankeyNode } from '@wick-charts/core';
import { ChartContainer, SankeySeries, catppuccin } from '@wick-charts/vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type Ref, defineComponent, h, nextTick, reactive, ref } from 'vue';

import { flushAllRaf, installRaf, uninstallRaf } from '../../../react/src/__tests__/helpers/raf';

/**
 * `<SankeySeries>` lifecycle: mount registers a sankey series with the initial
 * graph, the watcher re-sends a changed graph, and unmount removes the series.
 * The series color is its first drawn node's, so it tells which nodes are drawn.
 */

async function settle(): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await nextTick();
    flushAllRaf();
  }
}

const NODES: SankeyNode[] = [
  { id: 'a', color: '#ff0000' },
  { id: 'b', color: '#00ff00' },
  { id: 'c', color: '#0000ff' },
];
const B_TO_C: SankeyLink[] = [{ source: 'b', target: 'c', value: 1 }];

let host: HTMLElement;

function mountSankey(props: { links: Ref<SankeyLink[]>; show?: Ref<boolean> }) {
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
            props.show?.value === false
              ? []
              : [h(SankeySeries, { id: 'flow', nodes: NODES, links: props.links.value })],
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

describe('Vue <SankeySeries>', () => {
  beforeEach(() => {
    installRaf();
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  afterEach(() => {
    host.remove();
    uninstallRaf();
  });

  it('mounts a sankey series with the initial graph', async () => {
    const view = mountSankey({ links: ref(B_TO_C) });
    await settle();

    expect(view.chart().getSeriesIdsByType('sankey')).toEqual(['flow']);
    expect(view.chart().getSeriesColor('flow')).toBe('#00ff00');

    view.unmount();
  });

  it('re-sends the graph when the links change', async () => {
    const links = ref(B_TO_C);
    const view = mountSankey({ links });
    await settle();

    links.value = [{ source: 'a', target: 'b', value: 1 }, ...B_TO_C];
    await settle();

    expect(view.chart().getSeriesColor('flow')).toBe('#ff0000');

    view.unmount();
  });

  it('logs a cycle and keeps the previous graph, then takes the next valid one', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const links = ref(B_TO_C);
    const view = mountSankey({ links });

    try {
      await settle();

      links.value = [...B_TO_C, { source: 'c', target: 'b', value: 1 }];
      await settle();

      expect(errors).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('cycle') }));
      expect(view.chart().getSeriesColor('flow')).toBe('#00ff00');

      links.value = [{ source: 'a', target: 'b', value: 1 }, ...B_TO_C];
      await settle();

      expect(view.chart().getSeriesColor('flow')).toBe('#ff0000');
    } finally {
      errors.mockRestore();
      view.unmount();
    }
  });

  it('removes the series when the component unmounts', async () => {
    const show = ref(true);
    const view = mountSankey({ links: ref(B_TO_C), show });
    await settle();
    expect(view.chart().getSeriesIds()).toContain('flow');

    show.value = false;
    await settle();

    expect(view.chart().getSeriesIds()).not.toContain('flow');

    view.unmount();
  });

  it('re-sends the graph after an in-place push on a reactive graph', async () => {
    const graph = reactive<{ links: SankeyLink[] }>({ links: [...B_TO_C] });
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
            () => [h(SankeySeries, { id: 'flow', nodes: NODES, links: graph.links })],
          );
      },
    });
    const wrapper = mount(App, { attachTo: host });
    await settle();
    const chart = captured as ChartInstance | null;
    if (!chart) throw new Error('chart not captured');

    graph.links.push({ source: 'a', target: 'b', value: 1 });
    await settle();

    expect(chart.getSeriesColor('flow')).toBe('#ff0000');

    wrapper.unmount();
  });
});

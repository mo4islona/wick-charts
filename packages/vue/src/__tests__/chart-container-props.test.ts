import { mount } from '@vue/test-utils';
import { ChartInstance } from '@wick-charts/core';
import {
  CandlestickSeries,
  ChartContainer,
  InfoBar,
  Legend,
  LineSeries,
  Title,
  catppuccin,
  useChartInstance,
} from '@wick-charts/vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick } from 'vue';

import { flushAllRaf, installRaf, uninstallRaf } from '../../../react/src/__tests__/helpers/raf';

/**
 * Coverage for the ChartContainer props ported from React for parity:
 * `gradient`, `interactive`, `headerLayout`, `padding`. Mirrors the React
 * suite at packages/react/src/__tests__/components/chart-container-props.test.tsx
 * — same assertions through the Vue surface.
 */

const ohlc = [
  { time: 1, open: 1, high: 2, low: 1, close: 2 },
  { time: 2, open: 2, high: 3, low: 2, close: 3 },
  { time: 3, open: 3, high: 4, low: 3, close: 4 },
];

const lineData = [
  [
    { time: 1, value: 0 },
    { time: 2, value: 100 },
  ],
];

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

describe('Vue <ChartContainer> ported props', () => {
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

  it('gradient=false drops the linear-gradient and falls back to the flat background colour', async () => {
    const App = defineComponent({
      setup() {
        return () =>
          h(ChartContainer, { theme: catppuccin.theme, gradient: false }, () => [h(CandlestickSeries, { data: ohlc })]);
      },
    });
    const wrapper = mount(App, { attachTo: host });
    await settle();

    const root = host.querySelector(':scope > div > div') as HTMLElement;
    expect(root.style.background).not.toContain('linear-gradient');
    wrapper.unmount();
  });

  it('gradient=true (default) keeps the linear-gradient background', async () => {
    const App = defineComponent({
      setup() {
        return () => h(ChartContainer, { theme: catppuccin.theme }, () => [h(CandlestickSeries, { data: ohlc })]);
      },
    });
    const wrapper = mount(App, { attachTo: host });
    await settle();

    const root = host.querySelector(':scope > div > div') as HTMLElement;
    expect(root.style.background).toContain('linear-gradient');
    wrapper.unmount();
  });

  it('interactive is on by default (no prop passed) — InteractionHandler installs the crosshair cursor', async () => {
    // Regression: Vue's type-based `defineProps` casts an absent
    // Boolean-typed prop to `false`, not `undefined` — without an explicit
    // `interactive: true` default in withDefaults(), every chart that didn't
    // pass `:interactive="true"` silently got zero pan/zoom/crosshair/click.
    const App = defineComponent({
      setup() {
        return () => h(ChartContainer, { theme: catppuccin.theme }, () => [h(CandlestickSeries, { data: ohlc })]);
      },
    });
    const wrapper = mount(App, { attachTo: host });
    await settle();

    const overlay = host.querySelectorAll('canvas')[1] as HTMLCanvasElement;
    expect(overlay.style.cursor).toBe('crosshair');

    wrapper.unmount();
  });

  it('interactive=false reaches the underlying ChartInstance constructor', async () => {
    // Read the constructed chart through the public `useChartInstance` bridge
    // and probe `chart.dispatchPanStart`-style behaviour indirectly via
    // `setPadding`: a chart created with `interactive:false` still mounts and
    // accepts subsequent setPadding calls without throwing — i.e. the option
    // flows through without crashing the constructor. Combined with the parity
    // check, this confirms the prop is wired to the same option ChartInstance
    // exposes.
    let probedChart: ChartInstance | null = null;
    const Probe = defineComponent({
      setup() {
        probedChart = useChartInstance();

        return () => null;
      },
    });
    const App = defineComponent({
      setup() {
        return () =>
          h(ChartContainer, { theme: catppuccin.theme, interactive: false }, () => [
            h(CandlestickSeries, { data: ohlc }),
            h(Probe),
          ]);
      },
    });
    const wrapper = mount(App, { attachTo: host });
    await settle();

    expect(probedChart).not.toBeNull();
    // No throw → option was accepted by the constructor.
    expect(() => probedChart!.setPadding({ top: 10 })).not.toThrow();

    wrapper.unmount();
  });

  it('padding.top/bottom widens the Y-range so values clear the chart edges', async () => {
    // Reach the underlying ChartInstance through inject (the public bridge into
    // the chart) instead of poking at <script setup>'s private bindings.
    const captured = { baseline: 0, padded: 0 };
    const Probe = defineComponent({
      setup() {
        const chart = useChartInstance();

        return { chart };
      },
      mounted() {
        const r = (this as unknown as { chart: ChartInstance }).chart.getYRange();
        const span = r.max - r.min;
        // Stash on the host element so the outer test can read it back.
        (this.$el as HTMLElement).dataset.span = String(span);
      },
      render() {
        return h('div');
      },
    });

    const Baseline = defineComponent({
      setup() {
        return () =>
          h(ChartContainer, { theme: catppuccin.theme }, () => [h(LineSeries, { data: lineData }), h(Probe)]);
      },
    });
    const baseline = mount(Baseline, { attachTo: host });
    await settle();
    captured.baseline = Number(host.querySelector('div[data-span]')!.getAttribute('data-span'));
    baseline.unmount();

    const host2 = document.createElement('div');
    document.body.appendChild(host2);
    const restore2 = sizeDescendants(host2);

    const Padded = defineComponent({
      setup() {
        return () =>
          h(ChartContainer, { theme: catppuccin.theme, padding: { top: 80, bottom: 80 } }, () => [
            h(LineSeries, { data: lineData }),
            h(Probe),
          ]);
      },
    });
    const padded = mount(Padded, { attachTo: host2 });
    await settle();
    captured.padded = Number(host2.querySelector('div[data-span]')!.getAttribute('data-span'));
    padded.unmount();
    restore2();
    host2.remove();

    expect(captured.padded).toBeGreaterThan(captured.baseline);
  });

  it('headerLayout="inline" puts Title/InfoBar in a flex sibling above the canvas (not absolute)', async () => {
    const App = defineComponent({
      setup() {
        return () =>
          h(ChartContainer, { theme: catppuccin.theme, headerLayout: 'inline' }, () => [
            h(Title, null, () => 'BTC'),
            h(InfoBar),
            h(CandlestickSeries, { data: ohlc }),
          ]);
      },
    });
    const wrapper = mount(App, { attachTo: host });
    await settle();

    const header = host.querySelector('[data-chart-header]') as HTMLElement | null;
    const overlay = host.querySelector('[data-chart-top-overlay]');
    expect(header).not.toBeNull();
    expect(header!.style.position).not.toBe('absolute');
    expect(overlay).toBeNull();

    wrapper.unmount();
  });

  it('headerLayout="overlay" (default) keeps Title/InfoBar in the absolute top-overlay strip', async () => {
    const App = defineComponent({
      setup() {
        return () =>
          h(ChartContainer, { theme: catppuccin.theme }, () => [
            h(Title, null, () => 'BTC'),
            h(InfoBar),
            h(CandlestickSeries, { data: ohlc }),
          ]);
      },
    });
    const wrapper = mount(App, { attachTo: host });
    await settle();

    const overlay = host.querySelector('[data-chart-top-overlay]') as HTMLElement;
    expect(overlay).not.toBeNull();
    expect(overlay.style.position).toBe('absolute');

    wrapper.unmount();
  });

  it('headerLayout="inline" passes the user-configured padding.top through unchanged (no fold-in)', async () => {
    const setPadding = vi.spyOn(ChartInstance.prototype, 'setPadding');

    const App = defineComponent({
      setup() {
        return () =>
          h(ChartContainer, { theme: catppuccin.theme, headerLayout: 'inline', padding: { top: 20 } }, () => [
            h(Title, null, () => 'BTC'),
            h(InfoBar),
            h(CandlestickSeries, { data: ohlc }),
          ]);
      },
    });
    const wrapper = mount(App, { attachTo: host });
    await settle();

    expect(setPadding.mock.calls.length).toBeGreaterThan(0);
    for (const call of setPadding.mock.calls) {
      expect(call[0]?.top).toBe(20);
    }

    wrapper.unmount();
    setPadding.mockRestore();
  });

  it('the top zone stays off by default even with an overlay header', async () => {
    const setFade = vi.spyOn(ChartInstance.prototype, 'setFade');

    // No `fade` prop at all — the withDefaults(undefined) entry must keep
    // Vue's Boolean cast from turning "absent" into an explicit all-off
    // opt-out; absent means "top off, X on its core default".
    const App = defineComponent({
      setup() {
        return () =>
          h(ChartContainer, { theme: catppuccin.theme }, () => [
            h(Title, null, () => 'BTC'),
            h(InfoBar),
            h(CandlestickSeries, { data: ohlc }),
          ]);
      },
    });
    const wrapper = mount(App, { attachTo: host });
    await settle();

    const calls = setFade.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[calls.length - 1][0]?.top).toBe(0);
    // `right` untouched — the core keeps its under-the-axis default armed.
    expect(calls[calls.length - 1][0]?.right).toBeUndefined();

    wrapper.unmount();
    setFade.mockRestore();
  });

  it('fade=false opts back out under a header', async () => {
    const setFade = vi.spyOn(ChartInstance.prototype, 'setFade');
    const App = defineComponent({
      setup() {
        return () =>
          h(ChartContainer, { theme: catppuccin.theme, fade: false }, () => [
            h(Title, null, () => 'BTC'),
            h(InfoBar),
            h(CandlestickSeries, { data: ohlc }),
          ]);
      },
    });
    const wrapper = mount(App, { attachTo: host });
    await settle();

    const calls = setFade.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[calls.length - 1][0]?.top).toBe(0);

    wrapper.unmount();
    setFade.mockRestore();
  });

  it('fade={top:80} forwards the explicit zone to chart.setFade', async () => {
    const setFade = vi.spyOn(ChartInstance.prototype, 'setFade');
    const App = defineComponent({
      setup() {
        return () =>
          h(ChartContainer, { theme: catppuccin.theme, fade: { top: 80 } }, () => [
            h(CandlestickSeries, { data: ohlc }),
          ]);
      },
    });
    const wrapper = mount(App, { attachTo: host });
    await settle();

    expect(setFade.mock.calls.some((c) => c[0]?.top === 80)).toBe(true);

    wrapper.unmount();
    setFade.mockRestore();
  });

  it('fade=true resolves to the measured header height plus the 24px run-out', async () => {
    const setFade = vi.spyOn(ChartInstance.prototype, 'setFade');

    // The rect patch makes the overlay header strip measure as the full
    // 400px host, so the auto zone must land at 400 + 24.
    const App = defineComponent({
      setup() {
        return () =>
          h(ChartContainer, { theme: catppuccin.theme, fade: true }, () => [
            h(Title, null, () => 'BTC'),
            h(InfoBar),
            h(CandlestickSeries, { data: ohlc }),
          ]);
      },
    });
    const wrapper = mount(App, { attachTo: host });
    await settle();

    const calls = setFade.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[calls.length - 1][0]?.top).toBe(400 + 24);

    wrapper.unmount();
    setFade.mockRestore();
  });

  it('fade overlap releases part of the header padding fold-in', async () => {
    const setPadding = vi.spyOn(ChartInstance.prototype, 'setPadding');

    // The rect patch makes the overlay header measure as the full 400px host
    // — a jsdom artifact, but a deterministic one: without overlap the
    // fold-in lands at 20 + 400, with overlap 12 it must land at 20 + 388.
    const App = defineComponent({
      setup() {
        return () =>
          h(ChartContainer, { theme: catppuccin.theme, fade: { overlap: 12 } }, () => [
            h(Title, null, () => 'BTC'),
            h(InfoBar),
            h(CandlestickSeries, { data: ohlc }),
          ]);
      },
    });
    const wrapper = mount(App, { attachTo: host });
    await settle();

    const tops = setPadding.mock.calls.map((c) => c[0]?.top);
    expect(tops.length).toBeGreaterThan(0);
    expect(tops[tops.length - 1]).toBe(20 + 400 - 12);

    wrapper.unmount();
    setPadding.mockRestore();
  });

  it('headerLayout="overlay" with right-side <Legend> keeps the row layout intact', async () => {
    const App = defineComponent({
      setup() {
        return () =>
          h(ChartContainer, { theme: catppuccin.theme }, () => [
            h(Title, null, () => 'BTC'),
            h(CandlestickSeries, { data: ohlc }),
            h(Legend, { position: 'right' }),
          ]);
      },
    });
    const wrapper = mount(App, { attachTo: host });
    await settle();

    const rightAnchor = host.querySelector('[data-legend-right-anchor]');
    expect(rightAnchor).not.toBeNull();

    wrapper.unmount();
  });
});

import { mount } from '@vue/test-utils';
import { type ChartInstance, type CrosshairPosition, computeTooltipPosition } from '@wick-charts/core';
import {
  BandSeries,
  CandlestickSeries,
  ChartContainer,
  LineSeries,
  Tooltip,
  catppuccin,
  useChartInstance,
} from '@wick-charts/vue';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defineComponent, h, nextTick } from 'vue';

import { flushAllRaf, installRaf, uninstallRaf } from '../../../react/src/__tests__/helpers/raf';
import { MockResizeObserver } from '../../../react/test-setup';

/**
 * `<Tooltip>` is gated on a non-null `useCrosshairPosition()`. Synthetic
 * `mousemove` dispatch doesn't reach the InteractionHandler under happy-dom
 * here (registered listener never fires; verified separately), so we drive the
 * value path through a stable seam instead: monkey-patch
 * `chart.getCrosshairPosition()` (the same source the composable's handler
 * reads) and `emit('crosshairMove', …)` to trip the handler. That way the
 * Vue render path stays under test even though the real InteractionHandler is
 * out of reach in this environment.
 */

async function settle(): Promise<void> {
  for (let i = 0; i < 8; i++) {
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

const lineData = [Array.from({ length: 10 }, (_, i) => ({ time: i + 1, value: i * 10 + 5 }))];

const candlestickData = [
  { time: 1, open: 10, high: 12, low: 9, close: 11 },
  { time: 2, open: 11, high: 13, low: 10, close: 12 },
  { time: 3, open: 12, high: 14, low: 11, close: 13 },
];

const bandData = [
  { time: 1, low: 10, high: 20 },
  { time: 2, low: 12, high: 18 },
  { time: 3, low: 11, high: 22 },
];

interface Captured {
  chart: ChartInstance | null;
}

function probeFor(out: Captured) {
  return defineComponent({
    setup() {
      out.chart = useChartInstance();

      return () => null;
    },
  });
}

/** Force a crosshair position by overriding the chart's getter and re-emitting. */
function forceCrosshair(chart: ChartInstance, pos: CrosshairPosition | null): void {
  // Override the public getter so the composable's `() => chart.getCrosshairPosition()`
  // handler resolves to the supplied value.
  (chart as { getCrosshairPosition: () => CrosshairPosition | null }).getCrosshairPosition = () => pos;
  // Trip the composable's handler by re-emitting at the chart level. The
  // EventEmitter `emit` is `protected` in TS but unrestricted at runtime; the
  // bracket access skips the access modifier.
  type EmitFn = (event: 'crosshairMove', value: CrosshairPosition | null) => void;
  (chart as unknown as { emit: EmitFn }).emit('crosshairMove', pos);
}

/** Gives every `[data-chart-tooltip]` box a layout size; happy-dom has no layout. */
function stubTooltipBox(width: number, height: number): () => void {
  const proto = HTMLElement.prototype;
  const widthDesc = Object.getOwnPropertyDescriptor(proto, 'offsetWidth');
  const heightDesc = Object.getOwnPropertyDescriptor(proto, 'offsetHeight');
  const sized = (el: HTMLElement, size: number) => (el.hasAttribute('data-chart-tooltip') ? size : 0);
  Object.defineProperty(proto, 'offsetWidth', {
    configurable: true,
    get(this: HTMLElement) {
      return sized(this, width);
    },
  });
  Object.defineProperty(proto, 'offsetHeight', {
    configurable: true,
    get(this: HTMLElement) {
      return sized(this, height);
    },
  });

  return () => {
    if (widthDesc) Object.defineProperty(proto, 'offsetWidth', widthDesc);
    if (heightDesc) Object.defineProperty(proto, 'offsetHeight', heightDesc);
  };
}

describe('Vue <Tooltip>', () => {
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

  it('renders nothing when crosshair is null (default state)', async () => {
    const captured: Captured = { chart: null };
    const Probe = probeFor(captured);
    const App = defineComponent({
      setup: () => () =>
        h(ChartContainer, { theme: catppuccin.theme }, () => [h(Probe), h(LineSeries, { data: lineData }), h(Tooltip)]),
    });

    const wrapper = mount(App, { attachTo: host });
    await settle();

    // No tooltip body — both branches (`!hasCustomSlot` and `hasCustomSlot`)
    // are gated on `crosshair && snapshots.length > 0`.
    expect(host.textContent ?? '').not.toMatch(/Open|Close/);

    wrapper.unmount();
  });

  it('renders the default OHLC layout when a candlestick crosshair lands inside the data range', async () => {
    const captured: Captured = { chart: null };
    const Probe = probeFor(captured);
    const App = defineComponent({
      setup: () => () =>
        h(ChartContainer, { theme: catppuccin.theme }, () => [
          h(Probe),
          h(CandlestickSeries, { id: 'cs', data: candlestickData }),
          h(Tooltip),
        ]),
    });

    const wrapper = mount(App, { attachTo: host });
    await settle();
    const chart = captured.chart;
    if (!chart) throw new Error('chart not captured');

    forceCrosshair(chart, { time: 2, x: 2, mediaX: 400, mediaY: 200, y: 12 });
    await settle();

    // The default-slot template renders Open/High/Low/Close labels for OHLC data.
    const text = host.textContent ?? '';
    expect(text).toContain('Open');
    expect(text).toContain('High');
    expect(text).toContain('Low');
    expect(text).toContain('Close');

    wrapper.unmount();
  });

  it('renders the line layout (label + value pill) for non-OHLC snapshots', async () => {
    const captured: Captured = { chart: null };
    const Probe = probeFor(captured);
    const App = defineComponent({
      setup: () => () =>
        h(ChartContainer, { theme: catppuccin.theme }, () => [
          h(Probe),
          h(LineSeries, { id: 'l', data: lineData }),
          h(Tooltip),
        ]),
    });

    const wrapper = mount(App, { attachTo: host });
    await settle();
    const chart = captured.chart;
    if (!chart) throw new Error('chart not captured');

    forceCrosshair(chart, { time: 5, x: 5, mediaX: 400, mediaY: 200, y: 50 });
    await settle();

    // Line layout doesn't print OHLC labels.
    expect(host.textContent ?? '').not.toContain('Open');

    wrapper.unmount();
  });

  it('renders the band layout (square swatch + low – high) for band snapshots', async () => {
    const captured: Captured = { chart: null };
    const Probe = probeFor(captured);
    const App = defineComponent({
      setup: () => () =>
        h(ChartContainer, { theme: catppuccin.theme }, () => [
          h(Probe),
          h(BandSeries, { id: 'b', data: bandData }),
          h(Tooltip, { format: (v: number, field: string) => `<${field}:${v}>` }),
        ]),
    });

    const wrapper = mount(App, { attachTo: host });
    await settle();
    const chart = captured.chart;
    if (!chart) throw new Error('chart not captured');

    forceCrosshair(chart, { time: 2, x: 2, mediaX: 400, mediaY: 200, y: 15 });
    await settle();

    const text = host.textContent ?? '';
    expect(text).toContain('Range');
    expect(text).toMatch(/<low:12>\s*–\s*<high:18>/);
    expect(text).not.toContain('<value:');

    const swatch = host.querySelector<HTMLElement>('span[style*="width: 8px"][style*="height: 8px"]');
    expect(swatch?.style.borderRadius).toBe('2px');

    wrapper.unmount();
  });

  it('forwards `snapshots` and `time` to the default slot when one is provided', async () => {
    const captured: Captured = { chart: null };
    const Probe = probeFor(captured);
    let slotCalls = 0;
    let lastTime = -1;
    const App = defineComponent({
      setup: () => () =>
        h(ChartContainer, { theme: catppuccin.theme }, () => [
          h(Probe),
          h(LineSeries, { id: 'l', data: lineData }),
          h(
            Tooltip,
            {},
            {
              default: ({ time }: { snapshots: unknown[]; time: number }) => {
                slotCalls++;
                lastTime = time;

                return h('div', { 'data-testid': 'custom-tip' }, ['custom']);
              },
            },
          ),
        ]),
    });

    const wrapper = mount(App, { attachTo: host });
    await settle();
    const chart = captured.chart;
    if (!chart) throw new Error('chart not captured');

    forceCrosshair(chart, { time: 3, x: 3, mediaX: 200, mediaY: 100, y: 20 });
    await settle();

    expect(slotCalls).toBeGreaterThan(0);
    expect(lastTime).toBe(3);
    expect(host.querySelector('[data-testid="custom-tip"]')).not.toBeNull();

    wrapper.unmount();
  });

  it('clears the rendered tooltip when crosshair returns to null', async () => {
    const captured: Captured = { chart: null };
    const Probe = probeFor(captured);
    const App = defineComponent({
      setup: () => () =>
        h(ChartContainer, { theme: catppuccin.theme }, () => [
          h(Probe),
          h(LineSeries, { id: 'l', data: lineData }),
          h(Tooltip),
        ]),
    });

    const wrapper = mount(App, { attachTo: host });
    await settle();
    const chart = captured.chart;
    if (!chart) throw new Error('chart not captured');

    forceCrosshair(chart, { time: 5, x: 5, mediaX: 400, mediaY: 200, y: 50 });
    await settle();
    const tooltipDivCount = host.querySelectorAll('div[style*="position: absolute"]').length;
    expect(tooltipDivCount).toBeGreaterThan(0);

    forceCrosshair(chart, null);
    await settle();
    // Tooltip's outer v-if collapses, so the absolutely-positioned tooltip
    // wrapper is gone (the chart's own absolute overlays still exist).
    const after = host.querySelectorAll('div[style*="position: absolute"]').length;
    expect(after).toBeLessThan(tooltipDivCount);

    wrapper.unmount();
  });

  it('positions the tooltip via computeTooltipPosition (clamps to chart bounds)', async () => {
    const captured: Captured = { chart: null };
    const Probe = probeFor(captured);
    const App = defineComponent({
      setup: () => () =>
        h(ChartContainer, { theme: catppuccin.theme }, () => [
          h(Probe),
          h(LineSeries, { id: 'l', data: lineData }),
          h(Tooltip),
        ]),
    });

    const wrapper = mount(App, { attachTo: host });
    await settle();
    const chart = captured.chart;
    if (!chart) throw new Error('chart not captured');

    // Far-right cursor → computeTooltipPosition should clamp `left` so the
    // tooltip never extends past the chart's right edge.
    forceCrosshair(chart, { time: 9, x: 9, mediaX: 790, mediaY: 200, y: 90 });
    await settle();

    // Locate one of the tooltip's outer absolute divs by its position styling.
    const candidates = Array.from(host.querySelectorAll<HTMLDivElement>('div')).filter((el) => {
      const left = el.style.left;
      const top = el.style.top;

      return left.endsWith('px') && top.endsWith('px') && el.style.pointerEvents === 'none';
    });
    expect(candidates.length).toBeGreaterThan(0);

    // Every absolutely-placed tooltip element must have a finite numeric left.
    for (const el of candidates) {
      const left = Number.parseFloat(el.style.left);
      expect(Number.isFinite(left)).toBe(true);
    }

    wrapper.unmount();
  });

  it('sizes the box to a long label and keeps it inside the plot by its measured size', async () => {
    const restoreBox = stubTooltipBox(300, 60);
    const captured: Captured = { chart: null };
    const Probe = probeFor(captured);
    const App = defineComponent({
      setup: () => () =>
        h(ChartContainer, { theme: catppuccin.theme }, () => [
          h(Probe),
          h(LineSeries, { id: 'l', data: [{ label: 'Fri 10 May', data: lineData[0] }] }),
          h(Tooltip),
        ]),
    });

    const wrapper = mount(App, { attachTo: host });
    try {
      await settle();
      const chart = captured.chart;
      if (!chart) throw new Error('chart not captured');

      const chartWidth = chart.getLayout().chartArea.width;
      // Room on the right for the 160 px estimate, not for the 300 px box.
      const pos = { time: 8, x: 8, mediaX: chartWidth - 200, mediaY: 200, y: 75 };
      forceCrosshair(chart, pos);
      await settle();

      const tooltip = host.querySelector<HTMLElement>('[data-chart-tooltip]');
      if (!tooltip) throw new Error('tooltip did not render');

      const expected = computeTooltipPosition({
        x: pos.mediaX,
        y: pos.mediaY,
        chartLeft: chart.plotLeft,
        chartWidth,
        chartHeight: chart.getMediaSize().height - chart.xAxisHeight,
        tooltipWidth: 300,
        tooltipHeight: 60,
      });

      expect(tooltip.textContent).toContain('Fri 10 May');
      expect(tooltip.style.width).toBe('max-content');
      expect(tooltip.style.maxWidth).toBe(`${chartWidth}px`);
      expect(Number.parseFloat(tooltip.style.left)).toBe(expected.left);
      expect(Number.parseFloat(tooltip.style.top)).toBe(expected.top);
    } finally {
      wrapper.unmount();
      restoreBox();
    }
  });

  it('keeps a custom slot box inside the plot near the right edge by its border-box size', async () => {
    const restoreBox = stubTooltipBox(300, 60);
    const captured: Captured = { chart: null };
    const Probe = probeFor(captured);
    const App = defineComponent({
      setup: () => () =>
        h(ChartContainer, { theme: catppuccin.theme }, () => [
          h(Probe),
          h(LineSeries, { id: 'l', data: lineData }),
          h(Tooltip, {}, { default: () => h('div', ['custom']) }),
        ]),
    });

    const wrapper = mount(App, { attachTo: host });
    try {
      await settle();
      const chart = captured.chart;
      if (!chart) throw new Error('chart not captured');

      const chartWidth = chart.getLayout().chartArea.width;
      const chartObservers = new Set(MockResizeObserver.callbacks);
      // Room on the right for the 270 px content box, not for the 300 px border box.
      const pos = { time: 8, x: 8, mediaX: chartWidth - 300, mediaY: 200, y: 75 };
      forceCrosshair(chart, pos);
      await settle();

      const tooltip = host.querySelector<HTMLElement>('[data-chart-tooltip]');
      if (!tooltip) throw new Error('tooltip did not render');

      // A browser reports the content box: 300 × 60 less the 14/10 px padding and 1 px border.
      const contentBox = { target: tooltip, contentRect: { width: 270, height: 38 } } as unknown as ResizeObserverEntry;
      for (const cb of MockResizeObserver.callbacks) {
        if (!chartObservers.has(cb)) cb([contentBox], {} as ResizeObserver);
      }
      await settle();

      const expected = computeTooltipPosition({
        x: pos.mediaX,
        y: pos.mediaY,
        chartLeft: chart.plotLeft,
        chartWidth,
        chartHeight: chart.getMediaSize().height - chart.xAxisHeight,
        tooltipWidth: 300,
        tooltipHeight: 60,
      });

      expect(tooltip.style.visibility).toBe('visible');
      expect(Number.parseFloat(tooltip.style.left) + 300).toBeLessThanOrEqual(chart.plotLeft + chartWidth);
      expect(Number.parseFloat(tooltip.style.left)).toBe(expected.left);
      expect(Number.parseFloat(tooltip.style.top)).toBe(expected.top);
    } finally {
      wrapper.unmount();
      restoreBox();
    }
  });
});

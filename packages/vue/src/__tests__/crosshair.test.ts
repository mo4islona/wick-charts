import { mount } from '@vue/test-utils';
import {
  ChartContainer,
  type ChartInstance,
  Crosshair,
  LineSeries,
  catppuccin,
  oneDarkPro,
  useChartInstance,
} from '@wick-charts/vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick } from 'vue';

import { flushAllRaf, installRaf, uninstallRaf } from '../../../react/src/__tests__/helpers/raf';

/**
 * Vue `<Crosshair>` parity fixes:
 *   - V1: the time pill formats at the axis's *resolved* tick interval
 *     (`timeScale.niceTickValues`), not the raw data interval.
 *   - V2: label colors track a runtime `setTheme` swap (driven off
 *     `overlayChange`) instead of freezing on the first-render snapshot.
 */

const lineData = [Array.from({ length: 30 }, (_, i) => ({ time: i + 1, value: i * 10 + 5 }))];

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

function mountCrosshair(host: HTMLElement): {
  getChart: () => ChartInstance;
  wrapper: ReturnType<typeof mount>;
} {
  // ChartContainer creates the chart in onMounted and only renders its slot
  // once it exists, so the Probe's setup (and `useChartInstance`) runs after a
  // settle — read the chart through a getter, not synchronously at mount.
  let chart: ChartInstance | undefined;
  const Probe = defineComponent({
    setup() {
      chart = useChartInstance();

      return () => null;
    },
  });
  const App = defineComponent({
    setup: () => () =>
      h(ChartContainer, { theme: catppuccin.theme }, () => [
        h(Probe),
        h(LineSeries, { id: 'line-id', data: lineData }),
        h(Crosshair),
      ]),
  });
  const wrapper = mount(App, { attachTo: host });

  return {
    getChart: () => {
      if (!chart) throw new Error('probe did not run');

      return chart;
    },
    wrapper,
  };
}

describe('Vue <Crosshair>', () => {
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
    vi.restoreAllMocks();
  });

  it('formats the time pill at the resolved tick interval, not the raw data interval', async () => {
    const { getChart, wrapper } = mountCrosshair(host);
    await settle();
    const chart = getChart();

    const niceSpy = vi.spyOn(chart.timeScale, 'niceTickValues');
    const dataInterval = chart.getDataInterval();

    chart.setCrosshair({ time: 15, y: 150 });
    await settle();

    // The time pill resolves its granularity through niceTickValues(dataInterval)
    // — a raw-interval pill would never consult the scale.
    expect(niceSpy).toHaveBeenCalledWith(dataInterval);

    wrapper.unmount();
  });

  it('re-resolves the tick interval on every crosshair move (matches React; not frozen on zoom)', async () => {
    const { getChart, wrapper } = mountCrosshair(host);
    await settle();
    const chart = getChart();

    const niceSpy = vi.spyOn(chart.timeScale, 'niceTickValues');

    chart.setCrosshair({ time: 10, y: 100 });
    await settle();
    const afterFirst = niceSpy.mock.calls.length;
    expect(afterFirst).toBeGreaterThan(0);

    // A wheel-zoom re-emits the crosshair; the resolved interval must be
    // recomputed against the live range. The pre-fix computed cached the
    // first-render granularity and never consulted niceTickValues again.
    chart.setCrosshair({ time: 20, y: 100 });
    await settle();
    expect(niceSpy.mock.calls.length).toBeGreaterThan(afterFirst);

    wrapper.unmount();
  });

  it('updates label colors when the theme is swapped at runtime', async () => {
    const { getChart, wrapper } = mountCrosshair(host);
    await settle();
    const chart = getChart();

    chart.setCrosshair({ time: 15, y: 150 });
    await settle();

    // The time pill is the absolutely-positioned label translated by -50% on X.
    // (happy-dom drops the `color-mix(...)` background as an unknown value, so
    // the assertion targets the plain `color` = `labelTextColor`, which survives
    // and differs between presets.)
    const pill = () => wrapper.find('[style*="translateX(-50%)"]');
    expect(pill().exists()).toBe(true);
    const before = pill().attributes('style') ?? '';
    expect(before).toContain(`color: ${catppuccin.theme.crosshair.labelTextColor}`);

    // Guard the test premise — the swap is only observable if the colors differ.
    expect(catppuccin.theme.crosshair.labelTextColor).not.toBe(oneDarkPro.theme.crosshair.labelTextColor);

    chart.setTheme(oneDarkPro.theme);
    await settle();

    const after = pill().attributes('style') ?? '';
    expect(after).not.toBe(before);
    expect(after).toContain(`color: ${oneDarkPro.theme.crosshair.labelTextColor}`);

    wrapper.unmount();
  });
});

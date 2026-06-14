import { mount } from '@vue/test-utils';
import { ChartInstance } from '@wick-charts/core';
import { ChartContainer, LineSeries, TimeRegion, catppuccin } from '@wick-charts/vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick, ref } from 'vue';

/**
 * Parity coverage for the Vue `<TimeRegion>` wrapper: it forwards its props to
 * `chart.addRegion` on mount, `chart.updateRegion` on change, and
 * `chart.removeRegion` on unmount. Asserted via prototype spies (which call
 * through), so no canvas rendering is required.
 */

const lineData = [
  [
    { time: 1, value: 10 },
    { time: 2, value: 30 },
    { time: 3, value: 50 },
  ],
];

describe('<TimeRegion> (vue)', () => {
  let host: HTMLElement;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  afterEach(() => {
    host.remove();
    vi.restoreAllMocks();
  });

  it('registers a region on mount and removes it on unmount', async () => {
    const add = vi.spyOn(ChartInstance.prototype, 'addRegion');
    const remove = vi.spyOn(ChartInstance.prototype, 'removeRegion');

    const App = defineComponent({
      setup() {
        return () =>
          h(
            ChartContainer,
            { theme: catppuccin.theme },
            {
              default: () => [
                h(LineSeries, { id: 'm', data: lineData, options: { pulse: false } }),
                h(TimeRegion, { from: 2, to: 3, fill: 'rgba(240, 85, 106, 0.08)', label: 'window' }),
              ],
            },
          );
      },
    });

    const wrapper = mount(App, { attachTo: host });
    await nextTick();

    expect(add).toHaveBeenCalledWith(
      expect.objectContaining({ from: 2, to: 3, fill: 'rgba(240, 85, 106, 0.08)', label: 'window' }),
    );

    wrapper.unmount();
    expect(remove).toHaveBeenCalled();
  });

  it('updates the region when props change', async () => {
    const update = vi.spyOn(ChartInstance.prototype, 'updateRegion');
    const to = ref<number>(3);

    const App = defineComponent({
      setup() {
        return () =>
          h(
            ChartContainer,
            { theme: catppuccin.theme },
            {
              default: () => [
                h(LineSeries, { id: 'm', data: lineData, options: { pulse: false } }),
                h(TimeRegion, { from: 2, to: to.value }),
              ],
            },
          );
      },
    });

    const wrapper = mount(App, { attachTo: host });
    await nextTick();

    to.value = 5;
    await nextTick();
    await nextTick();

    expect(update).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ to: 5 }));

    wrapper.unmount();
  });
});

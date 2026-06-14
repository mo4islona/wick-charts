import { mount } from '@vue/test-utils';
import { ChartInstance } from '@wick-charts/core';
import { ChartContainer, LineSeries, ReferenceLine, catppuccin } from '@wick-charts/vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick, ref } from 'vue';

/**
 * Parity coverage for the Vue `<ReferenceLine>` wrapper: it forwards its props
 * to `chart.addLine` on mount, `chart.updateLine` on change, and
 * `chart.removeLine` on unmount. Asserted via prototype spies (which call
 * through), so no canvas rendering is required.
 */

const lineData = [
  [
    { time: 1, value: 10 },
    { time: 2, value: 30 },
    { time: 3, value: 50 },
  ],
];

describe('<ReferenceLine> (vue)', () => {
  let host: HTMLElement;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  afterEach(() => {
    host.remove();
    vi.restoreAllMocks();
  });

  it('registers a line on mount and removes it on unmount', async () => {
    const add = vi.spyOn(ChartInstance.prototype, 'addLine');
    const remove = vi.spyOn(ChartInstance.prototype, 'removeLine');

    const App = defineComponent({
      setup() {
        return () =>
          h(
            ChartContainer,
            { theme: catppuccin.theme },
            {
              default: () => [
                h(LineSeries, { id: 'm', data: lineData, options: { pulse: false } }),
                h(ReferenceLine, { value: 40, label: 'alert', color: '#f0556a' }),
              ],
            },
          );
      },
    });

    const wrapper = mount(App, { attachTo: host });
    await nextTick();

    expect(add).toHaveBeenCalledWith(expect.objectContaining({ value: 40, label: 'alert', color: '#f0556a' }));

    wrapper.unmount();
    expect(remove).toHaveBeenCalled();
  });

  it('updates the line when props change', async () => {
    const update = vi.spyOn(ChartInstance.prototype, 'updateLine');
    const value = ref(40);

    const App = defineComponent({
      setup() {
        return () =>
          h(
            ChartContainer,
            { theme: catppuccin.theme },
            {
              default: () => [
                h(LineSeries, { id: 'm', data: lineData, options: { pulse: false } }),
                h(ReferenceLine, { value: value.value }),
              ],
            },
          );
      },
    });

    const wrapper = mount(App, { attachTo: host });
    await nextTick();

    value.value = 20;
    await nextTick();
    await nextTick();

    expect(update).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ value: 20 }));

    wrapper.unmount();
  });
});

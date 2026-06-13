import { mount } from '@vue/test-utils';
import { ChartInstance } from '@wick-charts/core';
import { ChartContainer, LineSeries, Marker, catppuccin } from '@wick-charts/vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick, ref } from 'vue';

/**
 * Parity coverage for the Vue `<Marker>` wrapper: it forwards its props to
 * `chart.addMarker` on mount, `chart.updateMarker` on change, and
 * `chart.removeMarker` on unmount. Asserted via prototype spies (which call
 * through), so no canvas rendering is required.
 */

const lineData = [
  [
    { time: 1, value: 10 },
    { time: 2, value: 30 },
    { time: 3, value: 50 },
  ],
];

describe('<Marker> (vue)', () => {
  let host: HTMLElement;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  afterEach(() => {
    host.remove();
    vi.restoreAllMocks();
  });

  it('registers a marker on mount and removes it on unmount', async () => {
    const add = vi.spyOn(ChartInstance.prototype, 'addMarker');
    const remove = vi.spyOn(ChartInstance.prototype, 'removeMarker');

    const App = defineComponent({
      setup() {
        return () =>
          h(
            ChartContainer,
            { theme: catppuccin.theme },
            {
              default: () => [
                h(LineSeries, { id: 'm', data: lineData, options: { pulse: false } }),
                h(Marker, { time: 3, value: 50, label: 'broke', color: '#f0556a' }),
              ],
            },
          );
      },
    });

    const wrapper = mount(App, { attachTo: host });
    await nextTick();

    expect(add).toHaveBeenCalledWith(expect.objectContaining({ time: 3, value: 50, label: 'broke', color: '#f0556a' }));

    wrapper.unmount();
    expect(remove).toHaveBeenCalled();
  });

  it('updates the marker when props change', async () => {
    const update = vi.spyOn(ChartInstance.prototype, 'updateMarker');
    const value = ref(50);

    const App = defineComponent({
      setup() {
        return () =>
          h(
            ChartContainer,
            { theme: catppuccin.theme },
            {
              default: () => [
                h(LineSeries, { id: 'm', data: lineData, options: { pulse: false } }),
                h(Marker, { time: 3, value: value.value }),
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

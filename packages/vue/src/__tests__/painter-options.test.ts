import { mount } from '@vue/test-utils';
import {
  BarSeries,
  type BarSeriesOptions,
  ChartContainer,
  LineSeries,
  type LineSeriesOptions,
  catppuccin,
} from '@wick-charts/vue';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defineComponent, h, nextTick, ref } from 'vue';

import type { CanvasRecorder } from '../../../core/src/__tests__/helpers/recording-context';
import { flushAllRaf, installRaf, uninstallRaf } from '../../../react/src/__tests__/helpers/raf';

/**
 * PR6 — Vue painter-option propagation. The wrapper deep-watches `props.options`
 * and forwards the whole object to `updateSeriesOptions`, so a reassigned object
 * carrying a new `cornerRadius` / `curve` reaches the renderer with no per-field
 * wiring (unlike React's explicit dep array). These pin that contract.
 */

const twoLayers = [
  [
    { time: 1, value: 40 },
    { time: 2, value: 80 },
    { time: 3, value: 60 },
  ],
  [
    { time: 1, value: 20 },
    { time: 2, value: 30 },
    { time: 3, value: 25 },
  ],
];

const lineData = [
  [
    { time: 1, value: 10 },
    { time: 2, value: 40 },
    { time: 3, value: 20 },
    { time: 4, value: 50 },
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

function mainSpy(host: HTMLElement): CanvasRecorder {
  const main = host.querySelectorAll('canvas')[0] as HTMLCanvasElement | undefined;
  if (!main) throw new Error('main canvas missing');

  main.getContext('2d');
  const spy = main.__spy;
  if (!spy) throw new Error('canvas.__spy missing — is the root test-setup loaded?');

  return spy;
}

describe('Vue painter-option propagation (deep watch)', () => {
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

  it('reassigning options with a new cornerRadius reaches the renderer (0 → 8 starts rounding)', async () => {
    const options = ref<Partial<BarSeriesOptions>>({ cornerRadius: 0 });
    const App = defineComponent({
      setup() {
        return () =>
          h(ChartContainer, { theme: catppuccin.theme }, () => [
            h(BarSeries, { data: twoLayers, options: options.value }),
          ]);
      },
    });

    const wrapper = mount(App, { attachTo: host });
    await settle();
    expect(mainSpy(host).countOf('arcTo')).toBe(0);

    options.value = { cornerRadius: 8 };
    await settle();
    expect(mainSpy(host).countOf('arcTo')).toBeGreaterThan(0);

    wrapper.unmount();
  });

  it('reassigning options with a new curve reaches the renderer (straight → smooth starts curving)', async () => {
    const options = ref<Partial<LineSeriesOptions>>({ curve: 'straight' });
    const App = defineComponent({
      setup() {
        return () =>
          h(ChartContainer, { theme: catppuccin.theme }, () => [
            h(LineSeries, { data: lineData, options: options.value }),
          ]);
      },
    });

    const wrapper = mount(App, { attachTo: host });
    await settle();
    expect(mainSpy(host).countOf('bezierCurveTo')).toBe(0);

    options.value = { curve: 'smooth' };
    await settle();
    expect(mainSpy(host).countOf('bezierCurveTo')).toBeGreaterThan(0);

    wrapper.unmount();
  });
});

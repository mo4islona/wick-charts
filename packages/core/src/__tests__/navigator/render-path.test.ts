// @vitest-environment happy-dom
/**
 * Navigator render-path split: per-frame viewport signals (tickFrame /
 * viewportChange) must only reposition the window DOM — never re-decimate the
 * dataset or repaint the miniature canvas. Full canvas renders (data / theme /
 * options) reuse the memoized decimation while the source array is unchanged,
 * and skip the `canvas.width` backing-store reset when the size didn't move.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChartInstance } from '../../chart';
import { NavigatorController } from '../../navigator/controller';
import { decimateLinear } from '../../navigator/decimate';
import type { NavigatorData } from '../../navigator/types';

vi.mock('../../navigator/decimate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../navigator/decimate')>();

  return {
    decimateLinear: vi.fn(actual.decimateLinear),
    decimateCandles: vi.fn(actual.decimateCandles),
  };
});

const INTERVAL = 60_000;

function installRaf(): { flush: (frames?: number) => void; uninstall: () => void } {
  let nextId = 1;
  let now = 0;
  let queue: Array<{ id: number; cb: FrameRequestCallback }> = [];
  const origRaf = globalThis.requestAnimationFrame;
  const origCancel = globalThis.cancelAnimationFrame;

  globalThis.requestAnimationFrame = (cb: FrameRequestCallback): number => {
    const id = nextId++;
    queue.push({ id, cb });

    return id;
  };
  globalThis.cancelAnimationFrame = (id: number) => {
    queue = queue.filter((f) => f.id !== id);
  };
  const spy = vi.spyOn(performance, 'now').mockImplementation(() => now);

  return {
    flush: (frames = 40) => {
      for (let i = 0; i < frames; i++) {
        if (queue.length === 0) return;

        const pending = queue;
        queue = [];
        now += 16;
        for (const f of pending) {
          f.cb(now);
        }
      }
    },
    uninstall: () => {
      globalThis.requestAnimationFrame = origRaf;
      globalThis.cancelAnimationFrame = origCancel;
      spy.mockRestore();
      queue = [];
    },
  };
}

function seedRect(el: HTMLElement, width: number, height: number): void {
  const rect: DOMRect = {
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    bottom: height,
    right: width,
    width,
    height,
    toJSON: () => ({}),
  };
  el.getBoundingClientRect = () => rect;
  Object.defineProperty(el, 'clientWidth', { value: width, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: height, configurable: true });
}

function linePoints(count: number): NavigatorData {
  return {
    type: 'line',
    points: Array.from({ length: count }, (_, i) => ({ time: 1_000_000 + i * INTERVAL, value: 100 + i })),
  };
}

function setup(): {
  chart: ChartInstance;
  chartContainer: HTMLElement;
  nav: NavigatorController;
  navContainer: HTMLElement;
} {
  const chartContainer = document.createElement('div');
  seedRect(chartContainer, 800, 400);
  document.body.appendChild(chartContainer);

  const chart = new ChartInstance(chartContainer, { interactive: false });
  const id = chart.addSeries('candlestick');
  const candles = Array.from({ length: 100 }, (_, i) => ({
    time: 1_000_000 + i * INTERVAL,
    open: 100,
    high: 105,
    low: 95,
    close: 101,
  }));
  chart.setSeriesData(id, candles);

  const navContainer = document.createElement('div');
  seedRect(navContainer, 800, 60);
  document.body.appendChild(navContainer);
  const nav = new NavigatorController({ container: navContainer, chart, data: linePoints(100) });

  return { chart, chartContainer, nav, navContainer };
}

/** Brush window <div> width — overlay child order is fixed in the controller. */
function windowWidth(navContainer: HTMLElement): number {
  const overlay = navContainer.querySelector('div');
  if (overlay === null) throw new Error('navigator overlay missing');

  const windowEl = overlay.children[2] as HTMLElement;

  return Number.parseFloat(windowEl.style.width) || 0;
}

/** Count assignments to `canvas.width` (each one resets the backing store). */
function countWidthWrites(canvas: HTMLCanvasElement): () => number {
  let proto = Object.getPrototypeOf(canvas);
  let desc: PropertyDescriptor | undefined;
  while (proto !== null && desc === undefined) {
    desc = Object.getOwnPropertyDescriptor(proto, 'width');
    if (desc === undefined) proto = Object.getPrototypeOf(proto);
  }
  if (desc?.get === undefined || desc.set === undefined) throw new Error('canvas width descriptor not found');
  const { get, set } = desc;

  let writes = 0;
  Object.defineProperty(canvas, 'width', {
    configurable: true,
    get() {
      return get.call(canvas);
    },
    set(value: number) {
      writes++;
      set.call(canvas, value);
    },
  });

  return () => writes;
}

describe('navigator render-path split', () => {
  let raf: ReturnType<typeof installRaf>;
  let env: ReturnType<typeof setup>;

  beforeEach(() => {
    raf = installRaf();
    env = setup();
  });

  afterEach(() => {
    env.nav.destroy();
    env.chart.destroy();
    env.chartContainer.remove();
    env.navContainer.remove();
    raf.uninstall();
    vi.mocked(decimateLinear).mockClear();
  });

  it('glides the window on a zoom without re-decimating or repainting the canvas', () => {
    const { chart, navContainer } = env;
    const start = 1_000_000;
    chart.setVisibleRange({ from: start, to: start + 99 * INTERVAL });
    raf.flush(80);

    const wBefore = windowWidth(navContainer);
    const callsBefore = vi.mocked(decimateLinear).mock.calls.length;

    // Gesture zoom — X spring eases, tickFrame/viewportChange fire per frame.
    chart.zoomAt(start + 50 * INTERVAL, 0.3);
    raf.flush(80);

    // The window followed the zoom…
    expect(windowWidth(navContainer)).toBeLessThan(wBefore * 0.6);
    // …but no animation frame touched the decimation / canvas path.
    expect(vi.mocked(decimateLinear).mock.calls.length).toBe(callsBefore);
  });

  it('reuses the memoized decimation on a full render while the data ref is unchanged', () => {
    const { nav } = env;
    raf.flush(80);

    const callsBefore = vi.mocked(decimateLinear).mock.calls.length;
    expect(callsBefore).toBeGreaterThan(0);

    // setOptions queues a *full* canvas render — same data ref, same buckets.
    nav.setOptions({});
    raf.flush(5);
    expect(vi.mocked(decimateLinear).mock.calls.length).toBe(callsBefore);

    // A new data array invalidates the cache.
    nav.setData(linePoints(100));
    raf.flush(5);
    expect(vi.mocked(decimateLinear).mock.calls.length).toBeGreaterThan(callsBefore);
  });

  it('skips the canvas backing-store reset when the size is unchanged', () => {
    const { nav, navContainer } = env;
    raf.flush(80);

    const canvas = navContainer.querySelector('canvas');
    if (canvas === null) throw new Error('navigator canvas missing');
    const widthWrites = countWidthWrites(canvas);

    // Full render with unchanged dimensions — width must not be reassigned.
    nav.setOptions({});
    raf.flush(5);

    expect(widthWrites()).toBe(0);
  });
});

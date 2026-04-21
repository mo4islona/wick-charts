/**
 * End-to-end: construct a ChartInstance with `perf: true`, drive frames through
 * a manual RAF stub, and assert the attached PerfMonitor collected FPS, draw
 * calls, and per-series timing. Also asserts the zero-perf path keeps the
 * render pipeline free of instrumentation.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChartInstance } from '../../chart';
import { PerfMonitor } from '../perf-monitor';

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
    flush(frames = 20) {
      for (let i = 0; i < frames; i++) {
        if (queue.length === 0) return;
        const pending = queue;
        queue = [];
        now += 16;
        for (const f of pending) f.cb(now);
      }
    },
    uninstall() {
      globalThis.requestAnimationFrame = origRaf;
      globalThis.cancelAnimationFrame = origCancel;
      spy.mockRestore();
      queue = [];
    },
  };
}

function makeContainer(): HTMLElement {
  const container = document.createElement('div');
  const rect: DOMRect = {
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    bottom: 400,
    right: 800,
    width: 800,
    height: 400,
    toJSON: () => ({}),
  };
  container.getBoundingClientRect = () => rect;
  Object.defineProperty(container, 'clientWidth', { value: 800, configurable: true });
  Object.defineProperty(container, 'clientHeight', { value: 400, configurable: true });
  document.body.appendChild(container);

  return container;
}

function seedCandles(chart: ChartInstance, count: number): string {
  const id = chart.addCandlestickSeries();
  const data = Array.from({ length: count }, (_, i) => ({
    time: 1_000_000 + i * INTERVAL,
    open: 100,
    high: 105,
    low: 95,
    close: 101,
  }));
  chart.setSeriesData(id, data);

  return id;
}

describe('ChartInstance — perf instrumentation', () => {
  let raf: ReturnType<typeof installRaf>;
  let container: HTMLElement;

  beforeEach(() => {
    raf = installRaf();
    container = makeContainer();
  });

  afterEach(() => {
    container.remove();
    raf.uninstall();
  });

  it('defaults to no monitor when `perf` is omitted', () => {
    const chart = new ChartInstance(container, { interactive: false });
    try {
      expect(chart.getPerfMonitor()).toBeNull();
    } finally {
      chart.destroy();
    }
  });

  it('attaches a PerfMonitor when perf: true and collects frame timing + draw calls', () => {
    const chart = new ChartInstance(container, { perf: { hud: false }, interactive: false });
    try {
      const monitor = chart.getPerfMonitor();
      expect(monitor).not.toBeNull();

      seedCandles(chart, 20);
      raf.flush(5);

      const stats = monitor!.getStats();
      // At least one main frame completed.
      expect(stats.mainFrameMs.p50).toBeGreaterThanOrEqual(0);
      // Candle renderer paints rects — any non-zero draw call count proves the counting Proxy is wired.
      const totalMainDraws = Object.values(stats.drawCalls.main).reduce((a, b) => a + b, 0);
      expect(totalMainDraws).toBeGreaterThan(0);
    } finally {
      chart.destroy();
    }
  });

  it('records per-series timing keyed by series id', () => {
    const chart = new ChartInstance(container, { perf: { hud: false }, interactive: false });
    try {
      const id = seedCandles(chart, 20);
      raf.flush(5);

      const stats = chart.getPerfMonitor()!.getStats();
      expect(stats.perSeries[id]).toBeDefined();
    } finally {
      chart.destroy();
    }
  });

  it('attaches to an externally-supplied PerfMonitor and respects the `hud` flag', () => {
    const external = new PerfMonitor();

    const chart = new ChartInstance(container, { perf: external, interactive: false });
    try {
      expect(chart.getPerfMonitor()).toBe(external);
      // HUD defaults to off when an external monitor is passed — no overlay element in the container.
      expect(container.querySelector('[data-chart-perf-hud]')).toBeNull();
    } finally {
      chart.destroy();
    }
  });

  it('renders the HUD element when perf: true (shorthand)', () => {
    const chart = new ChartInstance(container, { perf: true, interactive: false });
    try {
      expect(container.querySelector('[data-chart-perf-hud]')).not.toBeNull();
    } finally {
      chart.destroy();
      expect(container.querySelector('[data-chart-perf-hud]')).toBeNull();
    }
  });

  it('does not destroy a caller-supplied monitor when the chart is destroyed', () => {
    const external = new PerfMonitor();
    const received: number[] = [];
    const unsubscribe = external.onFrame((stats) => received.push(stats.mainFrameMs.last));

    const chart = new ChartInstance(container, { perf: external, interactive: false });
    chart.destroy();

    // Monitor must still accept frames and fan them out — sharing across charts
    // would break if destroy() wiped listeners / internal state.
    external.recordFrame('main', 5, 100);
    expect(received).toEqual([5]);

    unsubscribe();
    external.destroy();
  });

  it('destroys an internally-created monitor on chart destroy', () => {
    const chart = new ChartInstance(container, { perf: true, interactive: false });
    const internal = chart.getPerfMonitor()!;

    seedCandles(chart, 20);
    raf.flush(5);
    expect(internal.getStats().frameCount.main).toBeGreaterThan(0);

    chart.destroy();

    // PerfMonitor.destroy() resets sample buffers — if the chart didn't call it,
    // frameCount would still reflect the pre-destroy frames.
    expect(internal.getStats().frameCount.main).toBe(0);
  });
});

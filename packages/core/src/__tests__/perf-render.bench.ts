/**
 * Micro-benchmark for the chart render pipeline.
 *
 * Each `bench` entry drives a single canned workload — build a chart, seed
 * data, and run N frames deterministically via a RAF stub — so the numbers
 * reported are the JS cost of our render code under happy-dom (no real
 * rasterizer). That keeps them useful for relative regression tracking even
 * though the absolute ms figures aren't comparable to a real browser.
 *
 * Run with:  `pnpm vitest bench --run packages/core/src/__tests__/perf-render.bench.ts`
 *
 * Baseline comparison is a follow-up — today this just emits timings you can
 * eyeball or feed to `vitest --outputFile`.
 */
// @vitest-environment happy-dom
import { bench, describe } from 'vitest';

import { ChartInstance } from '../chart';
import { PerfMonitor } from '../perf/perf-monitor';

const INTERVAL = 60_000;

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

function installRaf() {
  let nextId = 1;
  let queue: Array<{ id: number; cb: FrameRequestCallback }> = [];
  let now = 0;
  const origRaf = globalThis.requestAnimationFrame;
  const origCancel = globalThis.cancelAnimationFrame;
  globalThis.requestAnimationFrame = (cb) => {
    const id = nextId++;
    queue.push({ id, cb });

    return id;
  };
  globalThis.cancelAnimationFrame = (id) => {
    queue = queue.filter((f) => f.id !== id);
  };

  return {
    flush(frames: number) {
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
      queue = [];
    },
  };
}

function seedCandles(chart: ChartInstance, count: number): void {
  const id = chart.addCandlestickSeries();
  const data = Array.from({ length: count }, (_, i) => ({
    time: 1_000_000 + i * INTERVAL,
    open: 100 + (i % 7),
    high: 110 + (i % 11),
    low: 90 - (i % 5),
    close: 100 + (i % 13),
  }));
  chart.setSeriesData(id, data);
}

function runScenario(candles: number, frames: number, perf: boolean): void {
  const container = makeContainer();
  const raf = installRaf();
  const chart = new ChartInstance(container, {
    interactive: false,
    perf: perf ? new PerfMonitor() : undefined,
  });

  try {
    seedCandles(chart, candles);
    raf.flush(frames);
  } finally {
    chart.destroy();
    raf.uninstall();
    container.remove();
  }
}

describe('candlestick render', () => {
  bench('50 candles x 5 frames — no perf', () => runScenario(50, 5, false));
  bench('50 candles x 5 frames — perf on', () => runScenario(50, 5, true));
  bench('500 candles x 5 frames — no perf', () => runScenario(500, 5, false));
  bench('500 candles x 5 frames — perf on', () => runScenario(500, 5, true));
});

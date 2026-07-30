/**
 * Right-edge padding survives a tick that lands inside the gesture lock-out.
 *
 * The lock-out drops that tick's streaming retarget, but `#prevDataEnd` used
 * to advance anyway — so the offset the next tick recovered from
 * `logical.to - prevDataEnd` came up one bar short, and the tail crept toward
 * the right edge for good. A following wheel event re-pinned it, so a zoom
 * burst ping-ponged the padding between full and short.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChartInstance, type ChartOptions } from '../chart';

const INTERVAL = 60_000;
const PADDING_BARS = 3;

function installClock() {
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
    get now() {
      return now;
    },
    frame: () => {
      now += 16;
      const pending = queue;
      queue = [];
      for (const f of pending) f.cb(now);
    },
    run: (ms: number) => {
      const end = now + ms;
      while (now < end) {
        now += 16;
        const pending = queue;
        queue = [];
        for (const f of pending) f.cb(now);
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

function makeChart(extra: Partial<ChartOptions> = {}): { chart: ChartInstance; container: HTMLElement } {
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

  return { chart: new ChartInstance(container, { interactive: false, ...extra }), container };
}

function seedCandles(chart: ChartInstance, count: number, startTime = 1_000_000): { id: string; lastTime: number } {
  const id = chart.addSeries('candlestick');
  const data = Array.from({ length: count }, (_, i) => ({
    time: startTime + i * INTERVAL,
    open: 100,
    high: 105,
    low: 95,
    close: 101,
  }));
  chart.setSeriesData(id, data);

  return { id, lastTime: startTime + (count - 1) * INTERVAL };
}

describe('X viewport — right-edge padding survives the gesture lock-out', () => {
  let chart: ChartInstance;
  let container: HTMLElement;
  let clock: ReturnType<typeof installClock>;

  beforeEach(() => {
    clock = installClock();
    ({ chart, container } = makeChart());
  });

  afterEach(() => {
    chart.destroy();
    container.remove();
    clock.uninstall();
  });

  it('a tick landing inside the lock-out does not eat a bar of padding', () => {
    const { id, lastTime: seedLast } = seedCandles(chart, 60);
    let lastTime = seedLast;
    const tick = () => {
      lastTime += INTERVAL;
      chart.appendData(id, { time: lastTime, open: 101, high: 106, low: 100, close: 105 });
    };
    const gapBars = () => (chart.getVisibleRange().to - lastTime) / INTERVAL;

    clock.run(500);
    tick();
    clock.run(500);
    expect(gapBars()).toBeCloseTo(PADDING_BARS, 3);

    // One wheel event, then the gesture ends and a tick lands 48 ms later —
    // inside the 100 ms lock-out.
    chart.zoomAt(lastTime, 0.8);
    clock.run(48);
    tick();

    // Subsequent ticks recover the full offset instead of inheriting the loss.
    for (let i = 0; i < 4; i++) {
      clock.run(300);
      tick();
    }

    expect(gapBars()).toBeCloseTo(PADDING_BARS, 3);
  });
});

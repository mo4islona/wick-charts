/**
 * `animations.flowLag` holds the trailing vertex back so the Y axis, which
 * already knows the new value, opens before the line arrives in it.
 *
 * The duration is not fixed: it scales with how far the point jumped on
 * screen, so a calm feed keeps its values live and only a move with real axis
 * travel behind it pays any latency.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChartInstance, type ChartOptions } from '../chart';

const INTERVAL = 60_000;
const HEIGHT = 400;
/** Non-flat so the Y span is real — a degenerate span disables the lag. */
const SEED = [40, 60, 45, 55, 50];

function installRaf() {
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
    flush: (frames = 30) => {
      for (let i = 0; i < frames; i++) {
        if (queue.length === 0) return;
        const pending = queue;
        queue = [];
        now += 16;
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
    bottom: HEIGHT,
    right: 800,
    width: 800,
    height: HEIGHT,
    toJSON: () => ({}),
  };
  container.getBoundingClientRect = () => rect;
  Object.defineProperty(container, 'clientWidth', { value: 800, configurable: true });
  Object.defineProperty(container, 'clientHeight', { value: HEIGHT, configurable: true });
  document.body.appendChild(container);

  return { chart: new ChartInstance(container, { interactive: false, ...extra }), container };
}

/**
 * What the renderer would paint for the trailing vertex right now.
 * `chart.getLastValue` reads the store, so it cannot see the chase — read the
 * renderer's own displayed value the way the streaming-coordination suite does.
 */
function displayedLast(chart: ChartInstance, id: string): number {
  const renderer = chart.listSeriesForTest().find((s) => s.id === id)?.renderer as unknown as {
    displayedLastValues: Array<number | null>;
  };

  return renderer.displayedLastValues[0] ?? Number.NaN;
}

describe('animations.flowLag', () => {
  let chart: ChartInstance;
  let container: HTMLElement;
  let raf: ReturnType<typeof installRaf>;

  beforeEach(() => {
    raf = installRaf();
  });

  afterEach(() => {
    chart.destroy();
    container.remove();
    raf.uninstall();
  });

  /** Append `value`, run one frame, return how much of the move is left. */
  function remainingAfterOneFrame(opts: Partial<ChartOptions>, value: number): number {
    ({ chart, container } = makeChart(opts));
    const id = chart.addSeries('line');
    chart.setSeriesData(
      id,
      SEED.map((v, i) => ({ time: 1_000_000 + i * INTERVAL, value: v })),
    );
    raf.flush(20);

    const from = displayedLast(chart, id);
    chart.appendData(id, { time: 1_000_000 + SEED.length * INTERVAL, value });
    raf.flush(1);

    return Math.abs(displayedLast(chart, id) - value) / Math.abs(from - value);
  }

  it('is off by default — the appended value lands on the frame it arrives', () => {
    expect(remainingAfterOneFrame({}, 10)).toBe(0);
  });

  it('holds the tip back on a large jump, then lands it', () => {
    ({ chart, container } = makeChart({ animations: { flowLag: { maxMs: 400, jumpPx: 60 } } }));
    const id = chart.addSeries('line');
    chart.setSeriesData(
      id,
      SEED.map((v, i) => ({ time: 1_000_000 + i * INTERVAL, value: v })),
    );
    raf.flush(20);

    chart.appendData(id, { time: 1_000_000 + SEED.length * INTERVAL, value: 10 });
    raf.flush(1);

    // Still travelling: short of the new value, past where it started.
    const held = displayedLast(chart, id);
    expect(held).toBeGreaterThan(10);
    expect(held).toBeLessThan(50);

    // `flush` stops early once nothing requests a frame, so drain generously
    // and assert convergence rather than float-exactness.
    raf.flush(200);
    expect(Math.abs(displayedLast(chart, id) - 10)).toBeLessThan(0.01);
  });

  it('scales with the jump — a small step is barely held, a large one is', () => {
    const cfg = { animations: { flowLag: { maxMs: 400, jumpPx: 60 } } };
    const small = remainingAfterOneFrame(cfg, 49);

    chart.destroy();
    container.remove();
    const large = remainingAfterOneFrame(cfg, 10);

    expect(large).toBeGreaterThan(small);
  });
});

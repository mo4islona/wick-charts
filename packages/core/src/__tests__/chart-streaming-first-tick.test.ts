// @vitest-environment happy-dom
/**
 * Regression: the FIRST streaming append after an initial load must ride the
 * cadence-tuned X settle, not the bare floor.
 *
 * The cadence EMA needs two arrivals to measure an inter-arrival gap, so
 * before the fix the first append found `StreamingCadence.#lastWall === 0`,
 * folded nothing, and `pickSettleMs` returned the bare floor
 * (`DEFAULT_X_SETTLE_MS` = 200 ms). The X spring then settled before the next
 * tick — a bell curve that accelerates, peaks, then STOPS — while every later
 * tick rode the EMA-tuned settle and slid continuously. The visible artifact
 * was "stutter on the first point, smooth from the second".
 *
 * The fix seeds the cadence baseline at paint/replace time (`onDataChanged`
 * -> `StreamingCadence.seed`), so the first append already measures a real
 * paint->tick wall gap and its slide spans ~slack x that gap — far longer
 * than the floor.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChartInstance } from '../chart';

const INTERVAL = 1000;

function installRaf(): {
  flush: (frames?: number) => void;
  advance: (ms: number) => void;
  uninstall: () => void;
} {
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
    flush: (frames = 1) => {
      for (let i = 0; i < frames; i++) {
        if (queue.length === 0) return;
        const pending = queue;
        queue = [];
        now += 16;
        for (const f of pending) f.cb(now);
      }
    },
    advance: (ms: number) => {
      now += ms;
    },
    uninstall: () => {
      globalThis.requestAnimationFrame = origRaf;
      globalThis.cancelAnimationFrame = origCancel;
      spy.mockRestore();
      queue = [];
    },
  };
}

function makeChart(): { chart: ChartInstance; container: HTMLElement } {
  const container = document.createElement('div');
  Object.defineProperty(container, 'clientWidth', { value: 800, configurable: true });
  Object.defineProperty(container, 'clientHeight', { value: 400, configurable: true });
  container.getBoundingClientRect = () =>
    ({ x: 0, y: 0, top: 0, left: 0, right: 800, bottom: 400, width: 800, height: 400, toJSON: () => ({}) }) as DOMRect;
  document.body.appendChild(container);
  const chart = new ChartInstance(container, { interactive: false });

  return { chart, container };
}

describe('first streaming tick rides the cadence-tuned settle, not the bare floor', () => {
  let raf: ReturnType<typeof installRaf>;
  let chart: ChartInstance;
  let container: HTMLElement;

  beforeEach(() => {
    raf = installRaf();
    ({ chart, container } = makeChart());
  });

  afterEach(() => {
    chart.destroy();
    container.remove();
    raf.uninstall();
  });

  it('first append slides for far longer than the 200 ms floor would allow', () => {
    const id = chart.addSeries('line');

    // `performance.now()` is mocked to start at 0; advance it first so the
    // cadence baseline is seeded at a non-zero wall time. In a real page
    // `performance.now()` is always > 0 by the time a chart receives data —
    // seeding at exactly 0 would collide with the "no baseline yet" sentinel
    // (`#lastWall > 0`) inside StreamingCadence and read as unseeded.
    raf.advance(10_000);

    chart.setSeriesData(
      id,
      Array.from({ length: 30 }, (_, i) => ({ time: i * INTERVAL, value: 50 + Math.sin(i) * 5 })),
    );

    // Settle the initial paint, then advance wall-clock so the first append
    // lands exactly 1000 ms after the paint-time cadence seed. That gap is
    // the producer cadence the first slide should pick up.
    raf.flush(40);
    raf.advance(1000 - 40 * 16);

    chart.appendData(id, { time: 30 * INTERVAL, value: 60 });

    // Count frames the engine reports as animating. The bare floor (200 ms)
    // settles in ~13 frames; even with the one-shot Y re-fit (~250 ms) the
    // total stays well under 30. The cadence-tuned settle (~3 x 1000 ms)
    // keeps the X spring in flight for ~180 frames, so a threshold of 60
    // cleanly separates the fixed path from the regressed bare-floor path.
    let animatingFrames = 0;
    for (let i = 0; i < 250; i++) {
      if (!chart.getAnimationState().animating) break;

      raf.flush(1);
      animatingFrames += 1;
    }

    expect(animatingFrames).toBeGreaterThan(60);
  });
});

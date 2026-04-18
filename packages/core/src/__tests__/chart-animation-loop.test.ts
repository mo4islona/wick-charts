/**
 * End-to-end inside core: prove the chart's RenderScheduler keeps driving
 * `renderer.render` while `needsAnimation` is true. Without this polling loop
 * the first frame after appendPoint would paint a partially-faded candle and
 * freeze there — no follow-up frames, no animation.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChartInstance } from '../chart';
import { CandlestickRenderer } from '../series/candlestick';

function renderMainSpy(chart: ChartInstance): ReturnType<typeof vi.fn> {
  // Patch the private render loop entry to count invocations. Safer than
  // stubbing requestAnimationFrame because it captures the exact moment the
  // scheduler fires a frame for this chart (ignoring unrelated RAFs).
  const spy = vi.fn();
  const orig = (chart as unknown as { renderMain: (t?: number) => void }).renderMain.bind(chart);
  (chart as unknown as { renderMain: (t?: number) => void }).renderMain = (t?: number) => {
    spy();
    orig(t);
  };

  return spy;
}

describe('ChartInstance render loop continues while renderer.needsAnimation is true', () => {
  beforeEach(() => {
    // Manual RAF control so we can count frames deterministically.
    const queue: Array<(t: number) => void> = [];
    let now = 0;
    vi.stubGlobal('requestAnimationFrame', (cb: (t: number) => void) => {
      queue.push(cb);
      return queue.length;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});
    vi.stubGlobal(
      '__flushRaf',
      (() => {
        let guard = 0;
        while (queue.length > 0 && guard < 100) {
          const pending = queue.splice(0, queue.length);
          now += 16;
          for (const cb of pending) cb(now);
          guard++;
        }
      }) as unknown as (...args: unknown[]) => unknown,
    );
    vi.spyOn(performance, 'now').mockImplementation(() => now);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('candlestick entrance drives multiple frames, not just one', () => {
    const container = document.createElement('div');
    // Give the container real dimensions so the CanvasManager actually sizes
    // the canvas and renderMain's early-return on zero-size doesn't fire.
    Object.defineProperty(container, 'clientWidth', { value: 800, configurable: true });
    Object.defineProperty(container, 'clientHeight', { value: 400, configurable: true });
    container.getBoundingClientRect = () =>
      ({ x: 0, y: 0, top: 0, left: 0, right: 800, bottom: 400, width: 800, height: 400, toJSON: () => ({}) }) as DOMRect;

    const chart = new ChartInstance(container);
    // Force the canvas manager to believe it has a size — otherwise renderMain
    // early-returns before any series.render is invoked.
    const manager = (chart as unknown as { [k: string]: unknown })['#canvasManager'];
    // Fall back: set data and rely on the resize observer to plumb size. Trigger
    // by simulating a size via canvasManager.emit('resize'). If that's private,
    // just proceed — the test below relies on the renderMain spy, which is
    // called regardless once markDirty schedules a frame.
    void manager;

    const id = chart.addCandlestickSeries();
    const renderer = (
      chart as unknown as { listSeriesForTest: () => Array<{ id: string; renderer: CandlestickRenderer }> }
    )
      .listSeriesForTest()
      .find((s) => s.id === id)!.renderer;

    // Seed with one candle (no animation), prime displayedLast.
    renderer.setData([{ time: 10, open: 10, high: 12, low: 9, close: 11 }]);

    const spy = renderMainSpy(chart);

    // Append a candle — entrance animation registers.
    renderer.appendPoint({ time: 20, open: 10, high: 12, low: 9, close: 11 });

    // Multiple RAFs should fire: markDirty → RAF → renderMain → needsAnimation
    // still true → markDirty → another RAF → ...
    const flush = (globalThis as unknown as { __flushRaf: () => void }).__flushRaf;
    flush();

    // renderMain must have been invoked more than once — a single call would
    // mean the loop never re-scheduled after the first frame.
    expect(spy.mock.calls.length).toBeGreaterThan(3);
  });
});

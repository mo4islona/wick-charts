/**
 * Axis DOM-label sync coalescing (double-axis-render fix).
 *
 * `renderMain` emits both `viewportChange` (eased Y moved) and `tickFrame` (any
 * animating frame) within the same frame, and each axis-label manager
 * subscribes to both — so the label sync ran 2× per animating frame. The
 * manager now skips the redundant per-frame `viewportChange` while the viewport
 * is animating (tickFrame drives it) and still syncs on idle commits.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { mountAxisLabels } from '../axis/dom-labels';
import { ChartInstance } from '../chart';

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

// `emit` is protected; tests reach it via cast (the suite uses this elsewhere).
function emit(chart: ChartInstance, event: string): void {
  (chart as unknown as { emit: (e: string) => void }).emit(event);
}

describe('axis DOM labels — per-frame sync coalescing', () => {
  let raf: ReturnType<typeof installRaf>;
  let chart: ChartInstance;
  let chartContainer: HTMLElement;
  let labelContainer: HTMLElement;
  let cleanup: (() => void) | null = null;

  beforeEach(() => {
    raf = installRaf();
    chartContainer = document.createElement('div');
    seedRect(chartContainer, 800, 400);
    document.body.appendChild(chartContainer);
    chart = new ChartInstance(chartContainer, { interactive: false });
    const id = chart.addSeries('candlestick');
    chart.setSeriesData(
      id,
      Array.from({ length: 50 }, (_, i) => ({
        time: 1_000_000 + i * INTERVAL,
        open: 100,
        high: 105,
        low: 95,
        close: 101,
      })),
    );

    labelContainer = document.createElement('div');
    seedRect(labelContainer, 55, 400);
    document.body.appendChild(labelContainer);

    cleanup = mountAxisLabels({ chart, container: labelContainer, axis: 'y' });
    raf.flush(60); // settle the engine so the idle/animating states are clean
  });

  afterEach(() => {
    cleanup?.();
    cleanup = null;
    chart.destroy();
    chartContainer.remove();
    labelContainer.remove();
    raf.uninstall();
  });

  // The y-label sync calls yScale.niceTickValues exactly once per run, and
  // nothing else here does — so it's a faithful per-sync counter.
  it('skips the redundant per-frame viewportChange while the viewport animates', () => {
    chart.zoomAt(1_000_000 + 25 * INTERVAL, 0.3);
    expect(chart.getAnimationState().animating).toBe(true);

    const spy = vi.spyOn(chart.yScale, 'niceTickValues');
    spy.mockClear();

    emit(chart, 'viewportChange'); // redundant during animation — tickFrame drives it
    expect(spy).toHaveBeenCalledTimes(0);

    emit(chart, 'tickFrame'); // the per-frame driver — syncs
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('syncs on viewportChange when the viewport is idle (discrete commits update labels)', () => {
    expect(chart.getAnimationState().animating).toBe(false);

    const spy = vi.spyOn(chart.yScale, 'niceTickValues');
    spy.mockClear();

    emit(chart, 'viewportChange');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('skips the per-tick overlayChange while animating (streaming emits one per data tick)', () => {
    chart.zoomAt(1_000_000 + 25 * INTERVAL, 0.3);
    expect(chart.getAnimationState().animating).toBe(true);

    const spy = vi.spyOn(chart.yScale, 'niceTickValues');
    spy.mockClear();

    emit(chart, 'overlayChange'); // redundant during animation — tickFrame re-reads theme + ticks
    expect(spy).toHaveBeenCalledTimes(0);
  });

  it('syncs on overlayChange at rest (theme / data swaps without a running animation)', () => {
    expect(chart.getAnimationState().animating).toBe(false);

    const spy = vi.spyOn(chart.yScale, 'niceTickValues');
    spy.mockClear();

    emit(chart, 'overlayChange');
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

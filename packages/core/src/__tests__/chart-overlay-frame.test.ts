/**
 * Overlay frame hygiene (#12, remaining half):
 *
 *  1. When the main layer renders, the overlay is painted synchronously on
 *     top and the overlay scheduler's already-queued frame is consumed — the
 *     overlay must not be cleared + repainted twice in the same frame.
 *  2. An empty overlay (no crosshair, no pulse, no edge indicator) skips the
 *     full-bitmap clear entirely; only the painted→empty transition erases.
 *
 * The RAF stub mirrors the HTML spec: `cancelAnimationFrame` from inside an
 * earlier same-frame callback prevents the later callback from running —
 * that's the mechanism `RenderScheduler.consume()` relies on.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChartInstance } from '../chart';
import type { CanvasRecorder } from '../testing/recording-context';

/** `test-setup.ts` attaches a recording spy to every canvas 2D context. */
type SpiedCanvas = HTMLCanvasElement & { __spy?: CanvasRecorder };

const INTERVAL = 60_000;

function installRaf(): { flush: (frames?: number) => void; uninstall: () => void } {
  let nextId = 1;
  let now = 0;
  let queue: Array<{ id: number; cb: FrameRequestCallback }> = [];
  const cancelled = new Set<number>();
  const origRaf = globalThis.requestAnimationFrame;
  const origCancel = globalThis.cancelAnimationFrame;

  globalThis.requestAnimationFrame = (cb: FrameRequestCallback): number => {
    const id = nextId++;
    queue.push({ id, cb });

    return id;
  };
  globalThis.cancelAnimationFrame = (id: number) => {
    queue = queue.filter((f) => f.id !== id);
    cancelled.add(id);
  };
  const spy = vi.spyOn(performance, 'now').mockImplementation(() => now);

  return {
    flush: (frames = 1) => {
      for (let i = 0; i < frames; i++) {
        if (queue.length === 0) return;

        const pending = queue;
        queue = [];
        now += 16;
        for (const f of pending) {
          // Spec-faithful: a callback cancelled by an earlier callback in the
          // same frame must not run (HTML "run the animation frame callbacks"
          // re-checks the map per entry).
          if (cancelled.has(f.id)) continue;

          f.cb(now);
        }
      }
    },
    uninstall: () => {
      globalThis.requestAnimationFrame = origRaf;
      globalThis.cancelAnimationFrame = origCancel;
      spy.mockRestore();
      queue = [];
      cancelled.clear();
    },
  };
}

function makeChart(): { chart: ChartInstance; container: HTMLElement; overlayCanvas: HTMLCanvasElement } {
  const container = document.createElement('div');
  Object.defineProperty(container, 'clientWidth', { value: 800, configurable: true });
  Object.defineProperty(container, 'clientHeight', { value: 400, configurable: true });
  container.getBoundingClientRect = () =>
    ({ x: 0, y: 0, top: 0, left: 0, right: 800, bottom: 400, width: 800, height: 400, toJSON: () => ({}) }) as DOMRect;
  document.body.appendChild(container);

  const chart = new ChartInstance(container, { interactive: false });
  const canvases = container.querySelectorAll('canvas');
  const overlayCanvas = canvases[1] as HTMLCanvasElement;

  return { chart, container, overlayCanvas };
}

function overlayClears(overlayCanvas: HTMLCanvasElement): number {
  const recorder = (overlayCanvas as SpiedCanvas).__spy;
  if (recorder === undefined) throw new Error('recording context not installed');

  return recorder.countOf('clearRect');
}

function resetSpy(overlayCanvas: HTMLCanvasElement): void {
  (overlayCanvas as SpiedCanvas).__spy?.reset();
}

describe('overlay frame hygiene (#12)', () => {
  let raf: ReturnType<typeof installRaf>;
  let chart: ChartInstance;
  let container: HTMLElement;
  let overlayCanvas: HTMLCanvasElement;

  beforeEach(() => {
    raf = installRaf();
    ({ chart, container, overlayCanvas } = makeChart());
  });

  afterEach(() => {
    chart.destroy();
    container.remove();
    raf.uninstall();
  });

  it('paints the overlay once per frame when main + overlay are both dirty', () => {
    const id = chart.addSeries('line');
    chart.setSeriesData(
      id,
      Array.from({ length: 30 }, (_, i) => ({ time: 1_000_000 + i * INTERVAL, value: 50 + Math.sin(i) * 10 })),
    );
    chart.setCrosshair({ time: 1_000_000 + 10 * INTERVAL });
    raf.flush(80); // settle

    // Stream a tick so main + overlay (line pulse) both animate, then let the
    // schedulers reach steady state: renderMain re-arms the main RAF *before*
    // the overlay re-arm, so each frame the main callback fires first and
    // consumes the overlay scheduler's queued duplicate.
    chart.appendData(id, { time: 1_000_000 + 30 * INTERVAL, value: 75 });
    chart.setCrosshair({ time: 1_000_000 + 12 * INTERVAL });
    raf.flush(2);

    resetSpy(overlayCanvas);
    raf.flush(1);

    expect(chart.getAnimationState().animating).toBe(true); // still mid-ease
    expect(overlayClears(overlayCanvas)).toBe(1);
  });

  it('skips the full-bitmap clear on every frame while the overlay is empty', () => {
    const id = chart.addSeries('candlestick');
    chart.setSeriesData(
      id,
      Array.from({ length: 30 }, (_, i) => ({
        time: 1_000_000 + i * INTERVAL,
        open: 100,
        high: 105,
        low: 95,
        close: 101,
      })),
    );
    raf.flush(80); // settle — no crosshair, no pulse, no edge indicator

    resetSpy(overlayCanvas);
    chart.appendData(id, { time: 1_000_000 + 30 * INTERVAL, open: 101, high: 106, low: 100, close: 104 });
    raf.flush(30); // main animates for many frames

    expect(overlayClears(overlayCanvas)).toBe(0);
  });

  it('erases a stale crosshair exactly once on the painted→empty transition', () => {
    const id = chart.addSeries('candlestick');
    chart.setSeriesData(
      id,
      Array.from({ length: 30 }, (_, i) => ({
        time: 1_000_000 + i * INTERVAL,
        open: 100,
        high: 105,
        low: 95,
        close: 101,
      })),
    );
    chart.setCrosshair({ time: 1_000_000 + 10 * INTERVAL });
    raf.flush(80);

    resetSpy(overlayCanvas);
    chart.setCrosshair(null);
    raf.flush(5);
    expect(overlayClears(overlayCanvas)).toBe(1);

    // Subsequent animation frames leave the (already blank) overlay alone.
    chart.appendData(id, { time: 1_000_000 + 30 * INTERVAL, open: 101, high: 106, low: 100, close: 104 });
    raf.flush(30);
    expect(overlayClears(overlayCanvas)).toBe(1);
  });
});

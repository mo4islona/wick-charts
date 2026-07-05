/**
 * End-to-end check that `ChartInstance` actually resolves a real
 * `edgeValueY` / `seriesKind` / `barSpacing` for a custom edge indicator —
 * the unit tests elsewhere inject these resolvers directly, so this is the
 * only place the real composition (`getSeriesIdsByType` + `getDataAtTime` +
 * `yScale.valueToY` + `renderer.kind` + `timeScale.barWidthMedia`) gets
 * exercised against an actual chart.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChartInstance } from '../chart';

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

function makeChart(): { chart: ChartInstance; container: HTMLElement } {
  const container = document.createElement('div');
  Object.defineProperty(container, 'clientWidth', { value: 800, configurable: true });
  Object.defineProperty(container, 'clientHeight', { value: 400, configurable: true });
  container.getBoundingClientRect = () =>
    ({ x: 0, y: 0, top: 0, left: 0, right: 800, bottom: 400, width: 800, height: 400, toJSON: () => ({}) }) as DOMRect;
  document.body.appendChild(container);

  return { chart: new ChartInstance(container, { interactive: false }), container };
}

describe('ChartInstance edge-indicator anchor resolution (integration)', () => {
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

  it('passes real edgeValueY, seriesKind, and barSpacing to a custom edge indicator', () => {
    const id = chart.addSeries('candlestick');
    const data = Array.from({ length: 40 }, (_, i) => ({
      time: 1_000_000 + i * INTERVAL,
      open: 100 + i,
      high: 101 + i,
      low: 99 + i,
      close: 100.5 + i,
    }));
    chart.setSeriesData(id, data);
    raf.flush(5);

    const custom = vi.fn();
    chart.setEdgeIndicator('left', custom);
    chart.setEdgeState('left', 'loading');
    raf.flush(2);

    expect(custom).toHaveBeenCalled();
    const args = custom.mock.calls[0][0];
    expect(args.side).toBe('left');
    expect(args.seriesKind).toBe('candlestick');
    expect(args.edgeValueY).toBeCloseTo(chart.yScale.valueToY(data[0].open));
    expect(args.barSpacing).toBeGreaterThan(0);
  });

  it('resolves no anchor/spacing once the edge indicator is unregistered', () => {
    const id = chart.addSeries('candlestick');
    chart.setSeriesData(
      id,
      Array.from({ length: 10 }, (_, i) => ({
        time: 1_000_000 + i * INTERVAL,
        open: 100,
        high: 101,
        low: 99,
        close: 100.5,
      })),
    );
    raf.flush(5);

    const custom = vi.fn();
    chart.setEdgeIndicator('left', custom);
    chart.setEdgeState('left', 'loading');
    raf.flush(2);
    expect(custom).toHaveBeenCalled();

    chart.setEdgeIndicator('left', null);
    raf.flush(2);
    // Falls back to the built-in spinner — the custom fn stops receiving frames.
    const callsAfterUnregister = custom.mock.calls.length;
    raf.flush(2);
    expect(custom.mock.calls.length).toBe(callsAfterUnregister);
  });
});

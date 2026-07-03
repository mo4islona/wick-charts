/**
 * Crosshair ↔ viewport re-sync — when the viewport moves *under* a
 * stationary crosshair (streaming auto-scroll, programmatic range change),
 * the stored position must not go stale:
 *
 *  - a pointer-anchored crosshair (real hover) keeps its pixel position and
 *    re-resolves `time`/`y`, so the tooltip tracks whatever data slides
 *    under the cursor instead of freezing on the hover-moment values;
 *  - a time-anchored crosshair (`setCrosshair`) keeps its `time`/`y` and
 *    re-projects the pixel position, so it follows its data point across
 *    the screen.
 *
 * Regression for: tooltip stuck at stale values/position while the chart
 * streams past a stationary cursor.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChartInstance } from '../chart';

const INTERVAL = 60_000;
const CHART_WIDTH = 800;
const CHART_HEIGHT = 400;

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
    flush: (frames = 20) => {
      for (let i = 0; i < frames; i++) {
        if (queue.length === 0) return;
        const pending = queue;
        queue = [];
        now += 16;
        for (const frame of pending) {
          frame.cb(now);
        }
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

function makeChart(interactive: boolean): { chart: ChartInstance; container: HTMLElement } {
  const container = document.createElement('div');
  const rect: DOMRect = {
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    bottom: CHART_HEIGHT,
    right: CHART_WIDTH,
    width: CHART_WIDTH,
    height: CHART_HEIGHT,
    toJSON: () => ({}),
  };
  container.getBoundingClientRect = () => rect;
  Object.defineProperty(container, 'clientWidth', { value: CHART_WIDTH, configurable: true });
  Object.defineProperty(container, 'clientHeight', { value: CHART_HEIGHT, configurable: true });
  document.body.appendChild(container);

  return { chart: new ChartInstance(container, { interactive }), container };
}

function seedLine(chart: ChartInstance, count: number): string {
  const id = chart.addSeries('line');
  const data = Array.from({ length: count }, (_, i) => ({
    time: i * INTERVAL,
    value: 100 + (i % 10),
  }));
  chart.setSeriesData(id, data);

  return id;
}

/** Real hover: interactions attach to the top (overlay) canvas. */
function hoverAt(container: HTMLElement, offsetX: number, offsetY: number): void {
  const canvases = container.querySelectorAll('canvas');
  const overlay = canvases[canvases.length - 1];
  const event = new MouseEvent('mousemove', { bubbles: true });
  Object.defineProperty(event, 'offsetX', { value: offsetX });
  Object.defineProperty(event, 'offsetY', { value: offsetY });
  overlay.dispatchEvent(event);
}

describe('crosshair re-sync when the viewport moves beneath it', () => {
  let chart: ChartInstance;
  let container: HTMLElement;
  let raf: ReturnType<typeof installRaf>;

  beforeEach(() => {
    raf = installRaf();
  });

  afterEach(() => {
    chart?.destroy();
    container?.remove();
    raf.uninstall();
  });

  it('pointer-anchored hover keeps its pixel and re-resolves time as streaming slides the viewport', () => {
    ({ chart, container } = makeChart(true));
    const id = seedLine(chart, 50);
    raf.flush(60);
    chart.setVisibleRange({ from: 0, bars: 50 });
    raf.flush(60);

    hoverAt(container, 400, 100);
    const before = chart.getCrosshairPosition();
    expect(before).not.toBeNull();
    if (before === null) return;

    let emits = 0;
    chart.on('crosshairMove', () => {
      emits += 1;
    });

    // Stream new points — the viewport is at the tail, so auto-scroll slides
    // it right while the cursor stays put at x=400.
    for (let i = 0; i < 20; i++) {
      raf.advance(16);
      chart.appendData(id, { time: (50 + i) * INTERVAL, value: 105 });
      raf.flush(2);
    }
    raf.flush(120);

    const after = chart.getCrosshairPosition();
    expect(after).not.toBeNull();
    if (after === null) return;

    // Pixel anchor held, data re-resolved under it.
    expect(after.mediaX).toBe(before.mediaX);
    expect(after.mediaY).toBe(before.mediaY);
    expect(after.time).toBeGreaterThan(before.time);
    expect(after.time).toBeCloseTo(chart.timeScale.xToTime(before.mediaX), 6);
    expect(emits).toBeGreaterThan(0);
  });

  it('time-anchored setCrosshair keeps its time and re-projects the pixel across a range change', () => {
    ({ chart, container } = makeChart(false));
    seedLine(chart, 100);
    raf.flush(60);
    chart.setVisibleRange({ from: 0, bars: 50 });
    raf.flush(60);

    const anchorTime = 25 * INTERVAL;
    chart.setCrosshair({ time: anchorTime, y: 105 });
    const before = chart.getCrosshairPosition();
    expect(before).not.toBeNull();
    if (before === null) return;

    // Shift the window right by 20 bars — the anchored point must slide left.
    chart.setVisibleRange({ from: 20 * INTERVAL, bars: 50 });
    raf.flush(120);

    const after = chart.getCrosshairPosition();
    expect(after).not.toBeNull();
    if (after === null) return;

    expect(after.time).toBe(anchorTime);
    expect(after.y).toBe(105);
    expect(after.mediaX).toBeLessThan(before.mediaX);
    expect(after.mediaX).toBeCloseTo(chart.timeScale.timeToX(anchorTime), 6);
  });

  it('clears a time-anchored crosshair when its time scrolls out of the visible range', () => {
    ({ chart, container } = makeChart(false));
    seedLine(chart, 100);
    raf.flush(60);
    chart.setVisibleRange({ from: 0, bars: 50 });
    raf.flush(60);

    chart.setCrosshair({ time: 5 * INTERVAL, y: 105 });
    expect(chart.getCrosshairPosition()).not.toBeNull();

    const emitted: Array<unknown> = [];
    chart.on('crosshairMove', (pos) => {
      emitted.push(pos);
    });

    // Scroll far right — the anchored time exits the window. Mid-animation
    // frames may re-project the still-visible point; the final emit must
    // clear it (mirroring pointer-leave), not pin it off-screen.
    chart.setVisibleRange({ from: 40 * INTERVAL, bars: 50 });
    raf.flush(120);

    expect(chart.getCrosshairPosition()).toBeNull();
    expect(emitted.length).toBeGreaterThan(0);
    expect(emitted[emitted.length - 1]).toBeNull();
  });

  it('does not emit when the viewport holds still', () => {
    ({ chart, container } = makeChart(true));
    const id = seedLine(chart, 100);
    raf.flush(60);

    // Park the window away from the tail so appends can't auto-scroll it.
    chart.setVisibleRange({ from: 0, bars: 30 });
    raf.flush(120);

    hoverAt(container, 400, 100);

    let emits = 0;
    chart.on('crosshairMove', () => {
      emits += 1;
    });

    // Appends land outside the parked window — no viewport movement, so the
    // re-derived crosshair is bit-identical and must not re-emit.
    for (let i = 0; i < 5; i++) {
      raf.advance(16);
      chart.appendData(id, { time: (100 + i) * INTERVAL, value: 105 });
      raf.flush(2);
    }
    raf.flush(120);

    expect(emits).toBe(0);
  });
});

/**
 * Cursor-anchored zoom in historical mode: after the user pans the live
 * tail off-screen (autoScroll = false), `chart.zoomAt(cursorTime, factor)`
 * must anchor the new window around `cursorTime` instead of pinning the
 * right edge. The sticky-follow override only kicks in when autoScroll is
 * on — that case is covered separately by `chart-zoom-sticky-autoscroll`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChartInstance, type ChartOptions } from '../chart';

const INTERVAL = 60_000;

function installRaf(): { uninstall: () => void } {
  let nextId = 1;
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

  const spy = vi.spyOn(performance, 'now').mockImplementation(() => 0);

  return {
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

describe('ChartInstance.zoomAt — cursor-anchored when autoScroll=false', () => {
  let chart: ChartInstance;
  let container: HTMLElement;
  let raf: ReturnType<typeof installRaf>;

  beforeEach(() => {
    raf = installRaf();
    ({ chart, container } = makeChart());
  });

  afterEach(() => {
    chart.destroy();
    container.remove();
    raf.uninstall();
  });

  it('zoom-in in historical mode centers the new window around the cursor', () => {
    seedCandles(chart, 200);

    // Pan the data tail off-screen but stay clear of the hard-clamp
    // boundary so the cursor anchor can be preserved during zoom. A pan
    // that bottoms out at `newTo = dataStart` would force the post-zoom
    // clamp to shift the window and break the cursor-ratio contract.
    chart.pan(-30 * INTERVAL, 800);
    expect(chart.getAutoScroll()).toBe(false);

    const { from: fromBefore, to: toBefore } = chart.getVisibleRange();
    const cursorTime = fromBefore + (toBefore - fromBefore) * 0.3;
    const spanBefore = toBefore - fromBefore;

    chart.zoomAt(cursorTime, 0.5);

    const { from, to } = chart.getVisibleRange();
    const span = to - from;

    // Window contracted (zoom-in).
    expect(span).toBeLessThan(spanBefore);
    // Cursor stays anchored at the same proportional position within the new range.
    const ratioBefore = (cursorTime - fromBefore) / spanBefore;
    const ratioAfter = (cursorTime - from) / span;
    expect(ratioAfter).toBeCloseTo(ratioBefore, 5);
    // Right edge no longer pinned to the previous `to`.
    expect(to).toBeLessThan(toBefore);
    // autoScroll stays off (zoom is not allowed to re-engage live tail).
    expect(chart.getAutoScroll()).toBe(false);
  });

  it('zoom-in with cursor on the historical right edge naturally keeps to ≈ previous to', () => {
    seedCandles(chart, 200);
    chart.pan(-30 * INTERVAL, 800);
    expect(chart.getAutoScroll()).toBe(false);

    const { to: toBefore } = chart.getVisibleRange();

    chart.zoomAt(toBefore, 0.5);

    const { to } = chart.getVisibleRange();
    // Without an explicit guardrail: when cursor sits at the right edge,
    // the anchor math itself keeps `to` in place.
    expect(to).toBeCloseTo(toBefore, -1);
  });
});

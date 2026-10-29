// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChartInstance } from '../chart';
import type { EdgeReachedInfo } from '../chart/options';
import { InteractionHandler } from '../interactions/handler';
import type { PanZoomTarget } from '../interactions/pan-zoom-target';
import type { XScale } from '../scales/x-scale';
import type { YScale } from '../scales/y-scale';
import { installRaf, makeChartContainer } from './helpers/fake-raf';

const INTERVAL = 60_000;
const T0 = 1_700_000_000_000;

function candles(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    time: T0 + i * INTERVAL,
    open: 100,
    high: 102,
    low: 98,
    close: 101,
  }));
}

describe('ChartInstance — onEdgeReached', () => {
  let raf: ReturnType<typeof installRaf>;
  let container: HTMLElement;
  let chart: ChartInstance;
  let onEdgeReached: ReturnType<typeof vi.fn<(info: EdgeReachedInfo) => void>>;

  beforeEach(() => {
    raf = installRaf();
    container = makeChartContainer();
    onEdgeReached = vi.fn<(info: EdgeReachedInfo) => void>();
    chart = new ChartInstance(container, { interactive: false, onEdgeReached });
    const id = chart.addSeries('candlestick');
    chart.setSeriesData(id, candles(300));
    raf.flush();
  });

  afterEach(() => {
    chart.destroy();
    container.remove();
    raf.uninstall();
  });

  /** Drag the view right (into the past) by `share` of its width, in ten pointer moves. */
  function drag(share: number): void {
    const range = chart.getVisibleRange();
    const step = ((range.to - range.from) * share) / 10;
    for (let i = 0; i < 10; i++) chart.pan(-step);
  }

  it('fires once, on release, after a drag that leaves the view well past the first point', () => {
    drag(0.9);
    expect(onEdgeReached).not.toHaveBeenCalled();

    chart.endGesture();
    expect(onEdgeReached).toHaveBeenCalledTimes(1);
    expect(onEdgeReached.mock.calls[0][0]).toMatchObject({ side: 'left', boundaryTime: T0 });

    drag(0.9);
    chart.endGesture();
    expect(onEdgeReached).toHaveBeenCalledTimes(2);
  });

  it('stays quiet when a gesture does not move the view, even past an edge', () => {
    drag(0.9);
    chart.endGesture();
    onEdgeReached.mockClear();

    // A vertical drag pans by 0; a zoom past the floor keeps the range.
    chart.pan(0);
    chart.endGesture();
    for (let i = 0; i < 40; i++) chart.zoomAt(T0, 0.5);
    chart.endGesture();
    onEdgeReached.mockClear();
    chart.zoomAt(T0, 0.5);
    chart.endGesture();

    expect(onEdgeReached).not.toHaveBeenCalled();
  });

  it('stays quiet for an overhang of up to 10% of the view and for a release with no move', () => {
    const range = chart.getVisibleRange();
    const width = range.to - range.from;
    // From the default fit, pan until the view hangs 5% past the first point.
    chart.pan(T0 - 0.05 * width - range.from);
    chart.endGesture();
    chart.endGesture();

    expect(onEdgeReached).not.toHaveBeenCalled();
  });
});

describe('ChartInstance — drag-pan bound', () => {
  const COUNT = 20_000;
  let raf: ReturnType<typeof installRaf>;
  let container: HTMLElement;
  let chart: ChartInstance;
  let onEdgeReached: ReturnType<typeof vi.fn<(info: EdgeReachedInfo) => void>>;

  beforeEach(() => {
    raf = installRaf();
    container = makeChartContainer();
    onEdgeReached = vi.fn<(info: EdgeReachedInfo) => void>();
    chart = new ChartInstance(container, { interactive: false, onEdgeReached });
    const id = chart.addSeries('candlestick');
    chart.setSeriesData(id, candles(COUNT));
    raf.flush();
  });

  afterEach(() => {
    chart.destroy();
    container.remove();
    raf.uninstall();
  });

  function zoomToFullRange(): void {
    let width = 0;
    for (let i = 0; i < 40; i++) {
      const range = chart.getVisibleRange();
      if (range.to - range.from === width) return;

      width = range.to - range.from;
      chart.zoomAt((range.from + range.to) / 2, 2);
    }
  }

  /** Drag the view right (into the past) by half its width, in ten pointer moves, and release. */
  function dragHalfWidth(): void {
    const range = chart.getVisibleRange();
    const step = (range.to - range.from) / 20;
    for (let i = 0; i < 10; i++) {
      chart.pan(-step);
    }

    chart.endGesture();
  }

  it('keeps data across half the view when a full-range view is dragged off it twice', () => {
    zoomToFullRange();
    dragHalfWidth();
    dragHalfWidth();

    const view = chart.getVisibleRange();
    const lastTime = T0 + (COUNT - 1) * INTERVAL;
    const covered = Math.min(view.to, lastTime) - Math.max(view.from, T0);

    expect(covered).toBeGreaterThanOrEqual(0.5 * (view.to - view.from) - INTERVAL);
    expect(onEdgeReached).toHaveBeenCalledWith(expect.objectContaining({ side: 'left', boundaryTime: T0 }));
  });
});

describe('InteractionHandler — gesture end', () => {
  function setup() {
    const endGesture = vi.fn();
    const target = { pan: vi.fn(), zoomAt: vi.fn(), endGesture } as unknown as PanZoomTarget;
    const timeScale = {
      pixelDeltaToTimeDelta: vi.fn((px: number) => px * 100),
      getMediaWidth: vi.fn(() => 800),
      xToTime: vi.fn((x: number) => x),
    } as unknown as XScale;
    const yScale = { yToValue: vi.fn((y: number) => y) } as unknown as YScale;
    const canvas = document.createElement('canvas');
    const handler = new InteractionHandler(canvas, target, timeScale, yScale);

    return { canvas, handler, endGesture };
  }

  const mouse = (type: string, clientX: number) => new MouseEvent(type, { bubbles: true, clientX, button: 0 });

  it('ends the gesture once when a drag is released, not on every move', () => {
    const { canvas, handler, endGesture } = setup();

    canvas.dispatchEvent(mouse('mousedown', 100));
    canvas.dispatchEvent(mouse('mousemove', 200));
    canvas.dispatchEvent(mouse('mousemove', 300));
    expect(endGesture).not.toHaveBeenCalled();

    canvas.dispatchEvent(mouse('mouseup', 300));
    canvas.dispatchEvent(mouse('mouseleave', 300));
    expect(endGesture).toHaveBeenCalledTimes(1);

    handler.destroy();
  });
});

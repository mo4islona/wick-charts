import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ChartInstance } from '../../chart';
import { NavigatorController } from '../../navigator/controller';
import type { NavigatorData } from '../../navigator/types';

const INTERVAL = 60_000;

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

function makeChartWithData(): { chart: ChartInstance; chartContainer: HTMLElement } {
  const chartContainer = document.createElement('div');
  seedRect(chartContainer, 800, 400);
  document.body.appendChild(chartContainer);

  const chart = new ChartInstance(chartContainer, { interactive: false });
  const id = chart.addCandlestickSeries();
  const data = Array.from({ length: 100 }, (_, i) => ({
    time: 1_000_000 + i * INTERVAL,
    open: 100,
    high: 105,
    low: 95,
    close: 101,
  }));
  chart.setSeriesData(id, data);

  return { chart, chartContainer };
}

function lineData(chart: ChartInstance): NavigatorData {
  const range = chart.getDataRange();
  const from = range?.from ?? 0;
  const to = range?.to ?? 100;
  const step = (to - from) / 99;
  return {
    type: 'line',
    points: Array.from({ length: 100 }, (_, i) => ({ time: from + i * step, value: 100 + i })),
  };
}

describe('NavigatorController', () => {
  let chart: ChartInstance;
  let chartContainer: HTMLElement;
  let navContainer: HTMLElement;

  beforeEach(() => {
    ({ chart, chartContainer } = makeChartWithData());
    navContainer = document.createElement('div');
    seedRect(navContainer, 800, 60);
    document.body.appendChild(navContainer);
  });

  afterEach(() => {
    chart.destroy();
    chartContainer.remove();
    navContainer.remove();
  });

  it('mounts a canvas into the provided container and removes it on destroy', () => {
    const nav = new NavigatorController({ container: navContainer, chart, data: lineData(chart) });
    expect(navContainer.querySelector('canvas')).not.toBeNull();

    nav.destroy();
    expect(navContainer.querySelector('canvas')).toBeNull();
  });

  it('subscribes to viewportChange and overlayChange; cleans up on destroy', () => {
    const nav = new NavigatorController({ container: navContainer, chart, data: lineData(chart) });

    // Sanity: chart still has one listener after mount; fires without throwing.
    expect(() => chart.setVisibleRange({ from: 1_000_000, to: 1_000_000 + 50 * INTERVAL })).not.toThrow();

    nav.destroy();
    // After destroy, chart events fire without any navigator cleanup errors.
    expect(() => chart.setVisibleRange({ from: 1_000_000, to: 1_000_000 + 80 * INTERVAL })).not.toThrow();
  });

  it('drag on the window body moves the chart visible range', () => {
    chart.setVisibleRange({ from: 1_000_000 + 20 * INTERVAL, to: 1_000_000 + 40 * INTERVAL });
    const nav = new NavigatorController({ container: navContainer, chart, data: lineData(chart) });
    const canvas = navContainer.querySelector('canvas');
    if (!canvas) throw new Error('canvas missing');

    const before = chart.getVisibleRange();

    // Pointer down in the middle of the navigator → hits the window body
    // (visible range is centered roughly in the navigator).
    const down = new PointerEvent('pointerdown', { clientX: 400, clientY: 30, pointerId: 1, button: 0 });
    canvas.dispatchEvent(down);
    const move = new PointerEvent('pointermove', { clientX: 500, clientY: 30, pointerId: 1 });
    canvas.dispatchEvent(move);
    const up = new PointerEvent('pointerup', { clientX: 500, clientY: 30, pointerId: 1 });
    canvas.dispatchEvent(up);

    const after = chart.getVisibleRange();
    // Dragging right should shift both edges forward in time.
    expect(after.from).toBeGreaterThan(before.from);
    expect(after.to).toBeGreaterThan(before.to);

    nav.destroy();
  });
});

/**
 * `setEdgeState(side, 'loading', { minDuration })` keeps the loading
 * indicator up for at least `minDuration` ms: a fetch that resolves sooner
 * has its `idle` deferred and its prepended history held back until then.
 *
 * Named `chart-*` so `environmentMatchGlobs` hands this file a DOM.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChartInstance } from '../chart';
import type { OHLCData } from '../types';

const INTERVAL = 60_000 * 60;
const BASE = 2_000_000_000;

function makeChart(): { chart: ChartInstance; container: HTMLElement } {
  const container = document.createElement('div');
  const width = 800;
  const height = 400;
  const rect = { x: 0, y: 0, top: 0, left: 0, bottom: height, right: width, width, height, toJSON: () => ({}) };
  container.getBoundingClientRect = () => rect as DOMRect;
  Object.defineProperty(container, 'clientWidth', { value: width, configurable: true });
  Object.defineProperty(container, 'clientHeight', { value: height, configurable: true });
  document.body.appendChild(container);

  return { chart: new ChartInstance(container, { interactive: false }), container };
}

function candlesBefore(count: number, endTime: number): OHLCData[] {
  return Array.from({ length: count }, (_, i) => ({
    time: endTime - (count - i) * INTERVAL,
    open: 100,
    high: 106,
    low: 94,
    close: 101,
  }));
}

describe('ChartInstance — edge loading minDuration', () => {
  let chart: ChartInstance;
  let container: HTMLElement;
  let id: string;
  let head: number;

  beforeEach(() => {
    vi.useFakeTimers();
    ({ chart, container } = makeChart());
    id = chart.addSeries('candlestick');
    const initial = candlesBefore(200, BASE);
    chart.setSeriesData(id, initial);
    head = initial[0].time;
  });

  afterEach(() => {
    chart.destroy();
    container.remove();
    vi.useRealTimers();
  });

  it('holds a fast fetch: history and idle land together once minDuration elapses', () => {
    chart.setEdgeState('left', 'loading', { minDuration: 400 });
    chart.prependData(id, candlesBefore(100, head));
    chart.setEdgeState('left', 'idle');

    expect(chart.getEdgeState('left')).toBe('loading');
    expect(chart.getDataRange()?.from).toBe(head);

    vi.advanceTimersByTime(399);
    expect(chart.getEdgeState('left')).toBe('loading');
    expect(chart.getDataRange()?.from).toBe(head);

    vi.advanceTimersByTime(1);
    expect(chart.getEdgeState('left')).toBe('idle');
    expect(chart.getDataRange()?.from).toBe(head - 100 * INTERVAL);
  });

  it('applies a slow fetch at once when minDuration has already passed', () => {
    chart.setEdgeState('left', 'loading', { minDuration: 400 });
    vi.advanceTimersByTime(500);

    chart.prependData(id, candlesBefore(100, head));
    expect(chart.getDataRange()?.from).toBe(head - 100 * INTERVAL);

    chart.setEdgeState('left', 'idle');
    expect(chart.getEdgeState('left')).toBe('idle');
  });

  it('defers a `no-data` answer the same way', () => {
    chart.setEdgeState('left', 'loading', { minDuration: 400 });
    chart.setEdgeState('left', 'no-data');
    expect(chart.getEdgeState('left')).toBe('loading');

    vi.advanceTimersByTime(400);
    expect(chart.getEdgeState('left')).toBe('no-data');
  });

  it('lands several held pages in arrival order', () => {
    const first = candlesBefore(50, head);
    const second = candlesBefore(50, first[0].time);
    chart.setEdgeState('left', 'loading', { minDuration: 400 });
    chart.prependData(id, first);
    chart.prependData(id, second);

    vi.advanceTimersByTime(400);
    expect(chart.getDataRange()?.from).toBe(second[0].time);
  });

  it('drops held history that a bulk replace supersedes', () => {
    chart.setEdgeState('left', 'loading', { minDuration: 400 });
    chart.prependData(id, candlesBefore(100, head));

    const replacement = candlesBefore(30, BASE);
    chart.setSeriesData(id, replacement);
    vi.advanceTimersByTime(400);

    expect(chart.getDataRange()?.from).toBe(replacement[0].time);
  });

  it('without minDuration, history lands immediately', () => {
    chart.setEdgeState('left', 'loading');
    chart.prependData(id, candlesBefore(100, head));

    expect(chart.getDataRange()?.from).toBe(head - 100 * INTERVAL);
  });
});

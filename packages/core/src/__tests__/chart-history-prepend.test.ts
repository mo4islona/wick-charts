/**
 * Integration regression for REVIEW.md #18 — "prepending history snaps the
 * whole viewport instead of staying stable".
 *
 * Drives ChartInstance through the real {@link syncSeriesLayer} reconciler (the
 * exact path the React/Vue/Svelte wrappers take on a `data` prop change) and
 * asserts that a large history prepend — the EdgeLoader "load 100 older
 * candles" pattern — keeps the visible window and the data tail put instead of
 * re-fitting the now-larger span and snapping both axes.
 *
 * Named `chart-*` so `environmentMatchGlobs` hands this file a DOM.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ChartInstance } from '../chart';
import { EMPTY_SYNC_STATE, type SeriesSyncState, syncSeriesLayer } from '../data/sync';
import type { OHLCData } from '../types';

const INTERVAL = 60_000 * 60; // 1-hour candles, matching the load-on-scroll demo.

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

/** A run of candles ending at (but excluding) `endTime`, walking backwards. */
function candlesBefore(count: number, endTime: number): OHLCData[] {
  return Array.from({ length: count }, (_, i) => ({
    time: endTime - (count - i) * INTERVAL,
    open: 100,
    high: 106,
    low: 94,
    close: 101,
  }));
}

describe('ChartInstance — history prepend keeps the viewport stable (REVIEW #18)', () => {
  let chart: ChartInstance;
  let container: HTMLElement;

  beforeEach(() => {
    ({ chart, container } = makeChart());
  });

  afterEach(() => {
    chart.destroy();
    container.remove();
  });

  it('a 100-candle prepend leaves the visible window and data tail put (no re-fit snap)', () => {
    const id = chart.addSeries('candlestick');
    const base = 2_000_000_000;
    const initial = candlesBefore(200, base + 200 * INTERVAL);
    let sync: SeriesSyncState = syncSeriesLayer({ chart, id, data: initial, prev: EMPTY_SYNC_STATE });

    // Zoom to the last 60 bars — the demo's InitialZoom. Tail stays visible.
    chart.setVisibleRange(60);
    const before = chart.getVisibleRange();
    const dataTailBefore = chart.getDataRange()?.to;

    // EdgeLoader fires: prepend 100 older candles ahead of the existing head.
    const head = initial[0];
    const older = candlesBefore(100, head.time);
    const grown = [...older, ...initial];
    sync = syncSeriesLayer({ chart, id, data: grown, prev: sync });

    const after = chart.getVisibleRange();

    // The visible window must not move — same candles are on screen.
    expect(after.from).toBeCloseTo(before.from, -1);
    expect(after.to).toBeCloseTo(before.to, -1);
    // The tail is unchanged; only the front of the buffer grew.
    expect(chart.getDataRange()?.to).toBeCloseTo(dataTailBefore ?? Number.NaN, -1);
    expect(chart.getDataRange()?.from).toBeLessThan(before.from);
    // The prepend actually landed (200 → 300 candles).
    expect(sync.len).toBe(300);
  });

  it('prepend keeps the window put even after the user pans away from the tail (autoscroll off)', () => {
    const id = chart.addSeries('candlestick');
    const base = 2_000_000_000;
    const initial = candlesBefore(200, base + 200 * INTERVAL);
    let sync: SeriesSyncState = syncSeriesLayer({ chart, id, data: initial, prev: EMPTY_SYNC_STATE });

    chart.setVisibleRange(60);
    // Pan left toward the history edge — leaves the live tail, autoscroll off.
    chart.pan(-80 * INTERVAL);
    const before = chart.getVisibleRange();

    const head = initial[0];
    const grown = [...candlesBefore(100, head.time), ...initial];
    sync = syncSeriesLayer({ chart, id, data: grown, prev: sync });

    const after = chart.getVisibleRange();

    expect(after.from).toBeCloseTo(before.from, -1);
    expect(after.to).toBeCloseTo(before.to, -1);
    expect(sync.len).toBe(300);
  });
});

/**
 * Integration regressions for the data-prop reconciler against a real chart:
 * a commit that edits the last point while it appends the next one, and a
 * same-length data swap that is not a one-point rolling slide.
 *
 * Named `chart-*` so `environmentMatchGlobs` hands this file a DOM.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ChartInstance } from '../chart';
import { EMPTY_SYNC_STATE, syncLayers, syncSeriesLayer } from '../data/sync';
import type { OHLCData, TimePoint } from '../types';

const H = 3_600_000;
const T0 = 1_700_000_000_000;

function makeChart(): { chart: ChartInstance; container: HTMLElement } {
  const container = document.createElement('div');
  const rect = { x: 0, y: 0, top: 0, left: 0, bottom: 400, right: 800, width: 800, height: 400, toJSON: () => ({}) };
  container.getBoundingClientRect = () => rect as DOMRect;
  Object.defineProperty(container, 'clientWidth', { value: 800, configurable: true });
  Object.defineProperty(container, 'clientHeight', { value: 400, configurable: true });
  document.body.appendChild(container);

  return { chart: new ChartInstance(container, { interactive: false }), container };
}

function days(start: number, count: number): TimePoint[] {
  return Array.from({ length: count }, (_, i) => ({ time: start + i * 24 * H, value: start / H + i }));
}

describe('data-prop reconciler — edits that ride an append or a window swap', () => {
  let chart: ChartInstance;
  let container: HTMLElement;

  beforeEach(() => {
    ({ chart, container } = makeChart());
  });

  afterEach(() => {
    chart.destroy();
    container.remove();
  });

  it('closing the last candle and opening the next one in one commit keeps the closed values', () => {
    const id = chart.addSeries('candlestick');
    const first: OHLCData[] = [
      { time: T0, open: 100, high: 110, low: 95, close: 105 },
      { time: T0 + H, open: 105, high: 108, low: 104, close: 106 },
    ];
    let state = syncSeriesLayer({ chart, id, data: first, prev: EMPTY_SYNC_STATE });

    const next: OHLCData[] = [
      first[0],
      { ...first[1], high: 130, low: 90, close: 128 },
      { time: T0 + 2 * H, open: 128, high: 131, low: 120, close: 122 },
    ];
    state = syncSeriesLayer({ chart, id, data: next, prev: state });

    expect(chart.getDataAtTime(id, T0 + H)).toMatchObject({ high: 130, low: 90, close: 128 });
    expect(chart.getDataAtTime(id, T0 + 2 * H)).toMatchObject({ close: 122 });
  });

  it('a same-length window from another date range replaces every point', () => {
    const id = chart.addSeries('line');
    const a = days(T0, 100);
    const b = days(T0 + 182 * 24 * H, 100);
    const state = syncLayers({ chart, id, data: a, prev: [] });

    syncLayers({ chart, id, data: b, prev: state });

    expect(chart.getDataAtTime(id, b[0].time)).toMatchObject({ time: b[0].time, value: b[0].value });
    expect(chart.getDataAtTime(id, b[50].time)).toMatchObject({ time: b[50].time, value: b[50].value });
    expect(chart.getDataRange()).toEqual({ from: b[0].time, to: b[99].time });
  });
});

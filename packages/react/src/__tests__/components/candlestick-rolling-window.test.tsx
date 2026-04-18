import type { OHLCData } from '@wick-charts/core';
import { CandlestickSeries, TimeAxis, YAxis } from '@wick-charts/react';
import { describe, expect, it } from 'vitest';

import { mountChart } from '../helpers/mount-chart';

/**
 * Regression test for the streaming + maxPoints gap bug.
 *
 * Before the fix, <CandlestickSeries> treated "same length, different
 * contents" as "just update the last candle", so a rolling-window stream
 * (new bar appended while the oldest is dropped) left the store with stale
 * middle bars and only the final bar moved. The rendered chart showed a
 * dense historical cluster on the left, a huge empty gap, and a single
 * "live" candle far to the right.
 *
 * These tests drive the rolling-window pattern directly and assert the
 * store's contents through the chart's public data API.
 */

const INTERVAL = 5_000;

function makeBars(startTime: number, count: number): OHLCData[] {
  return Array.from({ length: count }, (_, i) => {
    const time = startTime + i * INTERVAL;
    const base = 100 + i;
    return { time, open: base, high: base + 1, low: base - 1, close: base + 0.5, volume: 10 };
  });
}

describe('CandlestickSeries rolling-window updates', () => {
  it('full-replaces when the array shifts (rolling window, constant length)', () => {
    const T0 = 1_000_000;
    const initial = makeBars(T0, 10);
    let seriesId = '';
    const mounted = mountChart(
      <>
        <CandlestickSeries data={initial} onSeriesId={(id) => (seriesId = id)} />
        <YAxis />
        <TimeAxis />
      </>,
      { width: 400, height: 200 },
    );
    mounted.flushScheduler();

    // Sanity: middle bar of the initial window lives at T0 + 5*INTERVAL with
    // value 100+5.
    const middleTime = T0 + 5 * INTERVAL;
    expect(mounted.chart.getDataAtTime(seriesId, middleTime)?.time).toBe(middleTime);

    // Simulate one rolling-window step: drop the oldest bar, append a new
    // one 10 intervals ahead. Length stays at 10.
    const shifted = [
      ...initial.slice(1),
      { time: T0 + 10 * INTERVAL, open: 200, high: 201, low: 199, close: 200, volume: 10 },
    ];
    expect(shifted.length).toBe(initial.length);

    mounted.rerender(
      <>
        <CandlestickSeries data={shifted} onSeriesId={(id) => (seriesId = id)} />
        <YAxis />
        <TimeAxis />
      </>,
    );
    mounted.flushScheduler();

    // The new tail must be the appended bar.
    expect(mounted.chart.getLastData(seriesId)?.time).toBe(T0 + 10 * INTERVAL);
    // Every surviving shifted-in timestamp must resolve to its correct bar.
    // The pre-fix bug left stale bars at their OLD slots — so the bar that
    // was originally `close=101.5` at T0+5*INTERVAL would still be there
    // instead of the bar that belongs to T0+5*INTERVAL in the shifted array.
    for (let i = 0; i < shifted.length; i++) {
      const expected = shifted[i];
      const found = mounted.chart.getDataAtTime(seriesId, expected.time) as OHLCData | null;
      expect(found?.time).toBe(expected.time);
      expect(found?.close).toBe(expected.close);
    }

    mounted.unmount();
  });

  it('updates in place when length and first timestamp are unchanged', () => {
    const T0 = 2_000_000;
    const initial = makeBars(T0, 6);
    let seriesId = '';
    const mounted = mountChart(
      <>
        <CandlestickSeries data={initial} onSeriesId={(id) => (seriesId = id)} />
        <YAxis />
        <TimeAxis />
      </>,
      { width: 400, height: 200 },
    );
    mounted.flushScheduler();

    const originalLast = initial[initial.length - 1];
    expect((mounted.chart.getLastData(seriesId) as OHLCData | null)?.close).toBe(originalLast.close);

    // Mutate only the last bar's close price — array length and first time
    // don't change, so this is a true in-place update.
    const updated = [...initial.slice(0, -1), { ...originalLast, close: originalLast.close + 42 }];
    mounted.rerender(
      <>
        <CandlestickSeries data={updated} onSeriesId={(id) => (seriesId = id)} />
        <YAxis />
        <TimeAxis />
      </>,
    );
    mounted.flushScheduler();

    expect((mounted.chart.getLastData(seriesId) as OHLCData | null)?.close).toBe(originalLast.close + 42);
    // Middle bar must stay put.
    expect(mounted.chart.getDataAtTime(seriesId, T0 + 3 * INTERVAL)?.time).toBe(T0 + 3 * INTERVAL);

    mounted.unmount();
  });

  it('appends when a new bar is added without dropping any', () => {
    const T0 = 3_000_000;
    const initial = makeBars(T0, 8);
    let seriesId = '';
    const mounted = mountChart(
      <>
        <CandlestickSeries data={initial} onSeriesId={(id) => (seriesId = id)} />
        <YAxis />
        <TimeAxis />
      </>,
      { width: 400, height: 200 },
    );
    mounted.flushScheduler();

    const extended = [...initial, { time: T0 + 8 * INTERVAL, open: 300, high: 301, low: 299, close: 300, volume: 10 }];
    mounted.rerender(
      <>
        <CandlestickSeries data={extended} onSeriesId={(id) => (seriesId = id)} />
        <YAxis />
        <TimeAxis />
      </>,
    );
    mounted.flushScheduler();

    expect(mounted.chart.getLastData(seriesId)?.time).toBe(T0 + 8 * INTERVAL);
    // Every previous bar must still be present at its original slot.
    for (let i = 0; i < 8; i++) {
      const t = T0 + i * INTERVAL;
      expect(mounted.chart.getDataAtTime(seriesId, t)?.time).toBe(t);
    }

    mounted.unmount();
  });
});

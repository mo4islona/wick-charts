import { BarSeries, CandlestickSeries, HeatmapSeries, LineSeries, PieSeries } from '@wick-charts/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { mountChart } from '../helpers/mount-chart';

/**
 * Series components used to gate their `updateSeriesOptions` effect on a
 * hand-maintained list of individual option fields. A field missing from that
 * list (e.g. `pulseMs`) silently never re-applied; a tuple/array field (e.g.
 * candlestick `up.body`) needed a bespoke `join(',')` collapse to avoid
 * re-applying on every render just because the caller passed a
 * fresh-but-equal literal.
 *
 * `useStableOptions` replaces all of that with one structural diff. These
 * tests assert both halves of the contract generically, across series kinds:
 * a same-value inline literal must not re-apply, and a genuine value change
 * must.
 */
describe('generic options-diff (useStableOptions)', () => {
  let mounted: ReturnType<typeof mountChart> | null = null;

  afterEach(() => {
    mounted?.unmount();
    mounted = null;
  });

  const lineData = [
    [
      { time: 1, value: 10 },
      { time: 2, value: 40 },
      { time: 3, value: 20 },
    ],
  ];
  const candles = [
    { time: 1, open: 10, high: 15, low: 8, close: 12 },
    { time: 2, open: 12, high: 18, low: 11, close: 16 },
  ];
  const cells = [
    { x: 'a', y: '1', value: 5 },
    { x: 'b', y: '1', value: 9 },
  ];
  const slices = [
    { label: 'a', value: 5 },
    { label: 'b', value: 9 },
  ];

  it('LineSeries: a same-value inline options literal does not re-apply, a real change does', () => {
    mounted = mountChart(<LineSeries id="line" data={lineData} options={{ pulse: true, pulseMs: 1000 }} />);
    mounted.flushScheduler();

    const spy = vi.spyOn(mounted.chart, 'updateSeriesOptions');
    // Fresh object literal every rerender, same values — must not re-apply.
    mounted.rerender(<LineSeries id="line" data={lineData} options={{ pulse: true, pulseMs: 1000 }} />);
    expect(spy).not.toHaveBeenCalled();

    // A genuine change to a field with no dedicated dep-list entry (pulseMs).
    mounted.rerender(<LineSeries id="line" data={lineData} options={{ pulse: true, pulseMs: 2000 }} />);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('CandlestickSeries: a fresh-but-equal `up.body` tuple does not re-apply', () => {
    const upColors = (body: [string, string]) => ({ up: { body, wick: '#111' } });

    mounted = mountChart(<CandlestickSeries id="ohlc" data={candles} options={upColors(['#111', '#222'])} />);
    mounted.flushScheduler();

    const spy = vi.spyOn(mounted.chart, 'updateSeriesOptions');
    // New array reference, identical contents.
    mounted.rerender(<CandlestickSeries id="ohlc" data={candles} options={upColors(['#111', '#222'])} />);
    expect(spy).not.toHaveBeenCalled();

    mounted.rerender(<CandlestickSeries id="ohlc" data={candles} options={upColors(['#111', '#333'])} />);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('BarSeries: same-value inline options literal does not re-apply', () => {
    mounted = mountChart(<BarSeries id="bar" data={lineData} options={{ cornerRadius: 4 }} />);
    mounted.flushScheduler();

    const spy = vi.spyOn(mounted.chart, 'updateSeriesOptions');
    mounted.rerender(<BarSeries id="bar" data={lineData} options={{ cornerRadius: 4 }} />);
    expect(spy).not.toHaveBeenCalled();

    mounted.rerender(<BarSeries id="bar" data={lineData} options={{ cornerRadius: 10 }} />);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('HeatmapSeries: fresh-but-equal `colors`/`columns`/`rows` arrays do not re-apply', () => {
    mounted = mountChart(
      <HeatmapSeries id="hm" data={cells} options={{ colors: ['#000', '#fff'], columns: ['a', 'b'] }} />,
    );
    mounted.flushScheduler();

    const spy = vi.spyOn(mounted.chart, 'updateSeriesOptions');
    mounted.rerender(
      <HeatmapSeries id="hm" data={cells} options={{ colors: ['#000', '#fff'], columns: ['a', 'b'] }} />,
    );
    expect(spy).not.toHaveBeenCalled();

    mounted.rerender(
      <HeatmapSeries id="hm" data={cells} options={{ colors: ['#000', '#f00'], columns: ['a', 'b'] }} />,
    );
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('PieSeries: fresh-but-equal `sliceLabels` object does not re-apply', () => {
    mounted = mountChart(<PieSeries id="pie" data={slices} options={{ sliceLabels: { mode: 'outside' } }} />);
    mounted.flushScheduler();

    const spy = vi.spyOn(mounted.chart, 'updateSeriesOptions');
    mounted.rerender(<PieSeries id="pie" data={slices} options={{ sliceLabels: { mode: 'outside' } }} />);
    expect(spy).not.toHaveBeenCalled();

    mounted.rerender(<PieSeries id="pie" data={slices} options={{ sliceLabels: { mode: 'inside' } }} />);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

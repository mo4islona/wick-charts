import { StrictMode } from 'react';

import { afterEach, describe, expect, it } from 'vitest';

import { CandlestickSeries, LineSeries } from '../../index';
import { mountChart } from '../helpers/mount-chart';

const MINUTE = 60_000;
const T0 = Date.UTC(2026, 0, 1);
const CANDLES = Array.from({ length: 300 }, (_, i) => ({
  time: T0 + i * MINUTE,
  open: 100,
  high: 102 + (i % 5),
  low: 98 - (i % 3),
  close: 101,
}));
const LINE = CANDLES.map(({ time, close }) => ({ time, value: close }));

function visibleBars(mounted: ReturnType<typeof mountChart>): number {
  const range = mounted.chart.getVisibleRange();

  return (range.to - range.from) / MINUTE;
}

describe('viewport.initialRange', () => {
  let mounted: ReturnType<typeof mountChart> | null = null;
  afterEach(() => {
    mounted?.unmount();
    mounted = null;
  });

  it('survives the StrictMode effect re-run that sets the data again', () => {
    mounted = mountChart(
      <StrictMode>
        <CandlestickSeries data={CANDLES} />
      </StrictMode>,
      { viewport: { initialRange: 50 } },
    );
    mounted.flushScheduler();

    expect(visibleBars(mounted)).toBeGreaterThanOrEqual(50);
    expect(visibleBars(mounted)).toBeLessThan(55);
  });

  it('survives a second series loading its data', () => {
    mounted = mountChart(
      <>
        <CandlestickSeries data={CANDLES} />
        <LineSeries data={LINE} />
      </>,
      { viewport: { initialRange: 50 } },
    );
    mounted.flushScheduler();

    expect(visibleBars(mounted)).toBeGreaterThanOrEqual(50);
    expect(visibleBars(mounted)).toBeLessThan(55);
  });

  it('shows a range of days on a monthly and a daily series, the monthly one declared first', () => {
    const DAY = 86_400_000;
    const monthly = Array.from({ length: 36 }, (_, i) => ({ time: Date.UTC(2020, i, 1), value: 4 + (i % 6) }));
    const daily = Array.from({ length: 3 * 365 }, (_, i) => ({ time: Date.UTC(2020, 0, 1) + i * DAY, value: 1 }));
    const from = Date.UTC(2021, 5, 25);
    const to = Date.UTC(2021, 6, 12);

    mounted = mountChart(
      <>
        <LineSeries data={monthly} />
        <LineSeries data={daily} />
      </>,
      { viewport: { initialRange: { from, to } } },
    );
    mounted.flushScheduler();

    expect(mounted.chart.getVisibleRange()).toEqual({ from, to });
  });
});

import { CandlestickSeries, Legend } from '@wick-charts/react';
import { afterEach, describe, expect, it } from 'vitest';

import { mountChart } from '../helpers/mount-chart';

/**
 * Regression #1 (commit be01d6b): series registration moved from useEffect
 * to useLayoutEffect so Legend can pick up the series before first paint.
 * Previously Legend rendered empty on first paint, then appeared on the next
 * frame, shifting the chart layout downward.
 *
 * The contract this test locks in: by the time mountChart returns (after the
 * first commit + RAF flush), the Legend DOM already contains one entry per
 * registered series.
 */
describe('mount layout sync (regression #1)', () => {
  let mounted: ReturnType<typeof mountChart> | null = null;

  afterEach(() => {
    mounted?.unmount();
    mounted = null;
  });

  const data = [
    { time: 1, open: 10, high: 12, low: 9, close: 11 },
    { time: 2, open: 11, high: 13, low: 10, close: 12 },
    { time: 3, open: 12, high: 14, low: 11, close: 13 },
  ];

  it('Legend picks up series registered by sibling useLayoutEffect before first paint', () => {
    mounted = mountChart(
      <>
        <CandlestickSeries data={data} />
        <Legend />
      </>,
    );

    // Legend DOM is rendered and carries one item matching the registered series.
    const legend = mounted.container.querySelector('[data-legend]');
    expect(legend).not.toBeNull();
    // Exactly one legend item (candlestick is single-layer → default label "Series").
    const items = legend?.querySelectorAll('[data-legend] > div');
    expect(items?.length).toBe(1);
  });

  it('series is registered in ChartInstance before the first render completes', () => {
    mounted = mountChart(<CandlestickSeries data={data} />);

    const ids = mounted.chart.getSeriesIds();
    expect(ids).toHaveLength(1);
    // Renderer drew on initial mount — sequence starts with clearRect from renderMain().
    expect(mounted.mainSpy.countOf('clearRect')).toBeGreaterThanOrEqual(1);
    expect(mounted.mainSpy.countOf('fillRect')).toBeGreaterThan(0);
  });

  it('adding a series after mount emits seriesChange and Legend updates', () => {
    mounted = mountChart(
      <>
        <CandlestickSeries data={data} />
        <Legend />
      </>,
    );

    const before = mounted.container.querySelectorAll('[data-legend] > div').length;
    expect(before).toBe(1);

    // Rerender with an extra series.
    mounted.rerender(
      <>
        <CandlestickSeries data={data} id="a" />
        <CandlestickSeries data={data} id="b" />
        <Legend />
      </>,
    );

    const after = mounted.container.querySelectorAll('[data-legend] > div').length;
    expect(after).toBe(2);
  });
});

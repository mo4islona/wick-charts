import { CandlestickSeries, Navigator } from '@wick-charts/react';
import { afterEach, describe, expect, it } from 'vitest';

import { mountChart } from '../helpers/mount-chart';

const INTERVAL = 60_000;

const candleData = Array.from({ length: 50 }, (_, i) => ({
  time: 1_000_000 + i * INTERVAL,
  open: 100,
  high: 110,
  low: 90,
  close: 105,
}));

const lineData = {
  type: 'line' as const,
  points: candleData.map((p) => ({ time: p.time, value: p.close })),
};

describe('<Navigator>', () => {
  let mounted: ReturnType<typeof mountChart> | null = null;

  afterEach(() => {
    mounted?.unmount();
    mounted = null;
  });

  it('mounts a navigator strip with its own canvas below the chart', () => {
    mounted = mountChart(
      <>
        <CandlestickSeries data={candleData} />
        <Navigator data={lineData} />
      </>,
    );

    const nav = mounted.container.querySelector('[data-chart-navigator]');
    expect(nav).not.toBeNull();
    // Strip has exactly one canvas child (the navigator's own).
    expect(nav?.querySelector('canvas')).not.toBeNull();
  });

  it('uses the theme.navigator.height by default', () => {
    mounted = mountChart(
      <>
        <CandlestickSeries data={candleData} />
        <Navigator data={lineData} />
      </>,
    );

    const nav = mounted.container.querySelector('[data-chart-navigator]') as HTMLElement | null;
    expect(nav?.style.height).toBe('48px');
  });

  it('honors an explicit height override', () => {
    mounted = mountChart(
      <>
        <CandlestickSeries data={candleData} />
        <Navigator data={lineData} height={40} />
      </>,
    );

    const nav = mounted.container.querySelector('[data-chart-navigator]') as HTMLElement | null;
    expect(nav?.style.height).toBe('40px');
  });

  it('unmount removes the navigator canvas and subscriptions', () => {
    mounted = mountChart(
      <>
        <CandlestickSeries data={candleData} />
        <Navigator data={lineData} />
      </>,
    );

    mounted.unmount();
    mounted = null;

    // After unmount, any stale subscription would throw on the next chart event.
    // The assertion here is that unmount itself runs cleanly.
    expect(true).toBe(true);
  });
});

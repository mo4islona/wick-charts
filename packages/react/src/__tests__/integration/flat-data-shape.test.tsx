import { BarSeries, LineSeries } from '@wick-charts/react';
import { afterEach, describe, expect, it } from 'vitest';

import { mountChart } from '../helpers/mount-chart';

/**
 * DOGFOODING §6: line/bar `data` accepts a flat single-layer array, not only
 * the layered `TimePoint[][]` form. A flat array must normalize to ONE layer —
 * if it were mis-read as one layer per point, every layer would hold a single
 * point and `renderOff` would skip it (needs ≥2 points), drawing no line.
 */
describe('flat single-series data shape (DOGFOODING §6)', () => {
  let mounted: ReturnType<typeof mountChart> | null = null;

  afterEach(() => {
    mounted?.unmount();
    mounted = null;
  });

  const base = 1_700_000_000_000;
  const flat = [
    { time: base, value: 10 },
    { time: base + 60_000, value: 20 },
    { time: base + 120_000, value: 15 },
    { time: base + 180_000, value: 25 },
  ];

  it('LineSeries draws the flat array as one connected line', () => {
    mounted = mountChart(<LineSeries data={flat} options={{ area: { visible: false } }} />);

    const segments = mounted.mainSpy.calls.filter((c) => c.method === 'lineTo');
    expect(segments.length).toBeGreaterThan(0);
  });

  it('flat array and its `[flat]` layered equivalent draw identically', () => {
    const flatDraws = mountChart(<LineSeries data={flat} options={{ pulse: false }} />);
    const flatLineTo = flatDraws.mainSpy.calls.filter((c) => c.method === 'lineTo').length;
    flatDraws.unmount();

    const nestedDraws = mountChart(<LineSeries data={[flat]} options={{ pulse: false }} />);
    const nestedLineTo = nestedDraws.mainSpy.calls.filter((c) => c.method === 'lineTo').length;
    nestedDraws.unmount();

    expect(flatLineTo).toBe(nestedLineTo);
    expect(flatLineTo).toBeGreaterThan(0);
  });

  it('BarSeries accepts the flat array too', () => {
    mounted = mountChart(<BarSeries data={flat} />);

    // One bar per point → at least as many fills as points.
    const fills = mounted.mainSpy.calls.filter((c) => c.method === 'fill' || c.method === 'fillRect');
    expect(fills.length).toBeGreaterThan(0);
  });
});

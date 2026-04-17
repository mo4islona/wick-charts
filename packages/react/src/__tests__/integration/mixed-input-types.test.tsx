import { CandlestickSeries, LineSeries } from '@wick-charts/react';
import { afterEach, describe, expect, it } from 'vitest';

import { mountChart } from '../helpers/mount-chart';

/**
 * Regression #4 (commit 2dbd2f4): the old normalizer only inspected `data[0]`
 * to decide whether to convert Date→number, so a Date anywhere else leaked
 * through and rendered at NaN. Unit coverage lives in `renderers/normalization`;
 * these tests exercise the full React prop path so the fix can't silently
 * regress for either LineSeries (TimePointInput) or CandlestickSeries (OHLCInput).
 */
describe('mixed Date/number input normalization (regression #4)', () => {
  let mounted: ReturnType<typeof mountChart> | null = null;

  afterEach(() => {
    mounted?.unmount();
    mounted = null;
  });

  it('LineSeries with Date only at a middle index renders with finite coords', () => {
    const base = 1_700_000_000_000;
    const data: Array<{ time: number | Date; value: number }>[] = [
      [
        { time: base, value: 10 },
        { time: new Date(base + 1_000), value: 20 }, // Date in the middle
        { time: base + 2_000, value: 30 },
        { time: base + 3_000, value: 40 },
      ],
    ];
    // Cast through `as never` so TS accepts the union in the array-of-arrays position.
    mounted = mountChart(<LineSeries data={data as never} />);

    const calls = mounted.mainSpy.calls.filter((c) => c.method === 'moveTo' || c.method === 'lineTo');
    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) {
      expect(Number.isFinite(c.args[0] as number)).toBe(true);
      expect(Number.isFinite(c.args[1] as number)).toBe(true);
    }
  });

  it('CandlestickSeries with Date only at the last index renders with finite coords', () => {
    const base = 1_700_000_000_000;
    mounted = mountChart(
      <CandlestickSeries
        data={[
          { time: base, open: 100, high: 102, low: 99, close: 101 },
          { time: base + 1_000, open: 101, high: 103, low: 100, close: 102 },
          { time: new Date(base + 2_000), open: 102, high: 104, low: 101, close: 103 }, // Date at end
        ]}
      />,
    );

    const fills = mounted.mainSpy.callsOf('fillRect');
    expect(fills.length).toBeGreaterThan(0);
    for (const c of fills) {
      expect(Number.isFinite(c.args[0] as number)).toBe(true);
    }
  });

  it('all-Date input also renders correctly (common with Date.now() users)', () => {
    const base = 1_700_000_000_000;
    mounted = mountChart(
      <CandlestickSeries
        data={[
          { time: new Date(base), open: 100, high: 102, low: 99, close: 101 },
          { time: new Date(base + 1_000), open: 101, high: 103, low: 100, close: 102 },
          { time: new Date(base + 2_000), open: 102, high: 104, low: 101, close: 103 },
        ]}
      />,
    );

    const fills = mounted.mainSpy.callsOf('fillRect');
    expect(fills.length).toBeGreaterThan(0);
    for (const c of fills) {
      expect(Number.isFinite(c.args[0] as number)).toBe(true);
    }
  });
});
